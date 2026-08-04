"""Development-only SQLite content-custody ledger for the Gate D spike.

This package is intentionally isolated under experiments/.  It is evidence about
state-machine feasibility, not a Capsule product component or wire contract.
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
import stat
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable


SCHEMA_PATH = Path(__file__).with_name("schema.sql")
HEX_64 = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
TERMINAL_ATTEMPT_STATES = {"succeeded", "failed"}


class LedgerError(Exception):
    def __init__(self, code: str, detail: str | None = None):
        super().__init__(detail or code)
        self.code = code
        self.detail = detail or code


@dataclass(frozen=True)
class Binding:
    installation_id: str
    epoch_digest: str
    registration_id: str
    attempt_id: str

    def validate(self) -> None:
        for name, value in asdict(self).items():
            if not IDENTIFIER.fullmatch(value):
                raise LedgerError("invalid-binding", name)


def now_ms() -> int:
    return time.time_ns() // 1_000_000


def random_id() -> str:
    return secrets.token_hex(32)


def _validate_hex64(value: str, field: str) -> None:
    if not HEX_64.fullmatch(value):
        raise LedgerError("invalid-identifier", field)


class Ledger:
    def __init__(self, db_path: Path | str, store_dir: Path | str):
        self.db_path = Path(db_path)
        self.store_dir = Path(store_dir)

    def initialize(self) -> None:
        self.db_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.store_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.store_dir, 0o700)
        connection = sqlite3.connect(self.db_path, isolation_level=None)
        try:
            connection.execute("PRAGMA journal_mode=DELETE")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("PRAGMA fullfsync=ON")
            connection.execute("PRAGMA secure_delete=ON")
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA trusted_schema=OFF")
            connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        finally:
            connection.close()
        os.chmod(self.db_path, 0o600)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.db_path,
            timeout=15,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=15000")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA fullfsync=ON")
        connection.execute("PRAGMA secure_delete=ON")
        connection.execute("PRAGMA trusted_schema=OFF")
        return connection

    def _immediate(self, operation: Callable[[sqlite3.Connection], Any]) -> Any:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            result = operation(connection)
            connection.commit()
            return result
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            raise
        finally:
            connection.close()

    def create_attempt(self, binding: Binding, *, at_ms: int | None = None) -> None:
        binding.validate()
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> None:
            connection.execute(
                """
                INSERT INTO attempt(
                  attempt_id, installation_id, epoch_digest, registration_id,
                  state, terminal_transcript_digest, created_at_ms, updated_at_ms
                ) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)
                """,
                (
                    binding.attempt_id,
                    binding.installation_id,
                    binding.epoch_digest,
                    binding.registration_id,
                    current,
                    current,
                ),
            )

        self._immediate(operation)

    def mark_attempt(
        self,
        binding: Binding,
        state: str,
        transcript_digest: str | None = None,
        *,
        at_ms: int | None = None,
    ) -> None:
        binding.validate()
        if state not in {"active", "indeterminate", "succeeded", "failed"}:
            raise LedgerError("invalid-attempt-state")
        if state in TERMINAL_ATTEMPT_STATES:
            if transcript_digest is None:
                raise LedgerError("missing-terminal-transcript")
            _validate_hex64(transcript_digest, "terminal_transcript_digest")
        elif transcript_digest is not None:
            raise LedgerError("unexpected-terminal-transcript")
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> None:
            row = connection.execute(
                "SELECT * FROM attempt WHERE attempt_id = ?", (binding.attempt_id,)
            ).fetchone()
            self._require_attempt_binding(row, binding)
            old_state = row["state"]
            allowed = {
                "active": {"active", "indeterminate", "succeeded", "failed"},
                "indeterminate": {"indeterminate", "succeeded", "failed"},
                "succeeded": {"succeeded"},
                "failed": {"failed"},
            }
            if state not in allowed[old_state]:
                raise LedgerError("illegal-attempt-transition")
            if old_state in TERMINAL_ATTEMPT_STATES:
                if row["terminal_transcript_digest"] != transcript_digest:
                    raise LedgerError("terminal-attempt-mismatch")
                return
            connection.execute(
                """
                UPDATE attempt SET state = ?, terminal_transcript_digest = ?, updated_at_ms = ?
                 WHERE attempt_id = ?
                """,
                (state, transcript_digest, current, binding.attempt_id),
            )

        self._immediate(operation)

    @staticmethod
    def _require_attempt_binding(row: sqlite3.Row | None, binding: Binding) -> None:
        if row is None:
            raise LedgerError("unknown-attempt")
        for column, expected in asdict(binding).items():
            if row[column] != expected:
                raise LedgerError("binding-mismatch", column)

    def snapshot_regular_file(
        self,
        source: Path | str,
        logical_slot: str,
        max_bytes: int,
        retain_until_ms: int,
        *,
        at_ms: int | None = None,
    ) -> dict[str, Any]:
        if not IDENTIFIER.fullmatch(logical_slot):
            raise LedgerError("invalid-logical-slot")
        if max_bytes <= 0:
            raise LedgerError("invalid-byte-limit")
        current = now_ms() if at_ms is None else at_ms
        flags = os.O_RDONLY | os.O_CLOEXEC
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        source_fd = os.open(os.fspath(source), flags)
        store_fd = os.open(self.store_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        partial_name = f".partial-{random_id()}"
        store_name = random_id()
        destination_fd = -1
        renamed = False
        try:
            before = os.fstat(source_fd)
            if not stat.S_ISREG(before.st_mode):
                raise LedgerError("input-not-regular")
            if before.st_size > max_bytes:
                raise LedgerError("input-too-large")
            destination_fd = os.open(
                partial_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
                0o600,
                dir_fd=store_fd,
            )
            digest = hashlib.sha256()
            copied = 0
            while True:
                chunk = os.read(source_fd, min(65_536, max_bytes + 1 - copied))
                if not chunk:
                    break
                copied += len(chunk)
                if copied > max_bytes:
                    raise LedgerError("input-too-large")
                digest.update(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(destination_fd, view)
                    view = view[written:]
            os.fsync(destination_fd)
            os.fchmod(destination_fd, 0o400)
            after = os.fstat(source_fd)
            stable = (
                before.st_dev,
                before.st_ino,
                before.st_size,
                before.st_mtime_ns,
            ) == (
                after.st_dev,
                after.st_ino,
                after.st_size,
                after.st_mtime_ns,
            )
            if not stable or copied != before.st_size:
                raise LedgerError("input-mutated")
            os.close(destination_fd)
            destination_fd = -1
            os.rename(partial_name, store_name, src_dir_fd=store_fd, dst_dir_fd=store_fd)
            renamed = True
            os.fsync(store_fd)
            content_id = random_id()
            sha256_hex = digest.hexdigest()

            def operation(connection: sqlite3.Connection) -> None:
                connection.execute(
                    """
                    INSERT INTO content_object(
                      content_id, sha256_hex, byte_length, store_name, custody_state,
                      retain_until_ms, created_at_ms, updated_at_ms
                    ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
                    """,
                    (
                        content_id,
                        sha256_hex,
                        copied,
                        store_name,
                        retain_until_ms,
                        current,
                        current,
                    ),
                )

            try:
                self._immediate(operation)
            except BaseException:
                os.unlink(store_name, dir_fd=store_fd)
                os.fsync(store_fd)
                renamed = False
                raise
            return {
                "opaqueContentId": content_id,
                "sha256": sha256_hex,
                "byteLength": copied,
                "logicalInputSlot": logical_slot,
            }
        finally:
            if destination_fd >= 0:
                os.close(destination_fd)
            if not renamed:
                try:
                    os.unlink(partial_name, dir_fd=store_fd)
                except FileNotFoundError:
                    pass
            os.close(source_fd)
            os.close(store_fd)

    def issue_input_handle(
        self,
        content_id: str,
        binding: Binding,
        expires_at_ms: int,
        tombstone_until_ms: int,
        *,
        at_ms: int | None = None,
    ) -> str:
        _validate_hex64(content_id, "content_id")
        return self._issue_handle(
            binding,
            "input",
            content_id,
            None,
            expires_at_ms,
            tombstone_until_ms,
            at_ms=at_ms,
        )

    def issue_output_handle(
        self,
        binding: Binding,
        max_bytes: int,
        expires_at_ms: int,
        tombstone_until_ms: int,
        *,
        at_ms: int | None = None,
    ) -> str:
        if max_bytes <= 0:
            raise LedgerError("invalid-byte-limit")
        return self._issue_handle(
            binding,
            "output",
            None,
            max_bytes,
            expires_at_ms,
            tombstone_until_ms,
            at_ms=at_ms,
        )

    def _issue_handle(
        self,
        binding: Binding,
        direction: str,
        content_id: str | None,
        max_bytes: int | None,
        expires_at_ms: int,
        tombstone_until_ms: int,
        *,
        at_ms: int | None,
    ) -> str:
        binding.validate()
        current = now_ms() if at_ms is None else at_ms
        if expires_at_ms <= current or tombstone_until_ms < expires_at_ms:
            raise LedgerError("invalid-expiry")
        handle_id = random_id()

        def operation(connection: sqlite3.Connection) -> None:
            attempt = connection.execute(
                "SELECT * FROM attempt WHERE attempt_id = ?", (binding.attempt_id,)
            ).fetchone()
            self._require_attempt_binding(attempt, binding)
            if attempt["state"] != "active":
                raise LedgerError("attempt-not-active")
            if direction == "input":
                content = connection.execute(
                    "SELECT * FROM content_object WHERE content_id = ?", (content_id,)
                ).fetchone()
                if content is None or content["custody_state"] != "available":
                    raise LedgerError("content-not-available")
                actual_max = content["byte_length"] or 1
                expected_digest = content["sha256_hex"]
                expected_size = content["byte_length"]
                operation_name = "stage-input"
            else:
                actual_max = max_bytes
                expected_digest = None
                expected_size = None
                operation_name = "collect-output"
            connection.execute(
                """
                INSERT INTO content_handle(
                  handle_id, content_id, installation_id, epoch_digest, registration_id,
                  attempt_id, direction, operation, max_bytes, expected_sha256_hex,
                  expected_size, state, expires_at_ms, tombstone_until_ms, updated_at_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, ?)
                """,
                (
                    handle_id,
                    content_id,
                    binding.installation_id,
                    binding.epoch_digest,
                    binding.registration_id,
                    binding.attempt_id,
                    direction,
                    operation_name,
                    actual_max,
                    expected_digest,
                    expected_size,
                    expires_at_ms,
                    tombstone_until_ms,
                    current,
                ),
            )
            if direction == "input":
                connection.execute(
                    "INSERT OR IGNORE INTO attempt_content VALUES (?, ?, 'input')",
                    (binding.attempt_id, content_id),
                )

        self._immediate(operation)
        return handle_id

    def revoke(self, handle_id: str, *, at_ms: int | None = None) -> str:
        _validate_hex64(handle_id, "handle_id")
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> str:
            row = connection.execute(
                "SELECT state FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            if row is None:
                raise LedgerError("unknown-handle")
            if row["state"] == "revoked":
                return "revoked"
            if row["state"] != "issued":
                raise LedgerError("not-revocable")
            connection.execute(
                "UPDATE content_handle SET state = 'revoked', updated_at_ms = ? WHERE handle_id = ?",
                (current, handle_id),
            )
            return "revoked"

        return self._immediate(operation)

    def redeem_input(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        *,
        peer_role: str,
        at_ms: int | None = None,
        crash_phase: str | None = None,
    ) -> dict[str, Any]:
        return self._redeem(
            handle_id,
            binding,
            redemption_id,
            "input",
            peer_role=peer_role,
            at_ms=at_ms,
            crash_phase=crash_phase,
        )

    def begin_output(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        *,
        peer_role: str,
        at_ms: int | None = None,
        crash_phase: str | None = None,
    ) -> dict[str, Any]:
        return self._redeem(
            handle_id,
            binding,
            redemption_id,
            "output",
            peer_role=peer_role,
            at_ms=at_ms,
            crash_phase=crash_phase,
        )

    def _redeem(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        direction: str,
        *,
        peer_role: str,
        at_ms: int | None,
        crash_phase: str | None,
    ) -> dict[str, Any]:
        if peer_role != "supervisor":
            raise LedgerError("unauthorized-peer")
        _validate_hex64(handle_id, "handle_id")
        _validate_hex64(redemption_id, "redemption_id")
        binding.validate()
        current = now_ms() if at_ms is None else at_ms
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            self._require_handle(row, binding, direction)
            if row["state"] != "issued":
                raise LedgerError(self._state_error(row["state"]))
            if row["expires_at_ms"] <= current:
                connection.execute(
                    "UPDATE content_handle SET state = 'expired', updated_at_ms = ? WHERE handle_id = ?",
                    (current, handle_id),
                )
                connection.commit()
                raise LedgerError("expired")
            transfer_store_name = random_id() if direction == "output" else None
            cursor = connection.execute(
                """
                UPDATE content_handle
                   SET state = 'consumed', redemption_id = ?, transfer_store_name = ?,
                       updated_at_ms = ?
                 WHERE handle_id = ? AND state = 'issued'
                """,
                (redemption_id, transfer_store_name, current, handle_id),
            )
            if cursor.rowcount != 1:
                raise LedgerError("already-consumed")
            if crash_phase == "after-update-before-commit":
                os._exit(91)
            connection.commit()
            if crash_phase == "after-commit":
                os._exit(92)
            return {
                "state": "consumed",
                "redemptionId": redemption_id,
                "expectedSha256": row["expected_sha256_hex"],
                "expectedSize": row["expected_size"],
                "maxBytes": row["max_bytes"],
            }
        except BaseException:
            if connection.in_transaction:
                connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _state_error(state: str) -> str:
        return {
            "consumed": "already-consumed",
            "committed": "already-committed",
            "quarantined": "quarantined",
            "revoked": "revoked",
            "expired": "expired",
        }.get(state, "invalid-state")

    @staticmethod
    def _require_handle(
        row: sqlite3.Row | None, binding: Binding, direction: str
    ) -> None:
        if row is None:
            raise LedgerError("unknown-handle")
        for column, expected in asdict(binding).items():
            if row[column] != expected:
                raise LedgerError("binding-mismatch", column)
        expected_operation = "stage-input" if direction == "input" else "collect-output"
        if row["direction"] != direction or row["operation"] != expected_operation:
            raise LedgerError("binding-mismatch", "direction-operation")

    def open_consumed_input(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
    ) -> int:
        connection = self.connect()
        try:
            row = connection.execute(
                """
                SELECT h.*, o.store_name, o.custody_state
                  FROM content_handle h
                  JOIN content_object o ON o.content_id = h.content_id
                 WHERE h.handle_id = ?
                """,
                (handle_id,),
            ).fetchone()
        finally:
            connection.close()
        self._require_handle(row, binding, "input")
        if row["state"] != "consumed" or row["redemption_id"] != redemption_id:
            raise LedgerError("redemption-mismatch")
        if row["custody_state"] != "available":
            raise LedgerError("content-not-available")
        try:
            descriptor = self._open_store_file(row["store_name"])
        except OSError as error:
            self._quarantine_content(row["content_id"])
            raise LedgerError("stored-content-unavailable") from error
        try:
            digest, size = self._digest_fd(descriptor, row["max_bytes"])
            if digest != row["expected_sha256_hex"] or size != row["expected_size"]:
                raise LedgerError("stored-content-mismatch")
            os.lseek(descriptor, 0, os.SEEK_SET)
            return descriptor
        except BaseException:
            os.close(descriptor)
            self._quarantine_content(row["content_id"])
            raise

    def _quarantine_content(self, content_id: str, *, at_ms: int | None = None) -> None:
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> None:
            connection.execute(
                """
                UPDATE content_object
                   SET custody_state = 'quarantined', updated_at_ms = ?
                 WHERE content_id = ? AND custody_state <> 'deleted'
                """,
                (current, content_id),
            )

        self._immediate(operation)

    @staticmethod
    def _digest_fd(descriptor: int, max_bytes: int) -> tuple[str, int]:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise LedgerError("stored-content-not-regular")
        digest = hashlib.sha256()
        size = 0
        os.lseek(descriptor, 0, os.SEEK_SET)
        while True:
            chunk = os.read(descriptor, min(65_536, max_bytes + 1 - size))
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise LedgerError("content-too-large")
            digest.update(chunk)
        return digest.hexdigest(), size

    def _open_store_file(self, name: str) -> int:
        _validate_hex64(name, "store_name")
        directory = os.open(
            self.store_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
        )
        try:
            return os.open(
                name,
                os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0),
                dir_fd=directory,
            )
        finally:
            os.close(directory)

    def output_transfer_name(
        self, handle_id: str, binding: Binding, redemption_id: str
    ) -> tuple[str, int]:
        connection = self.connect()
        try:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
        finally:
            connection.close()
        self._require_handle(row, binding, "output")
        if row["state"] != "consumed" or row["redemption_id"] != redemption_id:
            raise LedgerError("redemption-mismatch")
        return row["transfer_store_name"], row["max_bytes"]

    def collect_output_fd(
        self,
        descriptor: int,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        *,
        crash_phase: str | None = None,
    ) -> dict[str, Any]:
        store_name, max_bytes = self.output_transfer_name(
            handle_id, binding, redemption_id
        )
        store_fd = os.open(self.store_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        output_fd = -1
        complete = False
        try:
            output_fd = os.open(
                store_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC,
                0o600,
                dir_fd=store_fd,
            )
            digest = hashlib.sha256()
            size = 0
            while True:
                chunk = os.read(descriptor, min(65_536, max_bytes + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    self.quarantine_output(
                        handle_id,
                        binding,
                        redemption_id,
                        "output-limit-exceeded",
                    )
                    raise LedgerError("output-limit-exceeded")
                digest.update(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(output_fd, view)
                    view = view[written:]
            os.fsync(output_fd)
            os.fchmod(output_fd, 0o400)
            os.close(output_fd)
            output_fd = -1
            os.fsync(store_fd)
            if crash_phase == "after-output-fsync-before-record":
                os._exit(95)
            result = self._record_output_transfer(
                handle_id,
                binding,
                redemption_id,
                store_name,
                digest.hexdigest(),
                size,
            )
            complete = True
            if crash_phase == "after-output-record":
                os._exit(96)
            return result
        finally:
            if output_fd >= 0:
                os.close(output_fd)
            if not complete:
                try:
                    os.unlink(store_name, dir_fd=store_fd)
                    os.fsync(store_fd)
                except FileNotFoundError:
                    pass
            os.close(store_fd)

    def _record_output_transfer(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        store_name: str,
        sha256_hex: str,
        size: int,
        *,
        at_ms: int | None = None,
    ) -> dict[str, Any]:
        current = now_ms() if at_ms is None else at_ms
        content_id = random_id()

        def operation(connection: sqlite3.Connection) -> dict[str, Any]:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            self._require_handle(row, binding, "output")
            if row["state"] != "consumed" or row["redemption_id"] != redemption_id:
                raise LedgerError("redemption-mismatch")
            if row["transfer_complete"]:
                if (
                    row["transfer_sha256_hex"] == sha256_hex
                    and row["transfer_size"] == size
                    and row["transfer_store_name"] == store_name
                ):
                    return {"sha256": sha256_hex, "byteLength": size}
                raise LedgerError("transfer-mismatch")
            connection.execute(
                """
                INSERT INTO content_object(
                  content_id, sha256_hex, byte_length, store_name, custody_state,
                  retain_until_ms, created_at_ms, updated_at_ms
                ) VALUES (?, ?, ?, ?, 'available', ?, ?, ?)
                """,
                (
                    content_id,
                    sha256_hex,
                    size,
                    store_name,
                    row["tombstone_until_ms"],
                    current,
                    current,
                ),
            )
            connection.execute(
                """
                UPDATE content_handle
                   SET content_id = ?, transfer_complete = 1, transfer_sha256_hex = ?,
                       transfer_size = ?, updated_at_ms = ?
                 WHERE handle_id = ?
                """,
                (content_id, sha256_hex, size, current, handle_id),
            )
            connection.execute(
                "INSERT INTO attempt_content VALUES (?, ?, 'output')",
                (binding.attempt_id, content_id),
            )
            return {"sha256": sha256_hex, "byteLength": size}

        return self._immediate(operation)

    def quarantine_output(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        reason: str,
        *,
        at_ms: int | None = None,
    ) -> str:
        if not IDENTIFIER.fullmatch(reason):
            raise LedgerError("invalid-quarantine-reason")
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> str:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            self._require_handle(row, binding, "output")
            if row["redemption_id"] != redemption_id:
                raise LedgerError("redemption-mismatch")
            if row["state"] == "quarantined":
                return "quarantined"
            if row["state"] != "consumed":
                raise LedgerError("not-quarantinable")
            connection.execute(
                """
                UPDATE content_handle
                   SET state = 'quarantined', quarantine_reason = ?, updated_at_ms = ?
                 WHERE handle_id = ?
                """,
                (reason, current, handle_id),
            )
            if row["content_id"] is not None:
                connection.execute(
                    """
                    UPDATE content_object
                       SET custody_state = 'quarantined', updated_at_ms = ?
                     WHERE content_id = ? AND custody_state = 'available'
                    """,
                    (current, row["content_id"]),
                )
            return "quarantined"

        return self._immediate(operation)

    def commit_output(
        self,
        handle_id: str,
        binding: Binding,
        redemption_id: str,
        sha256_hex: str,
        size: int,
        terminal_state: str,
        terminal_transcript_digest: str,
        *,
        peer_role: str,
        at_ms: int | None = None,
    ) -> str:
        if peer_role != "supervisor":
            raise LedgerError("unauthorized-peer")
        _validate_hex64(sha256_hex, "sha256")
        _validate_hex64(terminal_transcript_digest, "terminal_transcript_digest")
        if size < 0 or terminal_state not in {"success", "failed", "indeterminate"}:
            raise LedgerError("invalid-commit")
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> str:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            self._require_handle(row, binding, "output")
            if row["redemption_id"] != redemption_id:
                raise LedgerError("redemption-mismatch")
            if row["state"] == "committed":
                exact = (
                    row["committed_sha256_hex"] == sha256_hex
                    and row["committed_size"] == size
                    and row["terminal_transcript_digest"] == terminal_transcript_digest
                    and terminal_state == "success"
                )
                if exact:
                    return "idempotent"
                raise LedgerError("commit-mismatch")
            if row["state"] == "quarantined":
                raise LedgerError("quarantined")
            if row["state"] != "consumed":
                raise LedgerError("not-committable")
            reason = None
            if terminal_state != "success":
                reason = f"terminal-{terminal_state}"
            elif not row["transfer_complete"]:
                reason = "output-transfer-incomplete"
            elif row["transfer_sha256_hex"] != sha256_hex or row["transfer_size"] != size:
                reason = "output-commit-mismatch"
            else:
                content = connection.execute(
                    "SELECT * FROM content_object WHERE content_id = ?", (row["content_id"],)
                ).fetchone()
                if content is None or content["custody_state"] != "available":
                    reason = "output-object-unavailable"
                else:
                    descriptor = self._open_store_file(content["store_name"])
                    try:
                        observed_digest, observed_size = self._digest_fd(
                            descriptor, row["max_bytes"]
                        )
                    finally:
                        os.close(descriptor)
                    if observed_digest != sha256_hex or observed_size != size:
                        reason = "output-store-mismatch"
            if reason is not None:
                connection.execute(
                    """
                    UPDATE content_handle
                       SET state = 'quarantined', quarantine_reason = ?, updated_at_ms = ?
                     WHERE handle_id = ?
                    """,
                    (reason, current, handle_id),
                )
                if row["content_id"] is not None:
                    connection.execute(
                        """
                        UPDATE content_object
                           SET custody_state = 'quarantined', updated_at_ms = ?
                         WHERE content_id = ? AND custody_state = 'available'
                        """,
                        (current, row["content_id"]),
                    )
                return "quarantined"
            connection.execute(
                """
                UPDATE content_handle
                   SET state = 'committed', committed_sha256_hex = ?, committed_size = ?,
                       terminal_transcript_digest = ?, updated_at_ms = ?
                 WHERE handle_id = ?
                """,
                (sha256_hex, size, terminal_transcript_digest, current, handle_id),
            )
            return "committed"

        return self._immediate(operation)

    def release_output(
        self,
        handle_id: str,
        terminal_transcript_digest: str,
        *,
        peer_role: str,
        at_ms: int | None = None,
    ) -> str:
        if peer_role != "trusted-ui":
            raise LedgerError("unauthorized-peer")
        _validate_hex64(terminal_transcript_digest, "terminal_transcript_digest")
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> str:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            if row is None:
                raise LedgerError("unknown-handle")
            existing = connection.execute(
                "SELECT * FROM output_release WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            if existing is not None:
                if existing["terminal_transcript_digest"] == terminal_transcript_digest:
                    return "idempotent"
                raise LedgerError("release-mismatch")
            if row["state"] != "committed":
                raise LedgerError("release-not-ready")
            connection.execute(
                "INSERT INTO output_release VALUES (?, ?, ?)",
                (handle_id, terminal_transcript_digest, current),
            )
            connection.execute(
                """
                UPDATE content_object SET custody_state = 'released', updated_at_ms = ?
                 WHERE content_id = ? AND custody_state = 'available'
                """,
                (current, row["content_id"]),
            )
            return "released"

        return self._immediate(operation)

    def reconcile_broker_restart(self, *, at_ms: int | None = None) -> dict[str, int]:
        current = now_ms() if at_ms is None else at_ms

        def operation(connection: sqlite3.Connection) -> dict[str, int]:
            expired = connection.execute(
                """
                UPDATE content_handle SET state = 'expired', updated_at_ms = ?
                 WHERE state = 'issued' AND expires_at_ms <= ?
                """,
                (current, current),
            ).rowcount
            rows = connection.execute(
                "SELECT handle_id, content_id FROM content_handle WHERE direction = 'output' AND state = 'consumed'"
            ).fetchall()
            for row in rows:
                connection.execute(
                    """
                    UPDATE content_handle
                       SET state = 'quarantined',
                           quarantine_reason = 'broker-restart-before-terminal-commit',
                           updated_at_ms = ?
                     WHERE handle_id = ? AND state = 'consumed'
                    """,
                    (current, row["handle_id"]),
                )
                if row["content_id"] is not None:
                    connection.execute(
                        """
                        UPDATE content_object
                           SET custody_state = 'quarantined', updated_at_ms = ?
                         WHERE content_id = ? AND custody_state = 'available'
                        """,
                        (current, row["content_id"]),
                    )
            return {"expired": expired, "quarantinedOutputs": len(rows)}

        return self._immediate(operation)

    def garbage_collect(
        self,
        *,
        at_ms: int | None = None,
        orphan_grace_ms: int = 60_000,
    ) -> dict[str, int]:
        current = now_ms() if at_ms is None else at_ms

        def select_operation(
            connection: sqlite3.Connection,
        ) -> tuple[list[str], list[sqlite3.Row], int]:
            connection.execute(
                """
                UPDATE content_handle SET state = 'expired', updated_at_ms = ?
                 WHERE state = 'issued' AND expires_at_ms <= ?
                """,
                (current, current),
            )
            removable = connection.execute(
                """
                SELECT h.handle_id, h.transfer_store_name, h.transfer_complete
                  FROM content_handle h
                  JOIN attempt a ON a.attempt_id = h.attempt_id
                 WHERE h.state IN ('consumed', 'committed', 'quarantined', 'revoked', 'expired')
                   AND h.tombstone_until_ms <= ?
                   AND a.state IN ('succeeded', 'failed')
                """,
                (current,),
            ).fetchall()
            partial_names = [
                row["transfer_store_name"]
                for row in removable
                if row["transfer_store_name"] is not None and not row["transfer_complete"]
            ]
            for row in removable:
                connection.execute(
                    "DELETE FROM content_handle WHERE handle_id = ?", (row["handle_id"],)
                )
            candidates = connection.execute(
                """
                SELECT o.* FROM content_object o
                 WHERE o.retain_until_ms <= ?
                   AND o.custody_state <> 'deleted'
                   AND NOT EXISTS (
                     SELECT 1 FROM content_handle h WHERE h.content_id = o.content_id
                   )
                   AND NOT EXISTS (
                     SELECT 1 FROM attempt_content ac
                     JOIN attempt a ON a.attempt_id = ac.attempt_id
                      WHERE ac.content_id = o.content_id
                        AND a.state IN ('active', 'indeterminate')
                   )
                """,
                (current,),
            ).fetchall()
            for row in candidates:
                connection.execute(
                    """
                    UPDATE content_object SET custody_state = 'gc-eligible', updated_at_ms = ?
                     WHERE content_id = ? AND custody_state <> 'deleted'
                    """,
                    (current, row["content_id"]),
                )
            return partial_names, candidates, len(removable)

        partial_names, candidates, removed_tombstones = self._immediate(select_operation)
        removed_files = 0
        store_fd = os.open(self.store_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            for name in partial_names + [row["store_name"] for row in candidates]:
                try:
                    os.unlink(name, dir_fd=store_fd)
                    removed_files += 1
                except FileNotFoundError:
                    pass
            os.fsync(store_fd)
        finally:
            os.close(store_fd)

        def finish_operation(connection: sqlite3.Connection) -> int:
            count = 0
            for row in candidates:
                cursor = connection.execute(
                    """
                    UPDATE content_object SET custody_state = 'deleted', updated_at_ms = ?
                     WHERE content_id = ? AND custody_state = 'gc-eligible'
                    """,
                    (current, row["content_id"]),
                )
                count += cursor.rowcount
            return count

        deleted_objects = self._immediate(finish_operation)
        known_names: set[str] = set()
        connection = self.connect()
        try:
            known_names.update(
                row[0]
                for row in connection.execute(
                    "SELECT store_name FROM content_object WHERE custody_state <> 'deleted'"
                )
            )
            known_names.update(
                row[0]
                for row in connection.execute(
                    """
                    SELECT transfer_store_name FROM content_handle
                     WHERE transfer_store_name IS NOT NULL
                    """
                )
            )
        finally:
            connection.close()
        orphan_removed = 0
        cutoff_ns = (current - orphan_grace_ms) * 1_000_000
        for entry in self.store_dir.iterdir():
            if entry.name in known_names:
                continue
            if not (HEX_64.fullmatch(entry.name) or entry.name.startswith(".partial-")):
                continue
            try:
                if entry.stat(follow_symlinks=False).st_mtime_ns <= cutoff_ns and entry.is_file():
                    entry.unlink()
                    orphan_removed += 1
            except FileNotFoundError:
                pass
        return {
            "removedTombstones": removed_tombstones,
            "deletedObjects": deleted_objects,
            "removedFiles": removed_files,
            "removedOrphans": orphan_removed,
        }

    def handle(self, handle_id: str) -> dict[str, Any]:
        connection = self.connect()
        try:
            row = connection.execute(
                "SELECT * FROM content_handle WHERE handle_id = ?", (handle_id,)
            ).fetchone()
            if row is None:
                raise LedgerError("unknown-handle")
            return dict(row)
        finally:
            connection.close()

    def content(self, content_id: str) -> dict[str, Any]:
        connection = self.connect()
        try:
            row = connection.execute(
                "SELECT * FROM content_object WHERE content_id = ?", (content_id,)
            ).fetchone()
            if row is None:
                raise LedgerError("unknown-content")
            return dict(row)
        finally:
            connection.close()

    def integrity_check(self) -> str:
        connection = self.connect()
        try:
            return connection.execute("PRAGMA integrity_check").fetchone()[0]
        finally:
            connection.close()
