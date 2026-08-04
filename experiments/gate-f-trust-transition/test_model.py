import shutil
import sqlite3
import tempfile
import unittest
from pathlib import Path

from model import GateFModel, InjectedCrash, ROLES, Refused


class ModelTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.model = GateFModel(self.root)
        self.model.initialize()

    def tearDown(self):
        try:
            self.model.close()
        except sqlite3.ProgrammingError:  # closed by injected crash
            pass
        self.tmp.cleanup()

    def restart(self):
        try:
            self.model.close()
        except sqlite3.ProgrammingError:  # already closed by injected crash
            pass
        self.model = GateFModel(self.root)
        return self.model.recover()

    def prepare_and_swap(self):
        target = self.model.target_v2()
        self.model.begin_update("update-1", target)
        self.model.prepare_update("update-1")
        self.model.install_target_trust_state("update-1")
        for role in ROLES:
            self.model.swap_component("update-1", role)
        return target

    def finish_update(self):
        self.prepare_and_swap()
        self.model.enter_pending_verification("update-1")
        self.model.stage_epoch("update-1")
        self.model.commit_epoch("update-1")
        for role in ROLES:
            self.model.accept_epoch("update-1", role)
        self.model.enable_stable("update-1")

    def test_happy_path_requires_all_component_acceptances(self):
        self.prepare_and_swap()
        self.model.enter_pending_verification("update-1")
        self.model.stage_epoch("update-1")
        self.model.commit_epoch("update-1")
        for role in ROLES[:-1]:
            self.model.accept_epoch("update-1", role)
        with self.assertRaises(Refused):
            self.model.enable_stable("update-1")
        self.model.accept_epoch("update-1", ROLES[-1])
        self.model.enable_stable("update-1")
        self.assertEqual(self.model.recover(), "stable")
        self.assertEqual(self.model.state()["current_epoch"], 2)

    def test_old_daemon_new_supervisor_fails_closed(self):
        target = self.model.target_v2()
        self.model.begin_update("update-1", target)
        self.model.prepare_update("update-1")
        self.model.install_target_trust_state("update-1")
        self.model.swap_component("update-1", "supervisor")
        with self.assertRaises(Refused):
            self.model.enter_pending_verification("update-1")
        self.assertEqual(self.model.state()["phase"], "repair-required")

    def test_new_daemon_old_supervisor_fails_closed(self):
        target = self.model.target_v2()
        self.model.begin_update("update-1", target)
        self.model.prepare_update("update-1")
        self.model.install_target_trust_state("update-1")
        self.model.swap_component("update-1", "daemon")
        with self.assertRaises(Refused):
            self.model.enter_pending_verification("update-1")
        self.assertEqual(self.model.state()["phase"], "repair-required")

    def test_changed_entitlement_fails_closed(self):
        self.prepare_and_swap()
        with self.model.ext:
            self.model.ext.execute("UPDATE components SET entitlement='tampered' WHERE role='broker'")
        with self.assertRaises(Refused):
            self.model.enter_pending_verification("update-1")
        self.assertEqual(self.model.state()["phase"], "repair-required")

    def test_policy_profile_checkpoint_mismatch_fails_closed(self):
        self.prepare_and_swap()
        with self.model.ext:
            self.model.ext.execute("UPDATE trust_state SET profile='stale-profile'")
        with self.assertRaises(Refused):
            self.model.enter_pending_verification("update-1")
        self.assertEqual(self.model.state()["phase"], "repair-required")

    def test_missing_manifest_fails_closed(self):
        with self.model.db:
            self.model.db.execute("DELETE FROM epochs WHERE epoch=1")
        self.assertEqual(self.restart(), "repair-required")
        with self.assertRaises(Refused):
            self.model.assert_execution_ready()

    def test_stale_broker_epoch_fails_closed(self):
        self.finish_update()
        with self.model.ext:
            self.model.ext.execute("UPDATE components SET accepted_epoch_digest='epoch-1' WHERE role='broker'")
        self.assertEqual(self.model.recover(), "repair-required")

    def test_stale_supervisor_identity_fails_closed(self):
        self.finish_update()
        with self.model.ext:
            self.model.ext.execute("UPDATE components SET identity='supervisor-v1' WHERE role='supervisor'")
        self.assertEqual(self.model.recover(), "repair-required")

    def test_unused_grant_is_invalidated_by_transition_and_not_restored_by_repair(self):
        self.model.issue_grant("grant-1")
        self.model.begin_update("update-1", self.model.target_v2())
        self.model.prepare_update("update-1")
        self.model._repair("test interruption")
        self.model.repair_restore_prior("update-1")
        grant = self.model.rows("SELECT * FROM grants WHERE grant_id='grant-1'")[0]
        self.assertEqual(grant["status"], "invalidated-transition")
        with self.assertRaises(Refused):
            self.model.consume_grant("grant-1", "attempt-replay")

    def test_consumed_grant_survives_crash_before_backend_launch(self):
        self.model.issue_grant("grant-1")
        self.model.fault_at = "grant_consumed"
        with self.assertRaises(InjectedCrash):
            self.model.consume_grant("grant-1", "attempt-1")
        self.restart()
        grant = self.model.rows("SELECT * FROM grants WHERE grant_id='grant-1'")[0]
        self.assertEqual(grant["status"], "consumed")
        with self.assertRaises(Refused):
            self.model.consume_grant("grant-1", "attempt-2")

    def test_crash_after_grant_issuance_leaves_it_unused_before_any_side_effect(self):
        self.model.fault_at = "grant_issued"
        with self.assertRaises(InjectedCrash):
            self.model.issue_grant("grant-1")
        self.restart()
        grant = self.model.rows("SELECT * FROM grants WHERE grant_id='grant-1'")[0]
        self.assertEqual(grant["status"], "issued")

    def test_crash_after_backend_intent_keeps_cleanup_obligation_even_without_observed_guest(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.fault_at = "backend_intent_committed"
        with self.assertRaises(InjectedCrash):
            self.model.launch_backend("attempt-1")
        self.restart()
        attempt = self.model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
        self.assertEqual(attempt["status"], "unresolved")
        self.assertEqual(attempt["cleanup_state"], "required")

    def test_crash_after_external_backend_create_discovers_orphan(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.fault_at = "backend_created_external"
        with self.assertRaises(InjectedCrash):
            self.model.launch_backend("attempt-1")
        self.restart()
        attempt = self.model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
        self.assertEqual(attempt["status"], "unresolved")
        self.assertEqual(attempt["cleanup_state"], "required")
        self.assertEqual(attempt["backend_handle"], "guest-attempt-1")

    def test_completed_external_release_is_observed_not_rolled_back(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.launch_backend("attempt-1")
        self.model.complete_attempt("attempt-1")
        self.model.fault_at = "result_released_external"
        with self.assertRaises(InjectedCrash):
            self.model.release_result("attempt-1")
        self.restart()
        attempt = self.model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
        self.assertEqual(attempt["result_state"], "released")

    def test_crash_after_result_finalization_preserves_release(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.launch_backend("attempt-1")
        self.model.complete_attempt("attempt-1")
        self.model.fault_at = "result_release_finalized"
        with self.assertRaises(InjectedCrash):
            self.model.release_result("attempt-1")
        self.restart()
        attempt = self.model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
        self.assertEqual(attempt["result_state"], "released")

    def test_unresolved_result_release_blocks_epoch_advancement(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.launch_backend("attempt-1")
        self.model.complete_attempt("attempt-1")
        self.model.fault_at = "result_release_intent"
        with self.assertRaises(InjectedCrash):
            self.model.release_result("attempt-1")
        self.restart()
        with self.assertRaisesRegex(Refused, "result-release"):
            self.model.begin_update("update-1", self.model.target_v2())

    def test_update_refuses_unreconciled_attempt(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        with self.assertRaises(Refused):
            self.model.begin_update("update-1", self.model.target_v2())

    def test_committed_epoch_cannot_be_rewound_by_repair(self):
        self.prepare_and_swap()
        self.model.enter_pending_verification("update-1")
        self.model.stage_epoch("update-1")
        self.model.commit_epoch("update-1")
        self.model._repair("crash after epoch commit")
        with self.assertRaisesRegex(Refused, "new epoch"):
            self.model.repair_restore_prior("update-1")

    def test_irreversible_migration_forbids_prior_restore(self):
        target = self.model.target_v2(migration_reversible=False)
        self.model.begin_update("update-1", target)
        self.model.prepare_update("update-1")
        self.model._repair("interrupted")
        with self.assertRaisesRegex(Refused, "irreversible"):
            self.model.repair_restore_prior("update-1")

    def test_new_external_effect_after_fence_forbids_prior_restore(self):
        self.model.begin_update("update-1", self.model.target_v2())
        self.model.prepare_update("update-1")
        with self.model.ext:
            self.model.ext.execute(
                "INSERT INTO effects(attempt_id,idempotency_key,kind,status) VALUES(?,?,?,?)",
                ("older-attempt", "late-effect", "external-delivery", "completed"),
            )
        self.model._repair("late completion discovered")
        with self.assertRaisesRegex(Refused, "external effects"):
            self.model.repair_restore_prior("update-1")

    def test_prepared_update_replay_is_rejected(self):
        self.model.begin_update("update-1", self.model.target_v2())
        self.model.prepare_update("update-1")
        with self.assertRaises(Refused):
            self.model.prepare_update("update-1")
        with self.assertRaises(Refused):
            self.model.begin_update("update-1", self.model.target_v2())

    def test_tampered_prepared_update_is_rejected(self):
        self.model.begin_update("update-1", self.model.target_v2())
        self.model.prepare_update("update-1")
        with self.model.db:
            self.model.db.execute(
                "UPDATE transitions SET target=replace(target,'policy-v2','attacker-policy') WHERE transition_id='update-1'"
            )
        with self.assertRaisesRegex(Refused, "PreparedUpdate digest mismatch"):
            self.model.install_target_trust_state("update-1")
        self.assertEqual(self.model.state()["phase"], "repair-required")

    def test_stale_component_acceptance_replay_is_rejected(self):
        self.prepare_and_swap()
        self.model.enter_pending_verification("update-1")
        self.model.stage_epoch("update-1")
        self.model.commit_epoch("update-1")
        for role in ROLES:
            self.model.accept_epoch("update-1", role)
        with self.model.ext:
            self.model.ext.execute(
                "UPDATE components SET process_instance='restarted-broker' WHERE role='broker'"
            )
        with self.assertRaisesRegex(Refused, "stale or replayed"):
            self.model.enable_stable("update-1")

    def test_partial_snapshot_restore_is_detected(self):
        backup = self.root / "control-before.sqlite"
        self.model.db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        shutil.copy2(self.model.control_path, backup)
        self.finish_update()
        self.model.close()
        shutil.copy2(backup, self.root / "control.sqlite")
        self.model = GateFModel(self.root)
        self.assertEqual(self.model.recover(), "repair-required")

    def test_coherent_snapshot_restore_is_not_detectable_without_anchor(self):
        self.model.db.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        self.model.ext.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        control_backup = self.root / "control-before.sqlite"
        external_backup = self.root / "external-before.sqlite"
        shutil.copy2(self.model.control_path, control_backup)
        shutil.copy2(self.model.external_path, external_backup)
        self.finish_update()
        self.model.close()
        shutil.copy2(control_backup, self.root / "control.sqlite")
        shutil.copy2(external_backup, self.root / "external.sqlite")
        self.model = GateFModel(self.root)
        self.assertEqual(self.model.recover(), "stable")
        self.assertEqual(self.model.state()["current_epoch"], 1)

    def test_repair_preserves_grant_attempt_and_history(self):
        self.model.issue_grant("grant-1")
        self.model.consume_grant("grant-1", "attempt-1")
        self.model.launch_backend("attempt-1")
        self.model.complete_attempt("attempt-1")
        self.model.begin_update("update-1", self.model.target_v2())
        before = len(self.model.rows("SELECT * FROM events"))
        self.model.prepare_update("update-1")
        self.model._repair("fault")
        self.model.repair_restore_prior("update-1")
        self.assertEqual(len(self.model.rows("SELECT * FROM grants")), 1)
        self.assertEqual(len(self.model.rows("SELECT * FROM attempts")), 1)
        self.assertGreater(len(self.model.rows("SELECT * FROM events")), before)

    def test_crash_after_each_update_checkpoint_never_runs_mixed(self):
        checkpoints = [
            "transition_fenced",
            "prepared_update_persisted",
            "target_trust_state_installed",
            "swap_intent_committed:daemon",
            "component_swapped_external:daemon",
            "swap_observation_committed:daemon",
            "pending_verification_committed",
            "epoch_record_staged",
            "epoch_pointer_committed",
            "component_acceptance_persisted:daemon",
        ]
        for checkpoint in checkpoints:
            with self.subTest(checkpoint=checkpoint), tempfile.TemporaryDirectory() as tmp:
                model = GateFModel(Path(tmp), fault_at=checkpoint)
                model.initialize()
                model.issue_grant("old-grant")
                try:
                    target = model.target_v2()
                    model.begin_update("update-1", target)
                    model.prepare_update("update-1")
                    model.install_target_trust_state("update-1")
                    for role in ROLES:
                        model.swap_component("update-1", role)
                    model.enter_pending_verification("update-1")
                    model.stage_epoch("update-1")
                    model.commit_epoch("update-1")
                    for role in ROLES:
                        model.accept_epoch("update-1", role)
                    model.enable_stable("update-1")
                except InjectedCrash:
                    pass
                restarted = GateFModel(Path(tmp))
                self.assertEqual(restarted.recover(), "repair-required")
                with self.assertRaises(Refused):
                    restarted.assert_execution_ready()
                grant = restarted.rows("SELECT * FROM grants WHERE grant_id='old-grant'")[0]
                self.assertEqual(grant["status"], "invalidated-transition")
                restarted.close()

    def test_authorized_repair_can_finish_a_partially_swapped_target(self):
        target = self.model.target_v2()
        self.model.begin_update("update-1", target)
        self.model.prepare_update("update-1")
        self.model.install_target_trust_state("update-1")
        self.model.swap_component("update-1", "supervisor")
        self.assertEqual(self.restart(), "repair-required")
        for role in ("daemon", "broker", "updater"):
            self.model.swap_component("update-1", role)
        self.model.repair_resume_target("update-1")
        self.model.stage_epoch("update-1")
        self.model.commit_epoch("update-1")
        for role in ROLES:
            self.model.accept_epoch("update-1", role)
        self.model.enable_stable("update-1")
        self.assertEqual(self.model.recover(), "stable")

    def test_crash_after_reenable_is_already_stable(self):
        self.model.fault_at = "attempts_reenabled"
        with self.assertRaises(InjectedCrash):
            self.finish_update()
        self.assertEqual(self.restart(), "stable")
        self.model.assert_execution_ready()


if __name__ == "__main__":
    unittest.main(verbosity=2)
