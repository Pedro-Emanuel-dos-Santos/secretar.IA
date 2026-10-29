"""Isolated operational tests: real advisory locks, local process interruption,
fake capture/monitor where indicated. No cloud access or .env loading."""
import datetime as dt
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid
import backup as b
import executor as e


def success(mode, store, notify, run_id):
    notify("start", run_id, mode)
    e.checkpoint("test_storage_verified")
    notify("success", run_id, mode)
    return {"runId": run_id, "sha256": "f" * 64, "bytes": 17}


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="executor-fixture-")
        self.root = Path(self.tmp.name)
        self.events = []
        self.notify = lambda event, run_id, mode: self.events.append(event)

    def tearDown(self): self.tmp.cleanup()

    def records(self, sub="state"):
        return [json.loads(p.read_text()) for p in (self.root / sub).glob("*.json")]

    def test_file_lock_and_postgres_lock_prevent_overlap(self):
        with e.Lease(self.root / "one"):
            for other in ("one", "two"):
                with self.assertRaisesRegex(e.ExecutionError, "backup_already_running"):
                    with e.Lease(self.root / other): self.fail("Concurrent execution acquired lock")
        with e.Lease(self.root / "two") as owned: owned.check()

    def test_overlap_does_not_ping_monitor_or_run_capture(self):
        with e.Lease(self.root / "other"):
            with self.assertRaisesRegex(e.ExecutionError, "backup_already_running"):
                e.execute("fixture", None, self.notify, self.root / "state", operation=lambda *_: self.fail())
        self.assertEqual(self.events, [])

    def test_success_journal_follows_verified_notification(self):
        result = e.execute("fixture", None, self.notify, self.root / "state", operation=success)
        row = self.records()[0]
        self.assertEqual(self.events, ["start", "success"])
        self.assertEqual(row["state"], "succeeded")
        self.assertTrue(row["storageVerified"])
        self.assertEqual(row["sha256"], result["sha256"])
        self.assertEqual(os.stat(self.root / "state" / (result["runId"] + ".json")).st_mode & 0o777, 0o600)

    def test_failure_never_becomes_success_and_unlocks(self):
        def failed(mode, store, notify, run_id):
            notify("start", run_id, mode)
            raise b.BackupError("fixture_readback_failed")
        with self.assertRaises(b.BackupError):
            e.execute("fixture", None, self.notify, self.root / "state", operation=failed)
        self.assertEqual(self.events, ["start", "fail"])
        self.assertEqual(self.records()[0]["state"], "failed")
        with e.Lease(self.root / "other"): pass

    def test_unverified_operation_cannot_claim_success(self):
        with self.assertRaisesRegex(e.ExecutionError, "capture_success_not_verified"):
            e.execute("fixture", None, self.notify, self.root / "state", operation=lambda *_, **kw: {"sha256":"f"*64,"bytes":1})
        self.assertEqual(self.records()[0]["state"], "failed")
        self.assertFalse(self.records()[0]["storageVerified"])

    def test_monitor_failure_preserves_storage_evidence_without_overall_success(self):
        def offline(event, run_id, mode):
            self.events.append(event)
            if event == "success": raise b.BackupError("monitor_unreachable_or_rejected")
        with self.assertRaises(b.BackupError):
            e.execute("fixture", None, offline, self.root / "state", operation=success)
        self.assertEqual(self.records()[0]["state"], "verified_monitor_failed")
        self.assertTrue(self.records()[0]["storageVerified"])
        self.assertEqual(self.events, ["start", "success", "fail"])

    def test_deadline_terminates_child_and_fails(self):
        pid = self.root / "tool.pid"
        def hanging(mode, store, notify, run_id):
            notify("start", run_id, mode)
            b.run([sys.executable,"-c","import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)",str(pid)])
        with self.assertRaisesRegex(e.ExecutionError,"backup_deadline_exceeded"):
            e.execute("fixture", None, self.notify, self.root / "state", timeout=0.5, operation=hanging)
        if pid.exists():
            with self.assertRaises(ProcessLookupError): os.kill(int(pid.read_text()),0)
        self.assertEqual(self.records()[0]["code"],"backup_deadline_exceeded")
        self.assertNotIn("success",self.events)

    def test_lost_lease_aborts_before_publication(self):
        def disconnected(mode, store, notify, run_id):
            e.ACTIVE.get().lease.connection.close()
            e.checkpoint("publishing")
            self.fail("Publication after losing lock")
        with self.assertRaisesRegex(e.ExecutionError,"backup_lease_lost"):
            e.execute("fixture", None, self.notify,self.root / "state",operation=disconnected)
        self.assertEqual(self.records()[0]["code"],"backup_lease_lost")

    def test_sigterm_records_interruption_and_stops_child(self):
        ready=self.root / "ready"; pid=self.root / "tool.pid"
        code="""import sys,pathlib,backup,executor
def operation(mode,store,notify,run_id):
    pathlib.Path(sys.argv[2]).write_text('ready')
    backup.run([sys.executable,'-c','import os,pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(30)',sys.argv[3]])
executor.execute('fixture',None,lambda *a:None,sys.argv[1],operation=operation)
"""
        child=subprocess.Popen([sys.executable,"-c",code,str(self.root / "state"),str(ready),str(pid)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+10
            while not pid.exists() and time.monotonic()<deadline and child.poll() is None: time.sleep(0.05)
            self.assertTrue(pid.exists())
            child.send_signal(signal.SIGTERM); child.communicate(timeout=10)
            self.assertNotEqual(child.returncode,0)
            self.assertEqual(self.records()[0]["state"],"interrupted")
            with self.assertRaises(ProcessLookupError): os.kill(int(pid.read_text()),0)
        finally:
            if child.poll() is None: child.kill();child.communicate()

    def test_sigkill_releases_database_lock_and_next_run_marks_stale_state(self):
        ready=self.root / "ready"
        code="""import sys,pathlib,time,uuid,tempfile,executor
with executor.Lease(sys.argv[1]):
    run_id=str(uuid.uuid4())
    executor.Journal(sys.argv[1]).write({'runId':run_id,'state':'running','phase':'fixture','at':executor.now()})
    scratch=pathlib.Path(tempfile.mkdtemp(prefix='secretaria-backup-'+run_id+'-'))
    (scratch/'fictional-plaintext').write_text('fixture only')
    pathlib.Path(sys.argv[2]).write_text(str(scratch))
    time.sleep(30)
"""
        child=subprocess.Popen([sys.executable,"-c",code,str(self.root / "state"),str(ready)],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        try:
            deadline=time.monotonic()+10
            while not ready.exists() and time.monotonic()<deadline and child.poll() is None: time.sleep(0.05)
            self.assertTrue(ready.exists());scratch=Path(ready.read_text());self.assertTrue(scratch.exists());child.kill();child.communicate(timeout=5)
            e.execute("fixture",None,self.notify,self.root / "state",operation=success)
            rows=self.records();self.assertEqual(sorted(x["state"] for x in rows),["interrupted","succeeded"])
            self.assertEqual(len({x["runId"] for x in rows}),2)
            self.assertFalse(scratch.exists())
        finally:
            if child.poll() is None: child.kill();child.communicate()

    def test_corrupt_journal_blocks_unsafe_automatic_recovery(self):
        state=self.root / "state";state.mkdir();(state / "bad.json").write_text("not json")
        with self.assertRaisesRegex(e.ExecutionError,"journal_corrupt_requires_review"):
            e.execute("fixture",None,self.notify,state,operation=success)
        self.assertEqual(self.events,[])

    def test_failed_cleanup_remains_pending_and_refuses_links(self):
        state=self.root / "state";journal=e.Journal(state);run_id=str(uuid.uuid4())
        journal.write({"runId":run_id,"state":"running","phase":"fixture","at":e.now()})
        link=Path(tempfile.gettempdir()) / ("secretaria-backup-"+run_id+"-unsafe")
        outside=self.root / "outside";outside.mkdir();(outside / "fixture").write_text("keep")
        link.symlink_to(outside,target_is_directory=True)
        try:
            for _ in range(2):
                with self.assertRaisesRegex(e.ExecutionError,"scratch_cleanup_requires_review"):
                    e.execute("fixture",None,self.notify,state,operation=success)
                self.assertTrue((outside / "fixture").exists())
                self.assertFalse(json.loads((state / (run_id+".json")).read_text()).get("scratchCleaned",False))
        finally:link.unlink()

    def test_credential_deadline_warns_and_blocks_without_rotating(self):
        with patch.dict(os.environ,{"BACKUP_R2_CREDENTIAL_EXPIRES_ON":"2026-11-28"}):
            self.assertIsNone(e.credential_policy("real",dt.date(2026,10,29)))
            self.assertEqual(e.credential_policy("real",dt.date(2026,11,14)),"r2_credential_expiring_soon")
            with self.assertRaisesRegex(e.ExecutionError,"r2_credential_expired_or_due"):
                e.credential_policy("real",dt.date(2026,11,28))
        with patch.dict(os.environ,{"BACKUP_R2_CREDENTIAL_EXPIRES_ON":""}):
            with self.assertRaisesRegex(e.ExecutionError,"credential_expiry_date_required"):e.credential_policy("real")

    def test_r2_fix_keeps_head_object_enabled_and_requires_no_new_permission(self):
        with patch.dict(os.environ,{"BACKUP_R2_ENDPOINT":"https://"+"a"*32+".r2.cloudflarestorage.com","BACKUP_R2_BUCKET":"fixture-bucket","BACKUP_R2_ACCESS_KEY_ID":"fixture","BACKUP_R2_SECRET_ACCESS_KEY":"fixture"}):
            store=b.Store("real")
        self.assertEqual(store.env["RCLONE_CONFIG_BACKUP_NO_HEAD"],"true")
        self.assertNotIn("RCLONE_CONFIG_BACKUP_NO_HEAD_OBJECT",store.env)
        self.assertNotIn("PGPASSWORD",store.env)

    def test_unknown_monitor_check_body_is_not_success(self):
        class Response:
            status=200
            def read(self,n):return b"OK (not found)"
            def __enter__(self):return self
            def __exit__(self,*args):pass
        class Opener:
            def open(self,*args,**kwargs):return Response()
        with patch.dict(os.environ,{"BACKUP_HEALTHCHECK_URL":"https://hc-ping.com/"+str(uuid.uuid4())}),patch.object(b.urllib.request,"build_opener",return_value=Opener()),patch.object(b.time,"sleep"):
            with self.assertRaisesRegex(b.BackupError,"monitor_unreachable_or_rejected"):b.heartbeat("success",str(uuid.uuid4()),"real")


if __name__ == "__main__": unittest.main(verbosity=2)
