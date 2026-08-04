from __future__ import annotations

import os
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from model import Refused, RotationModel


HERE = Path(__file__).resolve().parent
CHECKPOINTS = (
    "transition_fenced",
    "prepared_update_persisted",
    "new_key_intent_committed",
    "new_key_created_external",
    "new_key_authorized",
    "component_swap_intent:daemon",
    "component_swapped_external:broker",
    "target_components_verified",
    "epoch_pointer_committed",
    "old_key_retire_intent",
    "old_key_deleted_external",
    "old_key_retirement_observed",
    "component_accepted:broker",
    "execution_enabled",
)


class ExactProcessCrashTest(unittest.TestCase):
    def test_sigkill_at_every_key_transition_boundary_fails_closed(self):
        for checkpoint in CHECKPOINTS:
            with self.subTest(checkpoint=checkpoint), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                marker = root / "marker"
                process = subprocess.Popen(
                    [
                        sys.executable,
                        str(HERE / "crash_worker.py"),
                        "--state",
                        str(root / "state"),
                        "--marker",
                        str(marker),
                        "--checkpoint",
                        checkpoint,
                    ]
                )
                deadline = time.monotonic() + 10
                while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.01)
                self.assertTrue(marker.exists(), f"worker did not reach {checkpoint}")
                recorded_pid, recorded_checkpoint = marker.read_text().strip().split(" ", 1)
                self.assertEqual(int(recorded_pid), process.pid)
                self.assertEqual(recorded_checkpoint, checkpoint)
                os.kill(process.pid, signal.SIGKILL)
                self.assertEqual(process.wait(timeout=5), -signal.SIGKILL)

                model = RotationModel(root / "state")
                outcome = model.recover()
                if checkpoint == "execution_enabled":
                    self.assertEqual(outcome, "stable")
                    model.assert_execution_ready()
                else:
                    self.assertEqual(outcome, "repair-required")
                    with self.assertRaises(Refused):
                        model.assert_execution_ready()
                model.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
