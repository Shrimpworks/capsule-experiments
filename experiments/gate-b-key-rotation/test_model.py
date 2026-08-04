from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from model import ROLES, Refused, RotationModel


class RotationModelTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.model = RotationModel(Path(self.temporary.name))
        self.model.initialize()

    def tearDown(self):
        try:
            self.model.close()
        except sqlite3.ProgrammingError:
            pass
        self.temporary.cleanup()

    def restart(self) -> str:
        self.model.close()
        self.model = RotationModel(Path(self.temporary.name))
        return self.model.recover()

    def test_happy_path_rotates_authority_and_physically_retires_old_key(self):
        self.model.run_full()
        self.model.assert_execution_ready()
        self.assertFalse(self.model.authorization_accepts("approval-v1", 1))
        self.assertTrue(self.model.authorization_accepts("approval-v2", 2))
        old_key = self.model.ext.execute(
            "SELECT present FROM keys_external WHERE key_id='approval-v1'"
        ).fetchone()
        self.assertEqual(old_key["present"], 0)

    def test_transition_fence_invalidates_old_unused_grants(self):
        self.model.issue_grant("grant-old")
        self.model.begin()
        with self.assertRaisesRegex(Refused, "fenced"):
            self.model.assert_execution_ready()
        grant = self.model.db.execute(
            "SELECT status FROM grants WHERE grant_id='grant-old'"
        ).fetchone()
        self.assertEqual(grant["status"], "invalidated-transition")

    def test_key_creation_replay_preserves_fingerprint(self):
        self.model.begin()
        self.model.prepare()
        first = self.model.ensure_new_key()
        second = self.model.ensure_new_key()
        self.assertEqual(first, second)

    def test_new_key_replacement_after_authorization_fails_closed(self):
        self.model.begin()
        self.model.prepare()
        self.model.ensure_new_key()
        with self.model.ext:
            self.model.ext.execute(
                "UPDATE keys_external SET fingerprint='attacker' WHERE key_id='approval-v2'"
            )
        with self.assertRaises(Refused):
            self.model.ensure_new_key()
        self.assertEqual(self.model.state()["phase"], "repair-required")
        self.assertEqual(self.model.state()["execution_enabled"], 0)

    def test_precommit_crash_can_restore_prior_without_resurrecting_grant(self):
        self.model.issue_grant("grant-old")
        self.model.begin()
        self.model.prepare()
        self.model.ensure_new_key()
        self.assertEqual(self.restart(), "repair-required")
        self.model.repair_restore_prior()
        self.model.assert_execution_ready()
        grant = self.model.db.execute(
            "SELECT status FROM grants WHERE grant_id='grant-old'"
        ).fetchone()
        self.assertEqual(grant["status"], "invalidated-transition")
        new_key = self.model.ext.execute(
            "SELECT present FROM keys_external WHERE key_id='approval-v2'"
        ).fetchone()
        self.assertEqual(new_key["present"], 0)

    def test_postcommit_crash_requires_forward_repair(self):
        self.model.begin()
        self.model.prepare()
        self.model.ensure_new_key()
        self.model.install_target_components()
        self.model.commit_epoch()
        self.assertEqual(self.restart(), "repair-required")
        with self.assertRaisesRegex(Refused, "forward repair"):
            self.model.repair_restore_prior()
        self.model.repair_finish_target()
        self.model.assert_execution_ready()
        self.assertEqual(self.model.state()["epoch"], 2)

    def test_crash_after_external_key_creation_is_reconciled_by_fingerprint(self):
        self.model.begin()
        self.model.prepare()
        observed = {}

        def checkpoint(name: str) -> None:
            if name == "new_key_created_external":
                observed["fingerprint"] = self.model.ext.execute(
                    "SELECT fingerprint FROM keys_external WHERE key_id='approval-v2'"
                ).fetchone()["fingerprint"]
                raise RuntimeError("simulated crash")

        self.model.checkpoint = checkpoint
        with self.assertRaises(RuntimeError):
            self.model.ensure_new_key()
        self.assertEqual(self.restart(), "repair-required")
        self.model.repair_finish_target()
        authorization = self.model.db.execute(
            "SELECT fingerprint FROM key_authorizations WHERE key_id='approval-v2'"
        ).fetchone()
        self.assertEqual(authorization["fingerprint"], observed["fingerprint"])

    def test_stale_component_acceptance_replay_is_denied(self):
        self.model.begin()
        self.model.prepare()
        self.model.ensure_new_key()
        self.model.install_target_components()
        self.model.commit_epoch()
        self.model.retire_old_key()
        for role in ROLES:
            self.model.accept_component(role)
        with self.model.ext:
            self.model.ext.execute(
                "UPDATE components_external SET process_instance='broker-restarted' WHERE role='broker'"
            )
        with self.assertRaisesRegex(Refused, "replayed acceptance"):
            self.model.enable()

    def test_prepared_update_and_transition_replay_are_denied(self):
        self.model.begin()
        self.model.prepare()
        with self.assertRaises(Refused):
            self.model.prepare()
        with self.assertRaises(Refused):
            self.model.begin()

    def test_old_key_is_logically_rejected_immediately_at_epoch_commit(self):
        self.model.begin()
        self.model.prepare()
        self.model.ensure_new_key()
        self.model.install_target_components()
        self.model.commit_epoch()
        self.assertFalse(self.model.authorization_accepts("approval-v1", 1))
        self.assertTrue(self.model.authorization_accepts("approval-v2", 2))
        with self.assertRaises(Refused):
            self.model.assert_execution_ready()


if __name__ == "__main__":
    unittest.main(verbosity=2)
