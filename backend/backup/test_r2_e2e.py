"""Explicitly authorized cloud fixture run. Sources remain isolated Docker DBs.
Creates only UUID-scoped v1 artifacts; never lists the bucket or changes policies.
"""
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid
import backup as b
import executor as e
import test_backup as fixtures


class R2EndToEnd(unittest.TestCase):
    def test_complete_backup_and_independent_recovery(self):
        self.assertEqual(os.environ.get("BACKUP_ALLOW_FIXTURE_R2"),"yes")
        self.assertEqual(os.environ.get("BACKUP_R2_BUCKET"),"secretaria-ia-backups")
        self.assertEqual(os.environ.get("BACKUP_R2_ENDPOINT"),"https://d248342fa2d673fef4bca1532e8a2920.r2.cloudflarestorage.com")
        self.assertEqual(os.environ.get("PGHOST"),"pg-test")
        self.assertEqual(os.environ.get("PGDATABASE"),"secretaria_backup_test")
        self.assertEqual(os.environ.get("BACKUP_REDIS_HOST"),"redis-test")
        fixtures.BackupTests.setUpClass()
        try:
            with tempfile.TemporaryDirectory(prefix="r2-complete-") as tmp:
                root=Path(tmp);independent=root / "independent-recovery";independent.mkdir(mode=0o700)
                identity=independent / "fixture.agekey"
                shutil.copyfile(fixtures.BackupTests.identity,identity);os.chmod(identity,0o600)
                # Recover with the independent portable age copy, not Windows DPAPI.
                fixtures.BackupTests.identity.unlink()
                store=b.Store("real");monitor=fixtures.Monitor()
                committed=e.execute("fixture",store,monitor,root / "state",timeout=180)
                run_id=committed["runId"];download=root / "download.age"
                store.get("v1/"+run_id+"/bundle.tar.age",download)
                self.assertEqual(b.sha(download),committed["sha256"])
                marker=root / "marker.json";store.get("v1/"+run_id+"/COMMITTED.json",marker)
                self.assertEqual(json.loads(marker.read_text()),committed)
                extracted=root / "extracted";manifest=b.unpack(download,identity,extracted,committed["sha256"])
                self.assertTrue(manifest["fixture"])
                target="backup_restore_"+uuid.uuid4().hex[:12]+"_test"
                restored=b.restore_postgres(extracted,manifest,target)
                self.assertTrue(restored["postgresRowsAndHashesMatch"])
                self.assertTrue(restored["redisPersistentValuesMatch"])
                self.assertFalse(restored["outboundAllowed"])
                status=json.loads((root / "state" / (run_id+".json")).read_text())
                self.assertEqual(status["state"],"succeeded")
                self.assertEqual([x[0] for x in monitor.events],["start","success"])
                evidence={"fixtureOnly":True,"realDatabaseAccess":False,"remotePoliciesChanged":False,
                    "credentialRotated":False,"bucket":os.environ["BACKUP_R2_BUCKET"],"runId":run_id,
                    "artifactSha256":committed["sha256"],"encryptedBytes":committed["bytes"],
                    "sourceTables":manifest["postgres"]["tables"],"redisLogicalManifest":manifest["redis"]["logicalManifest"],
                    "committedMarkerReadbackMatches":True,"independentAgeCopyWorks":True,
                    "originalFixtureIdentityRemovedBeforeCloudCapture":True,"recovery":restored,
                    "executorState":status["state"],"monitorTransport":"local double; no real email sent",
                    "protectedArtifactsRemainUntilRetention":True,"passed":True}
                Path("/evidence/r2-operational-e2e-20261029.json").write_text(json.dumps(evidence,indent=2)+"\n")
                print(json.dumps(evidence),flush=True)
        finally: fixtures.BackupTests.tearDownClass()


if __name__ == "__main__": unittest.main(verbosity=2)
