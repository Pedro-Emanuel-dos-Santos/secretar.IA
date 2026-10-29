"""Real local PostgreSQL/Redis/age tools, fictional records, no cloud credentials.

The Docker network is internal and no source database ports are published.
The object store and monitor are local test doubles. This does NOT prove R2,
Healthchecks delivery, real Redis ACL/TLS, or recoverability of production data.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

import psycopg
import redis
import backup as b


class Monitor:
    def __init__(self):
        self.events = []

    def __call__(self, event, run_id, mode):
        self.events.append((event, run_id))

    def overdue(self, seconds_since_success, period=21600, grace=1800):
        # Independent watchdog contract, not the hosted Healthchecks engine.
        return seconds_since_success > period + grace


class BackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.umask(0o077)
        assert os.environ.get("BACKUP_MODE") == "fixture"
        assert os.environ.get("PGHOST") == "pg-test"
        cls.tmp = tempfile.TemporaryDirectory(prefix="backup-fixture-")
        cls.root = Path(cls.tmp.name)
        cls.identity = cls.root / "identity.txt"
        b.run(["age-keygen", "--output", str(cls.identity)], env=b.tool_env())
        cls.recipient = b.run(["age-keygen", "-y", str(cls.identity)], env=b.tool_env()).decode().strip()
        os.environ["BACKUP_AGE_RECIPIENT"] = cls.recipient
        b.config()
        cls.redis = redis.Redis(host="redis-test", password="fictional_redis_only")
        for _ in range(60):
            try:
                if cls.redis.ping(): break
            except redis.RedisError: time.sleep(0.1)
        with b.pg_connect() as conn:
            conn.execute("CREATE TABLE fixture_people (id integer PRIMARY KEY, label text NOT NULL)")
            conn.execute("CREATE TABLE fixture_reminders (id integer PRIMARY KEY, person_id integer REFERENCES fixture_people, payload jsonb, at timestamptz)")
            conn.execute("CREATE TABLE fixture_pair (id integer PRIMARY KEY, left_value integer, right_value integer CHECK(left_value=right_value))")
            conn.execute("INSERT INTO fixture_people VALUES (1,'Pessoa Fictícia')")
            conn.execute("INSERT INTO fixture_reminders VALUES (1,1,'{\"title\":\"Revisar plano fictício\"}', '2026-11-04 09:30:00-03')")
            conn.execute("INSERT INTO fixture_pair VALUES (1,0,0)")
        cls.redis.hset("bull:reminders:fictional-job", mapping={"title": "Revisar plano fictício", "scheduleVersion": "2"})
        cls.redis.rpush("bull:reminders:wait", "fictional-job")
        cls.redis.zadd("bull:reminders:delayed", {"fictional-later": 1793790000})
        cls.redis.sadd("fixture:set", "a", "b")
        cls.redis.xadd("bull:reminders:events", {"event": "waiting", "jobId": "fictional-job"})
        cls.redis.set("fixture:ttl", "transient", ex=3600)
        cls.redis.execute_command("SELECT", 15); cls.redis.set("fixture:db15", "whole-instance")
        cls.redis.execute_command("SELECT", 0)
        cls.stop = threading.Event(); cls.progress = {"pg": 0, "redis": 0}; cls.writer_errors = []

        def write_pg():
            try:
                with b.pg_connect() as conn:
                    while not cls.stop.is_set():
                        with conn.transaction():
                            conn.execute("UPDATE fixture_pair SET left_value=left_value+1, right_value=right_value+1 WHERE id=1")
                        cls.progress["pg"] += 1
                        cls.stop.wait(0.01)
            except Exception as e: cls.writer_errors.append(type(e).__name__)

        def write_redis():
            client = redis.Redis(host="redis-test", password="fictional_redis_only")
            try:
                while not cls.stop.is_set():
                    value = str(cls.progress["redis"])
                    with client.pipeline(transaction=True) as pipe:
                        pipe.set("fixture:left", value); pipe.set("fixture:right", value); pipe.execute()
                    cls.progress["redis"] += 1
                    cls.stop.wait(0.01)
            except Exception as e: cls.writer_errors.append(type(e).__name__)
            finally: client.close()

        threads = [threading.Thread(target=write_pg), threading.Thread(target=write_redis)]
        for thread in threads: thread.start()
        cls.store = b.Store("fixture", cls.root / "objects"); cls.monitor = Monitor()
        try:
            cls.capture = b.capture("fixture", cls.store, cls.monitor)
        finally:
            cls.stop.set()
            for thread in threads: thread.join(timeout=10)
        cls.bundle = cls.root / "objects" / "v1" / cls.capture["runId"] / "bundle.tar.age"
        cls.restored_dir = cls.root / "restored"
        cls.manifest = b.unpack(cls.bundle, cls.identity, cls.restored_dir, cls.capture["sha256"])

    @classmethod
    def tearDownClass(cls):
        cls.redis.close()
        cls.tmp.cleanup()

    def target(self):
        return "backup_restore_" + uuid.uuid4().hex[:12] + "_test"

    def test_01_capture_while_writes_continue(self):
        self.assertEqual(self.writer_errors, [])
        self.assertGreater(self.progress["pg"], 2)
        self.assertGreater(self.progress["redis"], 2)
        self.assertEqual([x[0] for x in self.monitor.events], ["start", "success"])
        self.assertEqual(self.manifest["redis"]["method"], "replication-full-sync-rdb")
        self.assertFalse(self.manifest["redis"]["atomicWithPostgres"])
        self.assertEqual(self.capture["sha256"], b.sha(self.bundle))
        self.assertFalse(self.capture["restoreVerified"])
        with b.offline_redis(self.restored_dir / "redis.rdb", self.root / "paired-restore") as client:
            self.assertEqual(client.get("fixture:left"), client.get("fixture:right"))
            self.assertEqual(client.lrange("bull:reminders:wait", 0, -1), [b"fictional-job"])
            self.assertEqual(client.hget("bull:reminders:fictional-job", "scheduleVersion"), b"2")
            self.assertGreater(client.pttl("fixture:ttl"), 0)
            client.execute_command("SELECT", 15)
            self.assertEqual(client.get("fixture:db15"), b"whole-instance")

    def test_02_restore_matches_snapshot_not_current_database(self):
        target = self.target()
        result = b.restore_postgres(self.restored_dir, self.manifest, target)
        self.assertTrue(result["postgresRowsAndHashesMatch"])
        self.assertTrue(result["redisPersistentValuesMatch"])
        self.assertFalse(result["outboundAllowed"])
        with b.pg_connect(target) as conn:
            self.assertEqual(conn.execute("SELECT left_value=right_value FROM fixture_pair").fetchone(), (True,))
            self.assertEqual(str(conn.execute("SELECT at AT TIME ZONE 'America/Sao_Paulo' FROM fixture_reminders").fetchone()[0]), "2026-11-04 09:30:00")
            self.assertEqual(conn.execute("SELECT payload->>'title' FROM fixture_reminders").fetchone()[0], "Revisar plano fictício")
        with self.assertRaisesRegex(b.BackupError, "restore_database_exists"):
            b.restore_postgres(self.restored_dir, self.manifest, target)

    def test_03_corrupt_cipher_and_wrong_identity_rejected(self):
        corrupt = self.root / "corrupt.age"
        data = bytearray(self.bundle.read_bytes()); data[-2] ^= 1; corrupt.write_bytes(data)
        with self.assertRaisesRegex(b.BackupError, "encrypted_hash_mismatch"):
            b.unpack(corrupt, self.identity, self.root / "corrupt-target", self.capture["sha256"])
        with self.assertRaises(b.BackupError):
            b.unpack(corrupt, self.identity, self.root / "corrupt-target", b.sha(corrupt))
        self.assertFalse((self.root / "corrupt-target").exists())
        wrong = self.root / "wrong-key"
        b.run(["age-keygen", "--output", str(wrong)], env=b.tool_env())
        with self.assertRaises(b.BackupError):
            b.unpack(self.bundle, wrong, self.root / "wrong-target", self.capture["sha256"])
        self.assertFalse((self.root / "wrong-target").exists())

    def test_04_partial_upload_and_readback_corruption_do_not_commit(self):
        for fault in ("put", "get"):
            store = b.Store("fixture", self.root / ("fault-" + fault)); monitor = Monitor()
            if fault == "put":
                def broken(*_): raise b.BackupError("fixture_upload_failed")
            else:
                def broken(key, destination): Path(destination).write_bytes(b"fictional corruption")
            # Reuse captured fixtures to keep the failure test focused on publication.
            def pg(d):
                import shutil
                shutil.copyfile(self.restored_dir / "postgres.dump", d / "postgres.dump")
                return self.manifest["postgres"]
            def rd(d, mode):
                import shutil
                shutil.copyfile(self.restored_dir / "redis.rdb", d / "redis.rdb")
                return self.manifest["redis"]
            with patch.object(b, "capture_postgres", side_effect=pg), patch.object(b, "capture_redis", side_effect=rd), patch.object(store, fault, side_effect=broken):
                with self.assertRaises(b.BackupError): b.capture("fixture", store, monitor)
            self.assertEqual([e[0] for e in monitor.events], ["start", "fail"])
            self.assertEqual(list(store.root.rglob("COMMITTED.json")), [])

    def test_05_corrupt_postgres_rolls_back_all_tables(self):
        d = self.root / "corrupt-pg"; d.mkdir()
        data = (self.restored_dir / "postgres.dump").read_bytes()
        (d / "postgres.dump").write_bytes(data[:len(data)//2])
        target = self.target()
        with self.assertRaises(b.BackupError): b.restore_postgres(d, self.manifest, target)
        with b.pg_connect(target) as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0], 0)

    def test_06_archive_traversal_links_and_duplicate_members_rejected(self):
        for index, variant in enumerate(("traversal", "symlink", "duplicate")):
            archive = self.root / (variant + ".tar")
            with tarfile.open(archive, "w") as tar:
                names = ["manifest.json", "postgres.dump", "redis.rdb"]
                if variant == "traversal": names[0] = "../outside"
                if variant == "duplicate": names.append("manifest.json")
                for name in names:
                    member = tarfile.TarInfo(name); member.size = 2
                    if variant == "symlink" and name == "redis.rdb":
                        member.type = tarfile.SYMTYPE; member.linkname = "/etc/passwd"; member.size = 0
                    tar.addfile(member, io.BytesIO(b"{}"))
            cipher = self.root / (variant + ".age")
            b.run(["age", "-r", self.recipient, "-o", str(cipher), str(archive)], env=b.tool_env())
            with self.assertRaises(b.BackupError): b.unpack(cipher, self.identity, self.root / (variant + "-out"), b.sha(cipher))
        self.assertFalse((self.root / "outside").exists())

    def test_07_no_real_capture_without_authorization(self):
        with patch.dict(os.environ, {"BACKUP_MODE": "real", "BACKUP_APPROVAL_REFERENCE": ""}):
            with self.assertRaisesRegex(b.BackupError, "real_data_not_authorized"): b.config()
        with patch.dict(os.environ, {"PGHOST": "example.railway.internal"}):
            with self.assertRaisesRegex(b.BackupError, "fixture_target_refused"): b.config()
        with patch.dict(os.environ, {"BACKUP_AGE_RECIPIENT": ""}):
            with self.assertRaisesRegex(b.BackupError, "missing_capture_configuration"): b.config()

    def test_08_dry_plan_requires_no_credentials_or_network(self):
        result = subprocess.run([sys.executable, "backup.py", "plan"], env={}, capture_output=True, check=True)
        report = json.loads(result.stdout)
        self.assertFalse(report["dataAccess"]); self.assertFalse(report["scheduleInstalled"])

    def test_09_restore_refuses_remote_or_unsafe_target(self):
        for target in ("postgres", "secretaria", "secretaria_test", "x;DROP DATABASE x"):
            with self.assertRaisesRegex(b.BackupError, "restore_target_refused"):
                b.restore_postgres(self.restored_dir, self.manifest, target)
        with patch.dict(os.environ, {"PGHOST": "real.railway.internal"}):
            with self.assertRaisesRegex(b.BackupError, "restore_target_refused"):
                b.restore_postgres(self.restored_dir, self.manifest, self.target())

    def test_10_immutable_local_objects_and_safe_keys(self):
        with self.assertRaises(FileExistsError):
            self.store.put(self.bundle, "v1/" + self.capture["runId"] + "/bundle.tar.age")
        for key in ("../escape", "v1/../../escape", "credentials.txt"):
            with self.assertRaises(b.BackupError): self.store.target(key)
        # Only encrypted payload and a non-sensitive marker are stored remotely.
        objects = [p.name for p in self.store.root.rglob("*") if p.is_file()]
        self.assertEqual(sorted(objects), ["COMMITTED.json", "bundle.tar.age"])

    def test_11_watchdog_detects_job_absence_independently(self):
        watchdog = Monitor()  # No application process or app database needed.
        self.assertFalse(watchdog.overdue(21600))
        self.assertTrue(watchdog.overdue(23401))
        with patch.dict(os.environ, {"BACKUP_HEALTHCHECK_URL": "https://hc-ping.com/" + str(uuid.uuid4())}):
            with self.assertRaisesRegex(b.BackupError, "external_monitor_refused_in_fixture"):
                b.heartbeat("success", str(uuid.uuid4()), "fixture")

    def test_12_monitor_protocol_no_logs_no_redirects(self):
        class Response:
            status = 200
            def read(self, n): return b"OK"
            def __enter__(self): return self
            def __exit__(self, *args): pass
        seen = []
        class Opener:
            def open(self, request, timeout): seen.append(request); return Response()
        with patch.dict(os.environ, {"BACKUP_HEALTHCHECK_URL": "https://hc-ping.com/" + str(uuid.uuid4())}), patch.object(b.urllib.request, "build_opener", return_value=Opener()):
            for event in ("start", "success", "fail"): b.heartbeat(event, str(uuid.uuid4()), "real")
        self.assertEqual(len(seen), 3)
        self.assertTrue(all(request.data == b"" for request in seen))
        self.assertIsNone(b.NoRedirect().redirect_request(None, None, None, None, None, None))

    def test_13_monitor_unavailable_does_not_report_success(self):
        def offline(*_): raise b.BackupError("monitor_unreachable_or_rejected")
        with patch.object(b, "capture_postgres") as pg:
            with self.assertRaises(b.BackupError): b.capture("fixture", self.store, offline)
            pg.assert_not_called()

    def test_14_busy_redis_does_not_force_snapshot(self):
        with patch.object(b, "redis_info", return_value={"rdb_bgsave_in_progress": "1", "aof_rewrite_in_progress": "0"}), patch.object(b, "run") as command:
            with self.assertRaisesRegex(b.BackupError, "redis_busy_retry_next_schedule"):
                b.capture_redis(self.root, "fixture")
            command.assert_not_called()

    def test_15_r2_adapter_scopes_and_keeps_credentials_out_of_arguments(self):
        env = {"BACKUP_R2_ENDPOINT": "https://" + "a" * 32 + ".r2.cloudflarestorage.com",
               "BACKUP_R2_BUCKET": "fixture-private-bucket", "BACKUP_R2_ACCESS_KEY_ID": "FICTIONAL_KEY_ID",
               "BACKUP_R2_SECRET_ACCESS_KEY": "FICTIONAL_SECRET"}
        with patch.dict(os.environ, env):
            store = b.Store("real")  # Configuration only, tool invocation intercepted below.
        with patch.object(b, "run") as command:
            key = "v1/" + str(uuid.uuid4()) + "/bundle.tar.age"
            store.put(self.bundle, key)
            args = command.call_args.args[0]
            self.assertIn("--immutable", args)
            self.assertIn("--s3-no-check-bucket", args)
            self.assertNotIn("FICTIONAL_SECRET", " ".join(args))
            self.assertNotIn("PGPASSWORD", command.call_args.kwargs["env"])
            self.assertEqual(command.call_args.kwargs["env"]["RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY"], "FICTIONAL_SECRET")
        for url in ("http://localhost:9000", "https://attacker.example", "https://user:secret@" + "a" * 32 + ".r2.cloudflarestorage.com"):
            with patch.dict(os.environ, {**env, "BACKUP_R2_ENDPOINT": url}):
                with self.assertRaisesRegex(b.BackupError, "invalid_r2_endpoint"): b.Store("real")

    def test_16_tools_are_available_without_cloud(self):
        for args in (["pg_dump", "--version"], ["redis-cli", "--version"], ["age", "--version"], ["rclone", "version"]):
            self.assertTrue(b.run(args, env=b.tool_env()))
        help_text = b.run(["rclone", "help", "backend", "s3"], env=b.tool_env()).decode()
        self.assertIn("Cloudflare", help_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
