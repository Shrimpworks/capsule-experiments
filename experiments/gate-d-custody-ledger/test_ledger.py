"""Adversarial multi-process tests for the development-only Gate D ledger."""

from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import unittest
from dataclasses import asdict, replace
from pathlib import Path

from ledger import Binding, Ledger, LedgerError, now_ms, random_id


HERE = Path(__file__).resolve().parent
WORKER = HERE / "worker.py"
BROKER = HERE / "broker_service.py"
SUPERVISOR = HERE / "supervisor_client.py"
PYTHON = sys.executable


class CustodyLedgerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="capsule-gate-d-ledger-")
        self.root = Path(self.temporary.name)
        self.db = self.root / "broker.sqlite3"
        self.store = self.root / "private-content"
        self.ledger = Ledger(self.db, self.store)
        self.ledger.initialize()
        self.socket_paths: list[Path] = []
        self.socket_root = HERE / ".test-sockets"
        self.socket_root.mkdir(mode=0o700, exist_ok=True)
        self.binding = Binding("install-1", "epoch-1", "registration-1", "attempt-1")
        self.ledger.create_attempt(self.binding)

    def tearDown(self) -> None:
        for socket_path in self.socket_paths:
            try:
                socket_path.unlink()
            except FileNotFoundError:
                pass
        try:
            self.socket_root.rmdir()
        except OSError:
            pass
        self.temporary.cleanup()

    def binding_json(self, binding: Binding | None = None) -> str:
        return json.dumps(asdict(binding or self.binding), separators=(",", ":"))

    def snapshot(self, payload: bytes = b"exact approved bytes", retain: int | None = None):
        source = self.root / f"selected-{random_id()}"
        source.write_bytes(payload)
        current = now_ms()
        reference = self.ledger.snapshot_regular_file(
            source,
            "primary-data",
            max(len(payload), 1) + 16,
            retain if retain is not None else current + 60_000,
        )
        return source, reference

    def issue_input(self, reference: dict[str, object], *, offset_ms: int = 30_000) -> str:
        current = now_ms()
        return self.ledger.issue_input_handle(
            str(reference["opaqueContentId"]),
            self.binding,
            current + offset_ms,
            current + offset_ms + 30_000,
        )

    def issue_output(self, max_bytes: int = 1024, *, offset_ms: int = 30_000) -> str:
        current = now_ms()
        return self.ledger.issue_output_handle(
            self.binding,
            max_bytes,
            current + offset_ms,
            current + offset_ms + 30_000,
        )

    def worker(
        self,
        action: str,
        *,
        handle: str | None = None,
        redemption: str | None = None,
        binding: Binding | None = None,
        extra: list[str] | None = None,
        check: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            PYTHON,
            os.fspath(WORKER),
            "--db",
            os.fspath(self.db),
            "--store",
            os.fspath(self.store),
            "--action",
            action,
        ]
        if binding is not None or action in {"redeem-input", "begin-output", "commit-output"}:
            command.extend(["--binding-json", self.binding_json(binding)])
        if handle is not None:
            command.extend(["--handle", handle])
        if redemption is not None:
            command.extend(["--redemption", redemption])
        if extra:
            command.extend(extra)
        return subprocess.run(command, text=True, capture_output=True, check=check, timeout=20)

    def start_broker(
        self,
        direction: str,
        *,
        crash: str | None = None,
        peer_role: str = "supervisor",
    ) -> tuple[subprocess.Popen[str], Path]:
        socket_path = self.socket_root / f"{os.getpid()}-{random_id()[:8]}.sock"
        self.socket_paths.append(socket_path)
        command = [
            PYTHON,
            os.fspath(BROKER),
            "--db",
            os.fspath(self.db),
            "--store",
            os.fspath(self.store),
            "--socket",
            os.fspath(socket_path),
            "--direction",
            direction,
            "--peer-role",
            peer_role,
        ]
        if crash is not None:
            command.extend(["--crash", crash])
        process = subprocess.Popen(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 10
        while not socket_path.exists():
            if process.poll() is not None:
                stdout, stderr = process.communicate()
                self.fail(f"broker exited before ready: {process.returncode}: {stdout} {stderr}")
            if time.monotonic() >= deadline:
                process.kill()
                self.fail("broker socket was not created")
            time.sleep(0.005)
        return process, socket_path

    def supervisor(
        self,
        socket_path: Path,
        direction: str,
        handle: str,
        *,
        payload: bytes = b"",
        crash_after_receive: bool = False,
        crash_after_write: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        command = [
            PYTHON,
            os.fspath(SUPERVISOR),
            "--socket",
            os.fspath(socket_path),
            "--direction",
            direction,
            "--handle",
            handle,
            "--binding-json",
            self.binding_json(),
            "--payload-hex",
            payload.hex(),
        ]
        if crash_after_receive:
            command.append("--crash-after-receive")
        if crash_after_write:
            command.append("--crash-after-write")
        return subprocess.run(command, text=True, capture_output=True, timeout=20)

    @staticmethod
    def wait_process(process: subprocess.Popen[str], expected: int = 0) -> None:
        stdout, stderr = process.communicate(timeout=20)
        if process.returncode != expected:
            raise AssertionError(
                f"process returned {process.returncode}, expected {expected}: {stdout} {stderr}"
            )

    def test_public_reference_has_no_path_or_redeemable_authority(self) -> None:
        source, reference = self.snapshot()
        self.assertEqual(
            set(reference),
            {"opaqueContentId", "sha256", "byteLength", "logicalInputSlot"},
        )
        encoded = json.dumps(reference, sort_keys=True)
        self.assertNotIn(os.fspath(source), encoded)
        self.assertNotIn(os.fspath(self.store), encoded)
        self.assertNotIn("handle", encoded.lower())
        self.assertNotIn("descriptor", encoded.lower())

    def test_binding_role_expiry_and_revocation_fail_closed(self) -> None:
        _, reference = self.snapshot()
        handle = self.issue_input(reference)
        wrong_bindings = (
            replace(self.binding, installation_id="install-other"),
            replace(self.binding, epoch_digest="epoch-other"),
            replace(self.binding, registration_id="registration-other"),
            replace(self.binding, attempt_id="attempt-other"),
        )
        for wrong in wrong_bindings:
            with self.assertRaises(LedgerError) as mismatch:
                self.ledger.redeem_input(
                    handle, wrong, random_id(), peer_role="supervisor"
                )
            self.assertEqual(mismatch.exception.code, "binding-mismatch")
        with self.assertRaises(LedgerError) as direction:
            self.ledger.begin_output(
                handle, self.binding, random_id(), peer_role="supervisor"
            )
        self.assertEqual(direction.exception.code, "binding-mismatch")
        with self.assertRaises(LedgerError) as unauthorized:
            self.ledger.redeem_input(
                handle, self.binding, random_id(), peer_role="daemon"
            )
        self.assertEqual(unauthorized.exception.code, "unauthorized-peer")
        self.assertEqual(self.ledger.handle(handle)["state"], "issued")

        broker, socket_path = self.start_broker("input", peer_role="daemon")
        daemon_client = self.supervisor(socket_path, "input", handle)
        self.assertEqual(daemon_client.returncode, 2)
        self.assertEqual(json.loads(daemon_client.stdout)["error"], "unauthorized-peer")
        self.wait_process(broker, expected=2)
        self.assertEqual(self.ledger.handle(handle)["state"], "issued")

        revoked = self.issue_input(reference)
        self.assertEqual(self.ledger.revoke(revoked), "revoked")
        with self.assertRaises(LedgerError) as replay:
            self.ledger.redeem_input(
                revoked, self.binding, random_id(), peer_role="supervisor"
            )
        self.assertEqual(replay.exception.code, "revoked")

        current = now_ms()
        expired = self.ledger.issue_input_handle(
            str(reference["opaqueContentId"]),
            self.binding,
            current + 10,
            current + 100,
            at_ms=current,
        )
        with self.assertRaises(LedgerError) as stale:
            self.ledger.redeem_input(
                expired,
                self.binding,
                random_id(),
                peer_role="supervisor",
                at_ms=current + 11,
            )
        self.assertEqual(stale.exception.code, "expired")
        self.assertEqual(self.ledger.handle(expired)["state"], "expired")

    def _race(self, action: str, handle: str, contenders: int = 20) -> list[dict[str, object]]:
        barrier = self.root / f"barrier-{random_id()}"
        processes: list[subprocess.Popen[str]] = []
        for _ in range(contenders):
            command = [
                PYTHON,
                os.fspath(WORKER),
                "--db",
                os.fspath(self.db),
                "--store",
                os.fspath(self.store),
                "--action",
                action,
                "--binding-json",
                self.binding_json(),
                "--handle",
                handle,
                "--redemption",
                random_id(),
                "--barrier",
                os.fspath(barrier),
            ]
            processes.append(
                subprocess.Popen(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            )
        barrier.touch()
        results: list[dict[str, object]] = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=30)
            self.assertFalse(stderr, stderr)
            results.append(json.loads(stdout))
        return results

    def test_multi_process_input_and_output_redemption_races_have_one_winner(self) -> None:
        _, reference = self.snapshot()
        input_handle = self.issue_input(reference)
        input_results = self._race("redeem-input", input_handle)
        self.assertEqual(sum(result["ok"] is True for result in input_results), 1)
        self.assertEqual(
            sum(result.get("error") == "already-consumed" for result in input_results),
            len(input_results) - 1,
        )

        output_handle = self.issue_output()
        output_results = self._race("begin-output", output_handle)
        self.assertEqual(sum(result["ok"] is True for result in output_results), 1)
        self.assertEqual(
            sum(result.get("error") == "already-consumed" for result in output_results),
            len(output_results) - 1,
        )

    def test_sqlite_crash_before_and_after_commit_has_fail_closed_recovery(self) -> None:
        _, reference = self.snapshot()
        before = self.issue_input(reference)
        process = self.worker(
            "redeem-input",
            handle=before,
            redemption=random_id(),
            extra=["--crash-phase", "after-update-before-commit"],
        )
        self.assertEqual(process.returncode, 91)
        self.assertEqual(self.ledger.handle(before)["state"], "issued")
        winner = self.worker("redeem-input", handle=before, redemption=random_id())
        self.assertEqual(winner.returncode, 0, winner.stdout + winner.stderr)

        after = self.issue_input(reference)
        process = self.worker(
            "redeem-input",
            handle=after,
            redemption=random_id(),
            extra=["--crash-phase", "after-commit"],
        )
        self.assertEqual(process.returncode, 92)
        self.assertEqual(self.ledger.handle(after)["state"], "consumed")
        retry = self.worker("redeem-input", handle=after, redemption=random_id())
        self.assertEqual(json.loads(retry.stdout)["error"], "already-consumed")
        self.assertEqual(self.ledger.integrity_check(), "ok")

    def test_real_read_only_descriptor_crosses_broker_supervisor_processes(self) -> None:
        payload = b"descriptor content stays pathless"
        _, reference = self.snapshot(payload)
        handle = self.issue_input(reference)
        broker, socket_path = self.start_broker("input")
        client = self.supervisor(socket_path, "input", handle)
        self.assertEqual(client.returncode, 0, client.stdout + client.stderr)
        result = json.loads(client.stdout)
        self.assertEqual(result["access"], "read-only")
        self.assertEqual(result["sha256"], hashlib.sha256(payload).hexdigest())
        self.assertEqual(result["byteLength"], len(payload))
        self.assertNotIn(os.fspath(self.store), client.stdout)
        self.wait_process(broker)
        self.assertEqual(self.ledger.handle(handle)["state"], "consumed")

    def test_broker_and_supervisor_input_crashes_never_resurrect_consumed_handle(self) -> None:
        _, reference = self.snapshot()
        broker_crash = self.issue_input(reference)
        broker, socket_path = self.start_broker(
            "input", crash="after-commit-before-send"
        )
        client = self.supervisor(socket_path, "input", broker_crash)
        self.assertNotEqual(client.returncode, 0)
        self.wait_process(broker, expected=92)
        self.assertEqual(self.ledger.handle(broker_crash)["state"], "consumed")
        retry = self.worker("redeem-input", handle=broker_crash, redemption=random_id())
        self.assertEqual(json.loads(retry.stdout)["error"], "already-consumed")

        supervisor_crash = self.issue_input(reference)
        broker, socket_path = self.start_broker("input")
        client = self.supervisor(
            socket_path, "input", supervisor_crash, crash_after_receive=True
        )
        self.assertEqual(client.returncode, 93)
        self.wait_process(broker)
        self.assertEqual(self.ledger.handle(supervisor_crash)["state"], "consumed")

    def test_input_store_corruption_is_detected_and_content_is_quarantined(self) -> None:
        _, reference = self.snapshot(b"approved immutable input")
        handle = self.issue_input(reference)
        redemption = random_id()
        self.ledger.redeem_input(
            handle, self.binding, redemption, peer_role="supervisor"
        )
        content = self.ledger.content(str(reference["opaqueContentId"]))
        stored = self.store / content["store_name"]
        stored.chmod(0o600)
        stored.write_bytes(b"substituted")
        with self.assertRaises(LedgerError) as mismatch:
            self.ledger.open_consumed_input(handle, self.binding, redemption)
        self.assertEqual(mismatch.exception.code, "stored-content-mismatch")
        self.assertEqual(
            self.ledger.content(str(reference["opaqueContentId"]))["custody_state"],
            "quarantined",
        )
        self.assertEqual(self.ledger.handle(handle)["state"], "consumed")

    def test_broker_crash_before_commit_rolls_back_without_descriptor_transfer(self) -> None:
        _, reference = self.snapshot()
        handle = self.issue_input(reference)
        broker, socket_path = self.start_broker(
            "input", crash="after-update-before-commit"
        )
        client = self.supervisor(socket_path, "input", handle)
        self.assertNotEqual(client.returncode, 0)
        self.wait_process(broker, expected=91)
        self.assertEqual(self.ledger.handle(handle)["state"], "issued")

    def _transfer_output(self, handle: str, payload: bytes, **kwargs):
        broker, socket_path = self.start_broker("output")
        client = self.supervisor(socket_path, "output", handle, payload=payload, **kwargs)
        self.wait_process(broker)
        return client

    def test_bounded_output_pipe_commit_duplicate_and_release_gates(self) -> None:
        payload = b'{"safe":true}'
        handle = self.issue_output(max_bytes=len(payload))
        with self.assertRaises(LedgerError) as early:
            self.ledger.release_output(handle, "1" * 64, peer_role="trusted-ui")
        self.assertEqual(early.exception.code, "release-not-ready")
        client = self._transfer_output(handle, payload)
        self.assertEqual(client.returncode, 0, client.stdout + client.stderr)
        client_result = json.loads(client.stdout)
        self.assertEqual(client_result["access"], "write-only")
        redemption = client_result["redemptionId"]
        row = self.ledger.handle(handle)
        self.assertEqual(row["state"], "consumed")
        self.assertEqual(row["transfer_complete"], 1)
        digest = hashlib.sha256(payload).hexdigest()
        transcript = "2" * 64
        commit_args = [
            "--sha256",
            digest,
            "--size",
            str(len(payload)),
            "--terminal-state",
            "success",
            "--transcript",
            transcript,
        ]
        committed = self.worker(
            "commit-output",
            handle=handle,
            redemption=redemption,
            extra=commit_args,
        )
        self.assertEqual(json.loads(committed.stdout)["result"]["state"], "committed")
        duplicate = self.worker(
            "commit-output",
            handle=handle,
            redemption=redemption,
            extra=commit_args,
        )
        self.assertEqual(json.loads(duplicate.stdout)["result"]["state"], "idempotent")
        mismatch = self.worker(
            "commit-output",
            handle=handle,
            redemption=redemption,
            extra=[
                "--sha256",
                "3" * 64,
                "--size",
                str(len(payload)),
                "--terminal-state",
                "success",
                "--transcript",
                transcript,
            ],
        )
        self.assertEqual(json.loads(mismatch.stdout)["error"], "commit-mismatch")
        with self.assertRaises(LedgerError) as daemon:
            self.ledger.release_output(handle, transcript, peer_role="daemon")
        self.assertEqual(daemon.exception.code, "unauthorized-peer")
        self.assertEqual(
            self.ledger.release_output(handle, transcript, peer_role="trusted-ui"),
            "released",
        )
        self.assertEqual(
            self.ledger.release_output(handle, transcript, peer_role="trusted-ui"),
            "idempotent",
        )

    def test_output_limit_and_terminal_failure_quarantine_without_release(self) -> None:
        oversized = self.issue_output(max_bytes=4)
        client = self._transfer_output(oversized, b"12345")
        self.assertIn(client.returncode, {0, 2})
        row = self.ledger.handle(oversized)
        self.assertEqual(row["state"], "quarantined")
        self.assertEqual(row["quarantine_reason"], "output-limit-exceeded")
        self.assertEqual(list(self.store.iterdir()), [])
        with self.assertRaises(LedgerError) as release:
            self.ledger.release_output(oversized, "4" * 64, peer_role="trusted-ui")
        self.assertEqual(release.exception.code, "release-not-ready")

        terminal_failure = self.issue_output(max_bytes=32)
        payload = b"collected but unsafe"
        client = self._transfer_output(terminal_failure, payload)
        redemption = json.loads(client.stdout)["redemptionId"]
        result = self.ledger.commit_output(
            terminal_failure,
            self.binding,
            redemption,
            hashlib.sha256(payload).hexdigest(),
            len(payload),
            "indeterminate",
            "5" * 64,
            peer_role="supervisor",
        )
        self.assertEqual(result, "quarantined")
        with self.assertRaises(LedgerError) as release:
            self.ledger.release_output(
                terminal_failure, "5" * 64, peer_role="trusted-ui"
            )
        self.assertEqual(release.exception.code, "release-not-ready")

    def test_output_crashes_and_restart_reconciliation_quarantine(self) -> None:
        broker_crash = self.issue_output(max_bytes=32)
        broker, socket_path = self.start_broker(
            "output", crash="after-commit-before-send"
        )
        client = self.supervisor(socket_path, "output", broker_crash, payload=b"never sent")
        self.assertNotEqual(client.returncode, 0)
        self.wait_process(broker, expected=92)
        self.assertEqual(self.ledger.handle(broker_crash)["state"], "consumed")
        result = self.ledger.reconcile_broker_restart()
        self.assertEqual(result["quarantinedOutputs"], 1)
        self.assertEqual(self.ledger.handle(broker_crash)["state"], "quarantined")

        supervisor_crash = self.issue_output(max_bytes=32)
        client = self._transfer_output(
            supervisor_crash, b"partial", crash_after_write=True
        )
        self.assertEqual(client.returncode, 94)
        self.assertEqual(self.ledger.handle(supervisor_crash)["state"], "consumed")
        result = self.ledger.reconcile_broker_restart()
        self.assertEqual(result["quarantinedOutputs"], 1)
        self.assertEqual(self.ledger.handle(supervisor_crash)["state"], "quarantined")

        _, reference = self.snapshot()
        consumed_input = self.issue_input(reference)
        self.ledger.redeem_input(
            consumed_input, self.binding, random_id(), peer_role="supervisor"
        )
        self.ledger.reconcile_broker_restart()
        self.assertEqual(self.ledger.handle(consumed_input)["state"], "consumed")

    def test_output_persistence_crash_points_reconcile_without_release(self) -> None:
        cases = (
            ("after-output-fsync-before-record", 95, 0),
            ("after-output-record", 96, 1),
        )
        for crash_phase, exit_code, transfer_complete in cases:
            with self.subTest(crash_phase=crash_phase):
                handle = self.issue_output(max_bytes=64)
                broker, socket_path = self.start_broker("output", crash=crash_phase)
                client = self.supervisor(
                    socket_path, "output", handle, payload=b"persist then crash"
                )
                self.assertEqual(client.returncode, 0, client.stdout + client.stderr)
                self.wait_process(broker, expected=exit_code)
                row = self.ledger.handle(handle)
                self.assertEqual(row["state"], "consumed")
                self.assertEqual(row["transfer_complete"], transfer_complete)
                self.assertTrue((self.store / row["transfer_store_name"]).exists())
                self.ledger.reconcile_broker_restart()
                self.assertEqual(self.ledger.handle(handle)["state"], "quarantined")
                with self.assertRaises(LedgerError) as release:
                    self.ledger.release_output(
                        handle, "8" * 64, peer_role="trusted-ui"
                    )
                self.assertEqual(release.exception.code, "release-not-ready")

    def test_output_store_substitution_is_quarantined_at_commit(self) -> None:
        payload = b"collected exact output"
        handle = self.issue_output(max_bytes=64)
        client = self._transfer_output(handle, payload)
        result = json.loads(client.stdout)
        row = self.ledger.handle(handle)
        content = self.ledger.content(row["content_id"])
        stored = self.store / content["store_name"]
        stored.chmod(0o600)
        stored.write_bytes(b"changed after collection")
        state = self.ledger.commit_output(
            handle,
            self.binding,
            result["redemptionId"],
            hashlib.sha256(payload).hexdigest(),
            len(payload),
            "success",
            "9" * 64,
            peer_role="supervisor",
        )
        self.assertEqual(state, "quarantined")
        self.assertEqual(self.ledger.handle(handle)["quarantine_reason"], "output-store-mismatch")
        self.assertEqual(
            self.ledger.content(row["content_id"])["custody_state"], "quarantined"
        )

    def test_gc_preserves_live_unresolved_and_tombstoned_authority(self) -> None:
        current = now_ms()
        _, reference = self.snapshot(b"retain me", retain=current + 10)
        handle = self.ledger.issue_input_handle(
            str(reference["opaqueContentId"]),
            self.binding,
            current + 20,
            current + 40,
            at_ms=current,
        )
        self.ledger.garbage_collect(at_ms=current + 21, orphan_grace_ms=0)
        self.assertEqual(self.ledger.handle(handle)["state"], "expired")
        self.assertNotEqual(
            self.ledger.content(str(reference["opaqueContentId"]))["custody_state"],
            "deleted",
        )
        result = self.ledger.garbage_collect(at_ms=current + 100, orphan_grace_ms=0)
        self.assertEqual(result["removedTombstones"], 0)
        self.assertEqual(self.ledger.handle(handle)["state"], "expired")

        self.ledger.mark_attempt(self.binding, "indeterminate", at_ms=current + 101)
        self.ledger.garbage_collect(at_ms=current + 102, orphan_grace_ms=0)
        self.assertEqual(self.ledger.handle(handle)["state"], "expired")
        transcript = "6" * 64
        self.ledger.mark_attempt(
            self.binding, "failed", transcript, at_ms=current + 103
        )
        result = self.ledger.garbage_collect(at_ms=current + 104, orphan_grace_ms=0)
        self.assertEqual(result["removedTombstones"], 1)
        with self.assertRaises(LedgerError) as gone:
            self.ledger.handle(handle)
        self.assertEqual(gone.exception.code, "unknown-handle")
        self.assertEqual(
            self.ledger.content(str(reference["opaqueContentId"]))["custody_state"],
            "deleted",
        )

    def test_gc_keeps_output_partial_until_attempt_terminal_and_horizon(self) -> None:
        current = now_ms()
        handle = self.ledger.issue_output_handle(
            self.binding,
            64,
            current + 20,
            current + 40,
            at_ms=current,
        )
        redemption = random_id()
        self.ledger.begin_output(
            handle,
            self.binding,
            redemption,
            peer_role="supervisor",
            at_ms=current + 1,
        )
        row = self.ledger.handle(handle)
        partial = self.store / row["transfer_store_name"]
        partial.write_bytes(b"unfinished")
        self.ledger.reconcile_broker_restart(at_ms=current + 2)
        self.ledger.garbage_collect(at_ms=current + 100, orphan_grace_ms=0)
        self.assertTrue(partial.exists())
        self.assertEqual(self.ledger.handle(handle)["state"], "quarantined")
        self.ledger.mark_attempt(
            self.binding, "failed", "7" * 64, at_ms=current + 101
        )
        result = self.ledger.garbage_collect(at_ms=current + 102, orphan_grace_ms=0)
        self.assertEqual(result["removedTombstones"], 1)
        self.assertFalse(partial.exists())

    def test_gc_removes_only_old_unreferenced_store_files(self) -> None:
        old = self.store / random_id()
        recent = self.store / random_id()
        ignored = self.store / "human-note"
        old.write_bytes(b"orphan")
        recent.write_bytes(b"recent")
        ignored.write_bytes(b"not a managed name")
        current = now_ms()
        old_time = (current - 10_000) / 1000
        os.utime(old, (old_time, old_time))
        result = self.ledger.garbage_collect(at_ms=current, orphan_grace_ms=5_000)
        self.assertEqual(result["removedOrphans"], 1)
        self.assertFalse(old.exists())
        self.assertTrue(recent.exists())
        self.assertTrue(ignored.exists())

    def test_schema_rejects_state_resurrection_and_database_remains_valid(self) -> None:
        _, reference = self.snapshot()
        handle = self.issue_input(reference)
        self.ledger.revoke(handle)
        connection = sqlite3.connect(self.db, isolation_level=None)
        try:
            connection.execute("PRAGMA foreign_keys=ON")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "UPDATE content_handle SET state = 'issued' WHERE handle_id = ?",
                    (handle,),
                )
            self.assertEqual(connection.execute("PRAGMA journal_mode").fetchone()[0], "delete")
            self.assertEqual(connection.execute("PRAGMA application_id").fetchone()[0], 1128483908)
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        finally:
            connection.close()
        configured = self.ledger.connect()
        try:
            self.assertEqual(configured.execute("PRAGMA synchronous").fetchone()[0], 2)
            self.assertEqual(configured.execute("PRAGMA fullfsync").fetchone()[0], 1)
        finally:
            configured.close()
        self.assertEqual(stat.S_IMODE(self.db.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.store.stat().st_mode), 0o700)


if __name__ == "__main__":
    unittest.main(verbosity=2)
