"""Standalone backup preparation. Default: plan only, no I/O with data sources.

No dotenv, Railway API, app imports, WhatsApp transport or cloud provisioning.
Capture of real data additionally requires an explicit CLI acknowledgement and
the reference of a future, specific user authorization. None exists at delivery.
"""
import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
from executor import ACTIVE, ExecutionError, checkpoint


class BackupError(Exception):
    """Only fixed, non-sensitive error codes may reach the status output."""


def require(ok, code):
    if not ok:
        raise BackupError(code)


def run(args, *, env=None, stdout=None, timeout=900):
    process = None
    completed = False
    try:
        checkpoint()
        process = subprocess.Popen(args, env=env, stdout=stdout or subprocess.PIPE,
                                   stderr=subprocess.PIPE, start_new_session=True)
        deadline = time.monotonic() + timeout
        while True:
            checkpoint()
            if time.monotonic() >= deadline: raise BackupError("tool_unavailable_or_timeout")
            try:
                output, _ = process.communicate(timeout=0.25)
                completed = True
                break
            except subprocess.TimeoutExpired: pass
    except (OSError, subprocess.TimeoutExpired):
        raise BackupError("tool_unavailable_or_timeout") from None
    finally:
        if process is not None and not completed:
            # Stop the whole child group, including a tool's subprocesses.
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.communicate()
    require(process.returncode == 0, "tool_failed")
    return output


def tool_env(prefixes=()):
    # A credential supplied to one tool is not inherited by unrelated tools.
    names = {"PATH", "HOME", "LANG", "LD_LIBRARY_PATH"}
    return {k: v for k, v in os.environ.items()
            if k in names or any(k.startswith(p) for p in prefixes)}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def json_write(path, data):
    path.write_text(json.dumps(data, sort_keys=True, separators=(",", ":")), encoding="utf-8")


def config(authorize=False):
    mode = os.environ.get("BACKUP_MODE", "fixture")
    require(mode in ("fixture", "real"), "invalid_mode")
    if mode == "fixture":
        require(os.environ.get("PGHOST") == "pg-test" and
                os.environ.get("PGDATABASE") == "secretaria_backup_test" and
                os.environ.get("BACKUP_REDIS_HOST") == "redis-test", "fixture_target_refused")
    else:
        require(authorize and bool(os.environ.get("BACKUP_APPROVAL_REFERENCE")), "real_data_not_authorized")
        require(os.environ.get("PGHOST", "").endswith(".railway.internal") and
                os.environ.get("BACKUP_REDIS_HOST", "").endswith(".railway.internal"), "private_network_required")
        require(os.environ.get("BACKUP_REDIS_DEDICATED_INSTANCE_ACK") == "yes", "whole_redis_instance_not_acknowledged")
        require(os.environ.get("PGSSLMODE") == "verify-full" and
                os.environ.get("BACKUP_REDIS_TLS") == "yes", "verified_tls_required")
        require(int(os.environ.get("BACKUP_REDIS_SOURCE_MEMORY_LIMIT_BYTES", "0")) > 0, "redis_memory_budget_required")
    for key in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD", "BACKUP_REDIS_HOST", "REDISCLI_AUTH", "BACKUP_AGE_RECIPIENT"):
        require(bool(os.environ.get(key)), "missing_capture_configuration")
    require(re.fullmatch(r"age1[0-9a-z]{58}", os.environ["BACKUP_AGE_RECIPIENT"]) is not None, "invalid_age_recipient")
    return mode


def pg_connect(database=None, lease=False):
    import psycopg
    extra = dict(keepalives=1, keepalives_idle=5, keepalives_interval=1, keepalives_count=2,
                 tcp_user_timeout=5000, options="-c statement_timeout=3000") if lease else {}
    return psycopg.connect(dbname=database or os.environ["PGDATABASE"], connect_timeout=10, **extra)


def pg_manifest(conn):
    from psycopg import sql
    conn.execute("SET LOCAL timezone='UTC'")
    conn.execute("SET LOCAL datestyle='ISO, YMD'")
    result = {}
    tables = conn.execute("""SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' ORDER BY 1,2""").fetchall()
    for schema, table in tables:
        checkpoint()
        h, count = hashlib.sha256(), 0
        with conn.cursor(name="backup_rows_" + uuid.uuid4().hex) as rows:
            rows.execute(sql.SQL("SELECT to_jsonb(t)::text FROM {}.{} t ORDER BY to_jsonb(t)::text COLLATE \"C\"").format(
                sql.Identifier(schema), sql.Identifier(table)))
            for (row,) in rows:
                encoded = row.encode("utf-8")
                h.update(len(encoded).to_bytes(8, "big")); h.update(encoded)
                count += 1
                if count % 1000 == 0: checkpoint()
        result[schema + "." + table] = {"rows": count, "sha256": h.hexdigest()}
    return result


def capture_postgres(directory):
    with pg_connect() as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        conn.execute("SET LOCAL statement_timeout='120s'")
        snapshot = conn.execute("SELECT pg_export_snapshot()").fetchone()[0]
        snapshot_at = conn.execute("SELECT transaction_timestamp()").fetchone()[0].isoformat()
        version = conn.execute("SHOW server_version_num").fetchone()[0]
        require(int(version) // 10000 == 18, "postgres_major_not_validated")
        # Manifest and pg_dump share the snapshot, even while live writes continue.
        manifest = pg_manifest(conn)
        run(["pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--lock-wait-timeout=10s",
             "--snapshot=" + snapshot, "--file=" + str(directory / "postgres.dump")], env=tool_env(("PG",)))
        return {"serverVersion": version, "tables": manifest,
                "snapshotAt": snapshot_at, "completedAt": dt.datetime.now(dt.timezone.utc).isoformat()}


def redis_args():
    args = ["redis-cli", "--no-auth-warning", "-h", os.environ["BACKUP_REDIS_HOST"],
            "-p", os.environ.get("BACKUP_REDIS_PORT", "6379")]
    if os.environ.get("BACKUP_REDIS_USER"):
        args += ["--user", os.environ["BACKUP_REDIS_USER"]]
    if os.environ.get("BACKUP_REDIS_TLS") == "yes":
        args += ["--tls"]
        if os.environ.get("BACKUP_REDIS_CA_CERT"):
            args += ["--cacert", os.environ["BACKUP_REDIS_CA_CERT"]]
    return args


def redis_info(section):
    raw = run(redis_args() + ["--raw", "INFO", section], env=tool_env(("REDISCLI_AUTH",))).decode()
    return dict(line.split(":", 1) for line in raw.splitlines() if ":" in line and not line.startswith("#"))


def capture_redis(directory, mode):
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    info = redis_info("persistence")
    require(info.get("rdb_bgsave_in_progress") == "0" and info.get("aof_rewrite_in_progress") == "0", "redis_busy_retry_next_schedule")
    memory = redis_info("memory")
    if mode == "real":
        # Conservative gate, NOT proof of host headroom or absence of fork latency.
        require(2 * int(memory["used_memory_rss"]) < int(os.environ["BACKUP_REDIS_SOURCE_MEMORY_LIMIT_BYTES"]), "redis_headroom_insufficient")
    target = directory / "redis.rdb"
    run(redis_args() + ["--rdb", str(target)], env=tool_env(("REDISCLI_AUTH",)))
    run(["redis-check-rdb", str(target)], env=tool_env())
    return {"method": "replication-full-sync-rdb", "wholeInstance": True,
            "captureStartedAt": started_at, "captureCompletedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            "atomicWithPostgres": False, "rdbChecksumVerified": True}


@contextlib.contextmanager
def offline_redis(rdb, directory):
    # Temporary Redis is reachable only through this private Unix socket.
    directory.mkdir(mode=0o700)
    shutil.copyfile(rdb, directory / "dump.rdb")
    sock = directory / "redis.sock"
    process = subprocess.Popen(["redis-server", "--port", "0", "--unixsocket", str(sock),
        "--unixsocketperm", "700", "--dir", str(directory), "--save", "", "--appendonly", "no"],
        env=tool_env(), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import redis
    client = redis.Redis(unix_socket_path=str(sock), socket_connect_timeout=1, socket_timeout=3)
    try:
        for _ in range(100):
            try:
                if client.ping():
                    break
            except redis.RedisError:
                pass
            require(process.poll() is None, "offline_redis_failed")
            time.sleep(0.05)
        else:
            raise BackupError("offline_redis_timeout")
        yield client
    finally:
        client.close(); process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait()


def redis_manifest(client):
    def encode(value):
        if isinstance(value, bytes):
            return base64.b64encode(value).decode("ascii")
        if isinstance(value, (tuple, list)):
            return [encode(x) for x in value]
        return value
    result = {}
    for dbkey in sorted(client.info("keyspace")):
        db = int(dbkey[2:]); client.execute_command("SELECT", db)
        h, count, expiring = hashlib.sha256(), 0, 0
        for key in sorted(set(client.scan_iter())):
            ttl = client.pttl(key)
            if ttl >= 0:
                expiring += 1
                continue  # TTLs continue to elapse; don't falsely require identical transient keys.
            if ttl == -2:
                continue
            kind = client.type(key)
            if kind == b"string": value = client.get(key)
            elif kind == b"list": value = client.lrange(key, 0, -1)
            elif kind == b"set": value = sorted(client.smembers(key))
            elif kind == b"zset": value = client.zrange(key, 0, -1, withscores=True)
            elif kind == b"hash": value = sorted(client.hgetall(key).items())
            elif kind == b"stream":
                value = [(ident, sorted(fields.items())) for ident, fields in client.xrange(key)]
            else: raise BackupError("redis_type_not_supported")
            data = json.dumps([encode(key), encode(kind), encode(value)], separators=(",", ":")).encode()
            h.update(len(data).to_bytes(8, "big")); h.update(data); count += 1
        result[str(db)] = {"persistentKeys": count, "sha256": h.hexdigest(), "expiringKeysObserved": expiring}
    return result


class Store:
    """R2 adapter; fixture adapter uses a disposable local directory, never a cloud."""
    def __init__(self, mode, fixture_root=None):
        self.mode, self.root = mode, fixture_root
        self.env = tool_env()
        if mode == "fixture":
            require(fixture_root is not None, "fixture_store_required")
            self.root = Path(fixture_root); self.root.mkdir(parents=True, exist_ok=True)
        else:
            endpoint = os.environ.get("BACKUP_R2_ENDPOINT", "")
            require(re.fullmatch(r"https://[a-f0-9]{32}\.r2\.cloudflarestorage\.com", endpoint) is not None, "invalid_r2_endpoint")
            bucket = os.environ.get("BACKUP_R2_BUCKET", "")
            require(re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket) is not None, "invalid_bucket")
            self.bucket = bucket
            self.env.update({"RCLONE_CONFIG_BACKUP_TYPE": "s3", "RCLONE_CONFIG_BACKUP_PROVIDER": "Cloudflare",
                # R2 probe showed PUT200 then HEAD501 with this rclone. Skip only
                # that redundant HEAD; capture STILL requires full GET/SHA256.
                "RCLONE_CONFIG_BACKUP_NO_HEAD": "true",
                "RCLONE_CONFIG_BACKUP_ENDPOINT": endpoint, "RCLONE_CONFIG_BACKUP_REGION": "auto",
                "RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID": os.environ.get("BACKUP_R2_ACCESS_KEY_ID", ""),
                "RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY": os.environ.get("BACKUP_R2_SECRET_ACCESS_KEY", "")})
            require(self.env["RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID"] and self.env["RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY"], "missing_r2_credentials")

    def target(self, key):
        require(re.fullmatch(r"v1/[0-9a-f-]{36}/(bundle\.tar\.age|COMMITTED\.json)", key) is not None, "invalid_object_key")
        return str(self.root / key) if self.mode == "fixture" else "backup:" + self.bucket + "/" + key

    def put(self, source, key):
        target = self.target(key)
        if self.mode == "fixture":
            Path(target).parent.mkdir(parents=True, exist_ok=True)
            # Exclusive creation: never overwrite an existing run, even on retry.
            with open(source, "rb") as src, open(target, "xb") as dst:
                shutil.copyfileobj(src, dst)
        else:
            run(["rclone", "copyto", str(source), target, "--immutable", "--s3-no-check-bucket", "--retries", "2", "--low-level-retries", "2"], env=self.env)

    def get(self, key, destination):
        target = self.target(key)
        if self.mode == "fixture":
            shutil.copyfile(target, destination)
        else:
            run(["rclone", "copyto", target, str(destination), "--s3-no-check-bucket", "--retries", "2", "--low-level-retries", "2"], env=self.env)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def heartbeat(event, run_id, mode):
    # Never send logs, records, credentials or exception strings to the monitor.
    url = os.environ.get("BACKUP_HEALTHCHECK_URL", "")
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.netloc == "hc-ping.com" and
            re.fullmatch(r"/[0-9a-f-]{36}", parsed.path) is not None and
            not parsed.query and not parsed.fragment, "invalid_monitor_url")
    require(mode == "real", "external_monitor_refused_in_fixture")
    suffix = {"start": "/start", "success": "", "fail": "/fail"}[event]
    request = urllib.request.Request(url + suffix + "?rid=" + run_id, data=b"", method="POST")
    opener = urllib.request.build_opener(NoRedirect)
    for attempt in range(3):
        try:
            with opener.open(request, timeout=10) as response:
                require(response.status == 200 and response.read(128).strip() == b"OK", "monitor_rejected_ping")
            return
        except Exception:
            if attempt == 2:
                raise BackupError("monitor_unreachable_or_rejected") from None
            time.sleep(1)


def capture(mode, store, notify, run_id=None):
    run_id = run_id or str(uuid.uuid4())
    try:
        # If the monitor cannot receive start, avoid an unobservable real capture.
        notify("start", run_id, mode)
        with tempfile.TemporaryDirectory(prefix="secretaria-backup-" + run_id + "-") as tmp:
            d = Path(tmp); os.chmod(d, 0o700)
            manifest = {"format": 1, "runId": run_id, "fixture": mode == "fixture", "outboundAllowedAfterRestore": False}
            checkpoint("capturing_postgres")
            manifest["postgres"] = capture_postgres(d)
            checkpoint("capturing_redis")
            manifest["redis"] = capture_redis(d, mode)
            with offline_redis(d / "redis.rdb", d / "rdb-check") as client:
                manifest["redis"]["logicalManifest"] = redis_manifest(client)
            manifest["files"] = {name: {"sha256": sha(d / name), "bytes": (d / name).stat().st_size}
                                 for name in ("postgres.dump", "redis.rdb")}
            json_write(d / "manifest.json", manifest)
            with tarfile.open(d / "bundle.tar", "w") as tar:
                for name in ("postgres.dump", "redis.rdb", "manifest.json"):
                    tar.add(d / name, arcname=name)
            encrypted = d / "bundle.tar.age"
            checkpoint("encrypting")
            run(["age", "--encrypt", "--recipient", os.environ["BACKUP_AGE_RECIPIENT"], "--output", str(encrypted), str(d / "bundle.tar")], env=tool_env())
            key = "v1/" + run_id + "/bundle.tar.age"
            checkpoint("uploading")
            store.put(encrypted, key)
            checkpoint("verifying_readback")
            downloaded = d / "readback.age"; store.get(key, downloaded)
            require(sha(downloaded) == sha(encrypted), "remote_readback_mismatch")
            committed = {"format": 1, "runId": run_id, "sha256": sha(encrypted), "bytes": encrypted.stat().st_size,
                         "verifiedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "restoreVerified": False, "fixture": mode == "fixture"}
            json_write(d / "COMMITTED.json", committed)
            checkpoint("committing", sha256=committed["sha256"], bytes=committed["bytes"])
            store.put(d / "COMMITTED.json", "v1/" + run_id + "/COMMITTED.json")
            # Also verify the commit marker; object upload alone is not success.
            store.get("v1/" + run_id + "/COMMITTED.json", d / "commit-readback.json")
            require(sha(d / "COMMITTED.json") == sha(d / "commit-readback.json"), "commit_readback_mismatch")
            checkpoint("storage_verified", sha256=committed["sha256"], bytes=committed["bytes"])
        notify("success", run_id, mode)
        return committed
    except Exception:
        try:
            notify("fail", run_id, mode)
        except Exception:
            pass  # Missing success is also detected by the independent watchdog.
        raise


def unpack(encrypted, identity, destination, expected_sha):
    require(sha(encrypted) == expected_sha, "encrypted_hash_mismatch")
    require(not destination.exists(), "restore_directory_exists")
    destination.mkdir(mode=0o700)
    try:
        archive = destination / "decrypted.tar"
        run(["age", "--decrypt", "--identity", str(identity), "--output", str(archive), str(encrypted)], env=tool_env())
        with tarfile.open(archive) as tar:
            members = tar.getmembers()
            require(len(members) == 3 and {m.name for m in members} == {"manifest.json", "postgres.dump", "redis.rdb"}, "archive_members_invalid")
            limit = int(os.environ.get("BACKUP_RESTORE_MAX_BYTES", str(2 * 1024 ** 3)))
            require(all(m.isfile() and 0 <= m.size <= limit for m in members) and sum(m.size for m in members) <= limit, "archive_size_or_type_invalid")
            for member in members:
                with tar.extractfile(member) as source, open(destination / member.name, "xb") as target:
                    shutil.copyfileobj(source, target)
        archive.unlink()
        manifest = json.loads((destination / "manifest.json").read_text())
        require(manifest["format"] == 1 and manifest["outboundAllowedAfterRestore"] is False, "manifest_format_invalid")
        require(set(manifest["files"]) == {"postgres.dump", "redis.rdb"}, "manifest_files_invalid")
        for name, meta in manifest["files"].items():
            require(sha(destination / name) == meta["sha256"] and (destination / name).stat().st_size == meta["bytes"], "plaintext_integrity_failed")
        run(["redis-check-rdb", str(destination / "redis.rdb")], env=tool_env())
        return manifest
    except Exception:
        shutil.rmtree(destination)
        raise


def restore_postgres(directory, manifest, target):
    # Restoration is deliberately limited to the isolated fixture host. A real
    # recovery operator must use a separately reviewed isolated environment.
    require(os.environ.get("BACKUP_MODE") == "fixture" and os.environ.get("PGHOST") == "pg-test" and
            re.fullmatch(r"backup_restore_[a-f0-9]{12}_test", target) is not None, "restore_target_refused")
    from psycopg import sql
    with pg_connect("postgres") as conn:
        conn.autocommit = True
        require(not conn.execute("SELECT 1 FROM pg_database WHERE datname=%s", (target,)).fetchone(), "restore_database_exists")
        conn.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(target)))
    env = tool_env(("PG",)); env["PGDATABASE"] = target
    run(["pg_restore", "--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges",
         "--dbname=" + target, str(directory / "postgres.dump")], env=env)
    with pg_connect(target) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        require(pg_manifest(conn) == manifest["postgres"]["tables"], "restored_postgres_mismatch")
    with offline_redis(directory / "redis.rdb", directory / "redis-restore") as client:
        actual = redis_manifest(client)
    expected = manifest["redis"]["logicalManifest"]
    # Entire databases consisting only of expired transient keys may disappear.
    for db in set(actual) | set(expected):
        a, b = actual.get(db, {}), expected.get(db, {})
        require(a.get("persistentKeys", 0) == b.get("persistentKeys", 0) and
                (not b.get("persistentKeys", 0) or a.get("sha256") == b.get("sha256")), "restored_redis_mismatch")
    return {"postgresRowsAndHashesMatch": True, "redisPersistentValuesMatch": True,
            "expiringRedisKeysNotCompared": True, "outboundAllowed": False}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("plan", "capture", "restore-isolated"), nargs="?", default="plan")
    parser.add_argument("--authorize-real-data", action="store_true")
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--identity", type=Path)
    parser.add_argument("--trusted-sha256")
    parser.add_argument("--target")
    args = parser.parse_args()
    if args.command == "plan":
        print(json.dumps({"dataAccess": False, "scheduleInstalled": False, "realDataAuthorized": False,
                          "required": ["private R2", "age public recipient + offline identity", "current backup credentials + verified TLS", "Redis replication ACL + measured headroom", "independent email monitor", "persistent executor state", "specific real-data authorization"]}))
        return
    if args.command == "restore-isolated":
        # No cloud download or overwrite of an existing database. Caller must
        # independently trust the hash, not merely a marker in the same bucket.
        require(args.bundle is not None and args.identity is not None and args.target is not None and
                re.fullmatch(r"[a-f0-9]{64}", args.trusted_sha256 or "") is not None, "missing_isolated_restore_arguments")
        require(os.environ.get("BACKUP_MODE") == "fixture" and os.environ.get("PGHOST") == "pg-test", "restore_target_refused")
        with tempfile.TemporaryDirectory(prefix="backup-restore-") as tmp:
            directory = Path(tmp) / "verified"
            manifest = unpack(args.bundle, args.identity, directory, args.trusted_sha256)
            print(json.dumps(restore_postgres(directory, manifest, args.target)))
        return
    mode = config(args.authorize_real_data)
    require(mode == "real", "use_test_harness_for_fixture_capture")
    require(os.environ.get("BACKUP_STATE_DIR") == "/state", "persistent_state_volume_required")
    require(os.environ.get("TMPDIR") == "/scratch", "dedicated_scratch_required")
    from executor import execute
    result = execute(mode, Store(mode), heartbeat, os.environ["BACKUP_STATE_DIR"], authorize_real=args.authorize_real_data)
    print(json.dumps({"status": "encrypted_capture_readback_verified", **result}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"status": "failed", "code": str(error) if isinstance(error, (BackupError, ExecutionError)) else "unexpected_error_sanitized"}))
        raise SystemExit(75 if isinstance(error, ExecutionError) and error.code == "backup_already_running" else 1)
