"""Single-shot Linux executor. Scheduling/remote provisioning are intentionally absent."""
import contextlib
import contextvars
import datetime as dt
import json
import os
from pathlib import Path
import signal
import shutil
import tempfile
import time
import uuid

ACTIVE = contextvars.ContextVar("backup_execution", default=None)
LOCK_KEY = (731929, 1)
TERMINAL = {"succeeded", "failed", "interrupted", "verified_monitor_failed"}


class ExecutionError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def checkpoint(phase=None, **fields):
    execution = ACTIVE.get()
    if execution:
        execution.check(force=phase is not None)
        if phase:
            if phase == "storage_verified": execution.storage_verified = True
            execution.record("running", phase=phase, **fields)


class Journal:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)

    def write(self, record):
        # Only explicit metadata created by the executor, never raw exceptions,
        # connection strings, record contents or credential values.
        allowed = {"runId", "state", "phase", "at", "code", "sha256", "bytes", "storageVerified", "previousRunId", "scratchCleaned"}
        if set(record) - allowed:
            raise ExecutionError("journal_field_refused")
        target = self.root / (record["runId"] + ".json")
        temporary = self.root / (record["runId"] + ".tmp")
        with open(temporary, "w", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump(record, stream, sort_keys=True)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, target)
        directory_fd = os.open(self.root, os.O_RDONLY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)

    def recover_unfinished(self):
        recovered = []
        # Caller owns BOTH locks. No concurrent writer may own this directory.
        for file in self.root.glob("*.json"):
            try: previous = json.loads(file.read_text(encoding="utf-8"))
            except (ValueError, OSError): raise ExecutionError("journal_corrupt_requires_review") from None
            try:
                if str(uuid.UUID(previous["runId"])) + ".json" != file.name:
                    raise ValueError()
                if previous["state"] not in TERMINAL:
                    storage_verified = bool(previous.get("storageVerified"))
                    previous.update(state="interrupted", code="previous_execution_not_completed", at=now())
                    previous["storageVerified"] = storage_verified
                    self.write(previous)
                if previous["state"] == "interrupted" and not previous.get("scratchCleaned"):
                    recovered.append(previous["runId"])
            except (KeyError, ValueError): raise ExecutionError("journal_invalid_requires_review") from None
        return recovered

    def scratch_cleaned(self, run_ids):
        for run_id in run_ids:
            previous = json.loads((self.root / (run_id + ".json")).read_text(encoding="utf-8"))
            previous["scratchCleaned"] = True
            self.write(previous)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def clean_interrupted_scratch(run_ids):
    # Only directories tied to abandoned journal run IDs, while both locks are
    # held. Never inspect data contents or follow links outside the scratch root.
    root = Path(tempfile.gettempdir()).resolve()
    if root == Path("/"): raise ExecutionError("unsafe_scratch_root")
    count = 0
    for run_id in run_ids:
        canonical = str(uuid.UUID(run_id))
        for child in root.glob("secretaria-backup-" + canonical + "-*"):
            if child.is_symlink() or not child.is_dir() or child.resolve().parent != root or child.stat().st_uid != os.getuid():
                raise ExecutionError("scratch_cleanup_requires_review")
            shutil.rmtree(child)
            count += 1
    return count


class Lease:
    def __init__(self, state_dir):
        self.state_dir = Path(state_dir)
        self.connection = None
        self.file = None

    def __enter__(self):
        import fcntl
        import backup as b
        try:
            self.state_dir.mkdir(parents=True, mode=0o700, exist_ok=True)
            self.file = os.open(self.state_dir / ".executor.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
            try: fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise ExecutionError("backup_already_running") from None
            self.connection = b.pg_connect(lease=True)
            self.connection.autocommit = True
            owned = self.connection.execute("SELECT pg_try_advisory_lock(%s,%s)", LOCK_KEY).fetchone()[0]
            if not owned:
                raise ExecutionError("backup_already_running")
            return self
        except BaseException:
            self.close()
            raise

    def check(self):
        try:
            # No reconnect: losing this connection loses the session lock.
            self.connection.execute("SELECT 1").fetchone()
        except Exception: raise ExecutionError("backup_lease_lost") from None

    def close(self):
        if self.connection is not None:
            self.connection.close(); self.connection = None
        if self.file is not None:
            os.close(self.file); self.file = None

    def __exit__(self, *_): self.close()


class Execution:
    def __init__(self, journal, lease, timeout):
        self.run_id = str(uuid.uuid4())
        self.journal, self.lease = journal, lease
        self.deadline = time.monotonic() + timeout
        self.last_lease_check = 0
        self.interrupted = False
        self.storage_verified = False
        self.last_phase = "starting"

    def check(self, force=False):
        if self.interrupted: raise ExecutionError("backup_interrupted")
        if time.monotonic() >= self.deadline: raise ExecutionError("backup_deadline_exceeded")
        if force or time.monotonic() - self.last_lease_check >= 1:
            self.lease.check()
            self.last_lease_check = time.monotonic()

    def record(self, state, **fields):
        if fields.get("phase"): self.last_phase = fields["phase"]
        record = {"runId": self.run_id, "state": state, "phase": self.last_phase, "at": now(),
                  "storageVerified": self.storage_verified, **fields}
        self.journal.write(record)


@contextlib.contextmanager
def signals(execution, timeout):
    old = {sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM)}
    def interrupted(sig, _):
        execution.interrupted = sig != signal.SIGALRM
        raise ExecutionError("backup_deadline_exceeded" if sig == signal.SIGALRM else "backup_interrupted")
    for sig in old: signal.signal(sig, interrupted)
    old_timer = signal.setitimer(signal.ITIMER_REAL, timeout)
    try: yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        for sig, handler in old.items(): signal.signal(sig, handler)
        if old_timer[0]: signal.setitimer(signal.ITIMER_REAL, *old_timer)


def credential_policy(mode, today=None):
    value = os.environ.get("BACKUP_R2_CREDENTIAL_EXPIRES_ON", "")
    if not value:
        if mode == "real": raise ExecutionError("credential_expiry_date_required")
        return None
    try: expiry = dt.date.fromisoformat(value)
    except ValueError: raise ExecutionError("invalid_credential_expiry_date") from None
    remaining = (expiry - (today or dt.datetime.now(dt.timezone.utc).date())).days
    if remaining <= 0: raise ExecutionError("r2_credential_expired_or_due")
    return "r2_credential_expiring_soon" if remaining <= 14 else None


def execute(mode, store, notify, state_dir, *, timeout=1500, operation=None, authorize_real=False):
    import backup as b
    if b.config(authorize=authorize_real) != mode: raise ExecutionError("execution_mode_mismatch")
    warning = credential_policy(mode)
    with Lease(state_dir) as lease:
        journal = Journal(state_dir)
        recovered = journal.recover_unfinished()
        cleaned = clean_interrupted_scratch(recovered)
        journal.scratch_cleaned(recovered)
        execution = Execution(journal, lease, timeout)
        token = ACTIVE.set(execution)
        failure_reported = False
        print(json.dumps({"event": "backup_started", "runId": execution.run_id, "recoveredInterruptedRuns": len(recovered), "cleanedInterruptedScratch": cleaned, "warning": warning}), flush=True)
        execution.record("running")
        def monitored(event, run_id, capture_mode):
            nonlocal failure_reported
            if event == "fail": failure_reported = True
            if event == "success":
                execution.check(force=True)
                execution.storage_verified = True
                execution.record("running", phase="notifying_success")
            return notify(event, run_id, capture_mode)
        try:
            with signals(execution, timeout):
                execution.check(force=True)
                result = (operation or b.capture)(mode, store, monitored, run_id=execution.run_id)
                execution.check(force=True)
                if not execution.storage_verified:
                    raise ExecutionError("capture_success_not_verified")
                execution.record("succeeded", phase="complete", sha256=result["sha256"], bytes=result["bytes"])
                print(json.dumps({"event": "backup_succeeded", "runId": execution.run_id, "sha256": result["sha256"], "bytes": result["bytes"]}), flush=True)
                return result
        except BaseException as error:
            if not failure_reported:
                try: monitored("fail", execution.run_id, mode)
                except Exception: pass  # External missed-success watchdog remains authoritative.
            interrupted = execution.interrupted or isinstance(error, (KeyboardInterrupt, SystemExit))
            state = "interrupted" if interrupted else "verified_monitor_failed" if execution.storage_verified else "failed"
            code = error.code if isinstance(error, ExecutionError) else str(error) if isinstance(error, b.BackupError) else "unexpected_error_sanitized"
            execution.record(state, code=code)
            print(json.dumps({"event": "backup_" + state, "runId": execution.run_id, "code": code, "storageVerified": execution.storage_verified}), flush=True)
            raise
        finally:
            ACTIVE.reset(token)
