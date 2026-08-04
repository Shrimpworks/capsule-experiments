from __future__ import annotations

import json
import os
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

from durability import (
    AuthorityStore,
    atomic_replace_bytes,
    atomic_replace_json,
    verify_bundle,
    write_external_effect,
)


WORKER = Path(__file__).with_name("worker.py")


class ProcessHarness(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="capsule-gate-f-durability-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

    def spawn(self, *arguments: str) -> subprocess.Popen[str]:
        process = subprocess.Popen(
            [sys.executable, str(WORKER), *arguments],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self.addCleanup(self.stop_process, process)
        return process

    @staticmethod
    def stop_process(process: subprocess.Popen[str]) -> None:
        if process.poll() is None:
            process.kill()
            process.communicate(timeout=10)

    def wait_for_marker(
        self,
        process: subprocess.Popen[str],
        marker: Path,
        expected: str,
    ) -> dict[str, object]:
        deadline = time.monotonic() + 15
        while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        if not marker.exists():
            if process.poll() is None:
                process.kill()
            stdout, stderr = process.communicate(timeout=10)
            self.fail(
                f"worker never reached {expected}; return={process.returncode}; "
                f"stdout={stdout!r}; stderr={stderr!r}"
            )
        observed = json.loads(marker.read_text(encoding="utf-8"))
        self.assertEqual(observed["checkpoint"], expected)
        self.assertEqual(observed["pid"], process.pid)
        return observed

    def kill_at(
        self,
        process: subprocess.Popen[str],
        marker: Path,
        expected: str,
    ) -> None:
        self.wait_for_marker(process, marker, expected)
        process.send_signal(signal.SIGKILL)
        stdout, stderr = process.communicate(timeout=10)
        self.assertEqual(
            process.returncode,
            -signal.SIGKILL,
            f"stdout={stdout!r}; stderr={stderr!r}",
        )

    def run_worker(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(WORKER), *arguments],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )


class AtomicFileOrderingTest(ProcessHarness):
    def test_sqlite_fullfsync_and_checkpoint_fullfsync_are_enabled(self) -> None:
        state = self.root / "fullfsync"
        store = AuthorityStore(state)
        store.initialize()
        self.assertEqual(store.connection.execute("PRAGMA fullfsync").fetchone()[0], 1)
        self.assertEqual(
            store.connection.execute("PRAGMA checkpoint_fullfsync").fetchone()[0],
            1,
        )
        store.close()

    def test_sigkill_at_each_atomic_replace_boundary_has_only_old_or_new_target(self) -> None:
        for checkpoint in ("temp-fsynced", "renamed", "directory-fsynced"):
            with self.subTest(checkpoint=checkpoint):
                case = self.root / checkpoint
                target = case / "data" / "manifest.json"
                marker = case / "markers" / "checkpoint.json"
                atomic_replace_bytes(target, b"version-1")
                process = self.spawn(
                    "atomic-replace",
                    "--target",
                    str(target),
                    "--payload",
                    "version-2",
                    "--marker",
                    str(marker),
                    "--checkpoint",
                    checkpoint,
                )
                self.kill_at(process, marker, checkpoint)
                expected = b"version-1" if checkpoint == "temp-fsynced" else b"version-2"
                self.assertEqual(target.read_bytes(), expected)

    def test_database_commit_and_checkpoint_replace_never_create_ready_mixed_state(self) -> None:
        checkpoints = (
            "database-committed",
            "checkpoint-temp-fsynced",
            "checkpoint-renamed",
            "checkpoint-directory-fsynced",
        )
        for checkpoint in checkpoints:
            with self.subTest(checkpoint=checkpoint):
                case = self.root / checkpoint
                marker = case / "markers" / "checkpoint.json"
                process = self.spawn(
                    "fence-flow",
                    "--root",
                    str(case / "state"),
                    "--marker",
                    str(marker),
                    "--checkpoint",
                    checkpoint,
                )
                self.kill_at(process, marker, checkpoint)
                verification = verify_bundle(case / "state")
                self.assertFalse(verification.ready)
                self.assertIn(
                    verification.status,
                    {"checkpoint-mismatch", "repair-required"},
                )
                self.assertEqual(verification.state["attempts_enabled"], 0)  # type: ignore[index]


class ConcurrentWriterTest(ProcessHarness):
    def test_lock_contention_refuses_second_writer_without_partial_state(self) -> None:
        state = self.root / "state"
        store = AuthorityStore(state)
        store.initialize()
        store.close()

        marker = self.root / "markers" / "lock.json"
        holder = self.spawn(
            "hold-lock", "--root", str(state), "--marker", str(marker)
        )
        self.wait_for_marker(holder, marker, "writer-lock-held")

        result = self.root / "contender.json"
        self.run_worker(
            "try-fence",
            "--root",
            str(state),
            "--transition",
            "contender",
            "--result",
            str(result),
        )
        self.assertEqual(json.loads(result.read_text())["status"], "locked")
        holder.send_signal(signal.SIGKILL)
        holder.communicate(timeout=10)
        self.assertEqual(holder.returncode, -signal.SIGKILL)
        self.assertTrue(verify_bundle(state).ready)

        retry = self.root / "retry.json"
        self.run_worker(
            "try-fence",
            "--root",
            str(state),
            "--transition",
            "retry",
            "--result",
            str(retry),
        )
        self.assertEqual(json.loads(retry.read_text())["status"], "committed")
        self.assertEqual(verify_bundle(state).status, "repair-required")

    def test_two_process_compare_and_swap_allows_one_epoch_advance(self) -> None:
        for repetition in range(10):
            with self.subTest(repetition=repetition):
                case = self.root / f"cas-{repetition}"
                state = case / "state"
                store = AuthorityStore(state)
                store.initialize()
                store.close()
                start = case / "start.json"
                results = [case / f"result-{number}.json" for number in range(2)]
                processes = [
                    self.spawn(
                        "cas-epoch",
                        "--root",
                        str(state),
                        "--expected",
                        "1",
                        "--target-epoch",
                        "2",
                        "--start",
                        str(start),
                        "--result",
                        str(result),
                    )
                    for result in results
                ]
                atomic_replace_json(start, {"start": True})
                for process in processes:
                    stdout, stderr = process.communicate(timeout=15)
                    self.assertEqual(
                        process.returncode,
                        0,
                        f"stdout={stdout!r}; stderr={stderr!r}",
                    )
                statuses = sorted(
                    json.loads(path.read_text())["status"] for path in results
                )
                self.assertEqual(statuses, ["committed", "mismatch"])
                verification = verify_bundle(state)
                self.assertTrue(verification.ready)
                self.assertEqual(verification.state["epoch"], 2)  # type: ignore[index]


class DiskFullSimulationTest(ProcessHarness):
    def test_sqlite_max_page_count_rolls_back_entire_fence_transaction(self) -> None:
        database = self.root / "quota.sqlite"
        connection = sqlite3.connect(database, isolation_level=None)
        connection.execute("PRAGMA page_size=1024")
        connection.execute("PRAGMA journal_mode=DELETE")
        connection.execute("PRAGMA synchronous=FULL")
        connection.executescript(
            """
            CREATE TABLE security_state(
              singleton INTEGER PRIMARY KEY,
              attempts_enabled INTEGER NOT NULL,
              phase TEXT NOT NULL
            );
            CREATE TABLE payload(value BLOB NOT NULL);
            INSERT INTO security_state VALUES(1,1,'stable');
            """
        )
        page_count = connection.execute("PRAGMA page_count").fetchone()[0]
        connection.execute(f"PRAGMA max_page_count={page_count + 2}")
        with self.assertRaisesRegex(sqlite3.OperationalError, "full"):
            try:
                connection.execute("BEGIN IMMEDIATE")
                connection.execute(
                    "UPDATE security_state SET attempts_enabled=0,phase='repair-required'"
                )
                connection.execute("INSERT INTO payload(value) VALUES(?)", (os.urandom(128_000),))
                connection.execute("COMMIT")
            except BaseException:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise
        row = connection.execute("SELECT * FROM security_state").fetchone()
        self.assertEqual(row, (1, 1, "stable"))
        connection.close()

    def test_disk_full_after_external_effect_preserves_prior_cleanup_intent(self) -> None:
        state = self.root / "state"
        external = state / "external" / "guest-attempt-1.json"
        store = AuthorityStore(state)
        store.initialize()
        store.issue_and_consume("grant-1", "attempt-1")
        store.persist_effect_intent("backend-attempt-1", "backend-create")
        write_external_effect(
            external,
            effect_key="backend-attempt-1",
            handle="guest-attempt-1",
        )
        store.checkpoint_truncate()
        page_count = store.connection.execute("PRAGMA page_count").fetchone()[0]
        store.connection.execute(f"PRAGMA max_page_count={page_count}")
        with self.assertRaisesRegex(sqlite3.OperationalError, "full"):
            try:
                store.connection.execute("BEGIN IMMEDIATE")
                store.connection.execute(
                    """UPDATE effects SET status='observed',observed_handle='guest-attempt-1'
                       WHERE effect_key='backend-attempt-1'"""
                )
                store.connection.execute(
                    "INSERT INTO events(kind,detail) VALUES('oversized-observation',?)",
                    (os.urandom(1_000_000),),
                )
                store.connection.execute("COMMIT")
            except BaseException:
                if store.connection.in_transaction:
                    store.connection.execute("ROLLBACK")
                raise
        self.assertEqual(store.effect_row("backend-attempt-1")["status"], "intent")  # type: ignore[index]
        self.assertEqual(store.attempt_row("attempt-1")["cleanup_state"], "required")  # type: ignore[index]
        store.connection.execute("PRAGMA max_page_count=1073741823")
        self.assertEqual(
            store.reconcile_effect("backend-attempt-1", external),
            "observed",
        )
        self.assertEqual(store.attempt_row("attempt-1")["cleanup_state"], "required")  # type: ignore[index]
        store.close()


class WALRecoveryTest(ProcessHarness):
    @staticmethod
    def read_security_state(database: Path) -> tuple[int, str]:
        connection = sqlite3.connect(database)
        try:
            return connection.execute(
                "SELECT attempts_enabled,phase FROM security_state WHERE singleton=1"
            ).fetchone()
        finally:
            connection.close()

    def test_sigkill_with_committed_wal_recovers_the_fence(self) -> None:
        database = self.root / "wal.sqlite"
        marker = self.root / "markers" / "wal.json"
        process = self.spawn(
            "wal-holder",
            "--database",
            str(database),
            "--marker",
            str(marker),
        )
        self.wait_for_marker(process, marker, "wal-commit-visible")
        self.assertTrue(Path(f"{database}-wal").exists())
        self.kill_at(process, marker, "wal-commit-visible")
        self.assertEqual(self.read_security_state(database), (0, "repair-required"))

    def test_sigkill_before_and_after_checkpoint_boundary_recovers_fence(self) -> None:
        for checkpoint in ("before-checkpoint", "after-checkpoint"):
            with self.subTest(checkpoint=checkpoint):
                case = self.root / checkpoint
                case.mkdir()
                database = case / "state.sqlite"
                marker = case / "markers" / "checkpoint.json"
                process = self.spawn(
                    "checkpoint-boundary",
                    "--database",
                    str(database),
                    "--marker",
                    str(marker),
                    "--checkpoint",
                    checkpoint,
                )
                self.kill_at(process, marker, checkpoint)
                self.assertEqual(self.read_security_state(database), (0, "repair-required"))

    def test_truncated_wal_can_hide_committed_fence_but_newer_anchor_detects_it(self) -> None:
        source = self.root / "source"
        source.mkdir()
        database = source / "state.sqlite"
        anchor = source / "anchor.json"
        marker = self.root / "markers" / "wal-damage.json"
        process = self.spawn(
            "wal-holder",
            "--database",
            str(database),
            "--marker",
            str(marker),
            "--anchor",
            str(anchor),
        )
        self.kill_at(process, marker, "wal-commit-visible")
        wal_source = Path(f"{database}-wal")
        self.assertTrue(wal_source.exists())
        intact = self.root / "intact"
        damaged = self.root / "damaged"
        intact.mkdir()
        damaged.mkdir()
        shutil.copy2(database, intact / "state.sqlite")
        shutil.copy2(wal_source, intact / "state.sqlite-wal")
        shutil.copy2(anchor, intact / "anchor.json")
        shutil.copy2(database, damaged / "state.sqlite")
        wal_target = damaged / "state.sqlite-wal"
        shutil.copy2(wal_source, wal_target)
        shutil.copy2(anchor, damaged / "anchor.json")
        self.assertEqual(
            self.read_security_state(intact / "state.sqlite"),
            (0, "repair-required"),
        )
        with wal_target.open("r+b") as stream:
            stream.truncate(32)
            stream.flush()
            os.fsync(stream.fileno())
        anchor_value = json.loads((damaged / "anchor.json").read_text())
        try:
            database_value = self.read_security_state(damaged / "state.sqlite")
        except sqlite3.DatabaseError:
            outcome = "corrupt"
        else:
            outcome = "match" if database_value[0] == int(anchor_value["attemptsEnabled"]) else "mismatch"
        self.assertIn(outcome, {"corrupt", "mismatch"})


class CorruptionAndRestoreTest(ProcessHarness):
    def quiescent_snapshot(self, source: Path, destination: Path) -> None:
        store = AuthorityStore(source)
        store.checkpoint_truncate()
        store.close()
        shutil.copytree(source, destination)

    def test_truncated_database_is_classified_corrupt(self) -> None:
        state = self.root / "state"
        store = AuthorityStore(state)
        store.initialize()
        store.checkpoint_truncate()
        store.close()
        database = state / "authority.sqlite"
        with database.open("r+b") as stream:
            stream.truncate(database.stat().st_size // 2)
            stream.flush()
            os.fsync(stream.fileno())
        self.assertEqual(verify_bundle(state).status, "corrupt")

    def test_logical_database_tamper_is_detected_by_checkpoint(self) -> None:
        state = self.root / "state"
        store = AuthorityStore(state)
        store.initialize()
        store.connection.execute(
            "UPDATE installation SET epoch=77,epoch_digest='tampered' WHERE singleton=1"
        )
        store.checkpoint_truncate()
        store.close()
        self.assertEqual(verify_bundle(state).status, "checkpoint-mismatch")

    def test_partial_restore_fails_closed_but_coherent_restore_is_not_detected(self) -> None:
        current = self.root / "current"
        store = AuthorityStore(current)
        store.initialize()
        store.checkpoint_truncate()
        store.close()
        version_one = self.root / "version-one"
        shutil.copytree(current, version_one)

        store = AuthorityStore(current)
        store.fence_transition("update-2")
        store.finalize_epoch("update-2", 2)
        store.checkpoint_truncate()
        store.close()
        version_two = self.root / "version-two"
        shutil.copytree(current, version_two)

        old_database_new_anchor = self.root / "old-db-new-anchor"
        shutil.copytree(version_two, old_database_new_anchor)
        shutil.copy2(
            version_one / "authority.sqlite",
            old_database_new_anchor / "authority.sqlite",
        )
        self.assertEqual(
            verify_bundle(old_database_new_anchor).status,
            "checkpoint-mismatch",
        )

        new_database_old_anchor = self.root / "new-db-old-anchor"
        shutil.copytree(version_two, new_database_old_anchor)
        shutil.copy2(
            version_one / "checkpoint.json",
            new_database_old_anchor / "checkpoint.json",
        )
        self.assertEqual(
            verify_bundle(new_database_old_anchor).status,
            "checkpoint-mismatch",
        )

        coherent_old_world = self.root / "coherent-old-world"
        shutil.copytree(version_one, coherent_old_world)
        verification = verify_bundle(coherent_old_world)
        self.assertTrue(verification.ready)
        self.assertEqual(verification.state["epoch"], 1)  # type: ignore[index]


class ClockFailureTest(ProcessHarness):
    def test_wall_clock_rollback_fences_attempts(self) -> None:
        state = self.root / "rollback"
        store = AuthorityStore(state)
        store.initialize(wall_ms=10_000)
        self.assertEqual(store.observe_clock(11_000), "trusted")
        self.assertEqual(store.observe_clock(9_000), "rollback-detected")
        self.assertEqual(store.verify().status, "clock-untrusted")
        self.assertEqual(store.row()["attempts_enabled"], 0)
        store.close()

    def test_unavailable_security_clock_fences_attempts(self) -> None:
        state = self.root / "unavailable"
        store = AuthorityStore(state)
        store.initialize(wall_ms=10_000)
        self.assertEqual(store.observe_clock(None), "unavailable")
        self.assertEqual(store.verify().status, "clock-untrusted")
        self.assertEqual(store.row()["attempts_enabled"], 0)
        store.close()


class ExternalEffectCrashTest(ProcessHarness):
    def test_installer_crashes_reconcile_without_reenabling_execution(self) -> None:
        checkpoints = (
            "installer-intent-durable",
            "installer-effect-visible",
            "installer-observation-durable",
        )
        for checkpoint in checkpoints:
            with self.subTest(checkpoint=checkpoint):
                case = self.root / checkpoint
                marker = case / "markers" / "checkpoint.json"
                process = self.spawn(
                    "installer-flow",
                    "--root",
                    str(case / "state"),
                    "--marker",
                    str(marker),
                    "--checkpoint",
                    checkpoint,
                )
                self.kill_at(process, marker, checkpoint)
                store = AuthorityStore(case / "state")
                self.assertEqual(store.verify().status, "repair-required")
                external = case / "state" / "external" / "component-v2.json"
                reconciliation = store.reconcile_effect("install-component-v2", external)
                expected = "outcome-unknown" if checkpoint == "installer-intent-durable" else "observed"
                self.assertEqual(reconciliation, expected)
                self.assertEqual(store.row()["attempts_enabled"], 0)
                store.close()

    def test_backend_crashes_preserve_consumed_grant_and_cleanup_obligation(self) -> None:
        checkpoints = (
            "backend-intent-durable",
            "backend-effect-visible",
            "backend-observation-durable",
        )
        for checkpoint in checkpoints:
            with self.subTest(checkpoint=checkpoint):
                case = self.root / checkpoint
                marker = case / "markers" / "checkpoint.json"
                process = self.spawn(
                    "backend-flow",
                    "--root",
                    str(case / "state"),
                    "--marker",
                    str(marker),
                    "--checkpoint",
                    checkpoint,
                )
                self.kill_at(process, marker, checkpoint)
                store = AuthorityStore(case / "state")
                grant = store.connection.execute(
                    "SELECT * FROM grants WHERE grant_id='grant-1'"
                ).fetchone()
                self.assertEqual(grant["status"], "consumed")
                attempt = store.attempt_row("attempt-1")
                self.assertEqual(attempt["cleanup_state"], "required")  # type: ignore[index]
                external = case / "state" / "external" / "guest-attempt-1.json"
                reconciliation = store.reconcile_effect("backend-attempt-1", external)
                expected = "outcome-unknown" if checkpoint == "backend-intent-durable" else "observed"
                self.assertEqual(reconciliation, expected)
                self.assertEqual(store.attempt_row("attempt-1")["cleanup_state"], "required")  # type: ignore[index]
                if external.exists():
                    self.run_worker(
                        "external-effect",
                        "--operation",
                        "delete",
                        "--path",
                        str(external),
                    )
                    store.mark_backend_destroyed("attempt-1")
                    self.assertEqual(
                        store.attempt_row("attempt-1")["cleanup_state"],  # type: ignore[index]
                        "destroyed",
                    )
                store.close()


if __name__ == "__main__":
    unittest.main()
