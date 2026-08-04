from __future__ import annotations

import json
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from model import GateFModel


CHECKPOINTS = {
    "grant_issued": "grant",
    "grant_consumed": "grant",
    "backend_intent_committed": "backend",
    "backend_created_external": "backend",
    "backend_handle_persisted": "backend",
    "result_release_intent": "release",
    "result_released_external": "release",
    "result_release_finalized": "release",
    "transition_fenced": "update",
    "prepared_update_persisted": "update",
    "target_trust_state_installed": "update",
    "swap_intent_committed:daemon": "update",
    "component_swapped_external:daemon": "update",
    "swap_observation_committed:daemon": "update",
    "swap_intent_committed:supervisor": "update",
    "component_swapped_external:supervisor": "update",
    "swap_observation_committed:supervisor": "update",
    "pending_verification_committed": "update",
    "epoch_record_staged": "update",
    "epoch_pointer_committed": "update",
    "component_acceptance_persisted:daemon": "update",
    "component_acceptance_persisted:updater": "update",
    "attempts_reenabled": "update",
}


class RealProcessCrashTest(unittest.TestCase):
    worker = Path(__file__).with_name("crash_worker.py")

    def kill_at_checkpoint(self, checkpoint: str) -> tuple[GateFModel, str]:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        state = root / "state"
        marker = root / "checkpoint.json"
        process = subprocess.Popen(
            [
                sys.executable,
                str(self.worker),
                "--state",
                str(state),
                "--marker",
                str(marker),
                "--checkpoint",
                checkpoint,
                "--flow",
                CHECKPOINTS[checkpoint],
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(self.stop_process, process)
        deadline = time.monotonic() + 10
        while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        if not marker.exists():
            if process.poll() is None:
                process.kill()
            stdout, stderr = process.communicate(timeout=5)
            self.fail(
                f"worker did not reach {checkpoint}; return={process.returncode} "
                f"stdout={stdout!r} stderr={stderr!r}"
            )
        observed = json.loads(marker.read_text())
        self.assertEqual(observed["checkpoint"], checkpoint)
        self.assertEqual(observed["pid"], process.pid)
        process.send_signal(signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=5)
        self.assertEqual(
            process.returncode,
            -signal.SIGKILL,
            f"stdout={stdout!r} stderr={stderr!r}",
        )

        model = GateFModel(state)
        self.addCleanup(self.close_model, model)
        return model, model.recover()

    @staticmethod
    def close_model(model: GateFModel) -> None:
        try:
            model.close()
        except sqlite3.ProgrammingError:
            pass

    @staticmethod
    def stop_process(process: subprocess.Popen[str]) -> None:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=5)

    def test_sigkill_restart_at_every_durable_checkpoint_fails_closed(self):
        for checkpoint in CHECKPOINTS:
            with self.subTest(checkpoint=checkpoint):
                model, recovery = self.kill_at_checkpoint(checkpoint)
                state = model.state()
                if checkpoint == "attempts_reenabled":
                    self.assertEqual(recovery, "stable")
                    self.assertEqual(state["current_epoch"], 2)
                    self.assertEqual(state["attempts_enabled"], 1)
                elif CHECKPOINTS[checkpoint] == "update":
                    self.assertEqual(recovery, "repair-required")
                    self.assertEqual(state["attempts_enabled"], 0)
                else:
                    self.assertEqual(recovery, "stable")
                    self.assertEqual(state["current_epoch"], 1)

                if checkpoint == "grant_issued":
                    grant = model.rows("SELECT * FROM grants WHERE grant_id='grant-1'")[0]
                    self.assertEqual(grant["status"], "issued")
                elif checkpoint == "grant_consumed":
                    grant = model.rows("SELECT * FROM grants WHERE grant_id='grant-1'")[0]
                    self.assertEqual(grant["status"], "consumed")
                elif checkpoint == "backend_intent_committed":
                    attempt = model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
                    self.assertEqual(attempt["status"], "unresolved")
                    self.assertEqual(attempt["cleanup_state"], "required")
                elif checkpoint == "backend_created_external":
                    attempt = model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
                    self.assertEqual(attempt["backend_handle"], "guest-attempt-1")
                    self.assertEqual(attempt["cleanup_state"], "required")
                elif checkpoint == "result_release_intent":
                    attempt = model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
                    self.assertEqual(attempt["result_state"], "release-intent")
                elif checkpoint in ("result_released_external", "result_release_finalized"):
                    attempt = model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
                    self.assertEqual(attempt["result_state"], "released")
                model.close()

    def test_ambiguous_external_effect_crashes_repeat_cleanly(self):
        for checkpoint in ("backend_created_external", "result_released_external"):
            for repetition in range(10):
                with self.subTest(checkpoint=checkpoint, repetition=repetition):
                    model, recovery = self.kill_at_checkpoint(checkpoint)
                    self.assertEqual(recovery, "stable")
                    attempt = model.rows("SELECT * FROM attempts WHERE attempt_id='attempt-1'")[0]
                    if checkpoint == "backend_created_external":
                        self.assertEqual(attempt["backend_handle"], "guest-attempt-1")
                        self.assertEqual(attempt["cleanup_state"], "required")
                    else:
                        self.assertEqual(attempt["result_state"], "released")
                    model.close()


if __name__ == "__main__":
    unittest.main()
