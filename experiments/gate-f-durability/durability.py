"""Development-only durable-state primitives for the Gate F follow-up spike.

This module is deliberately isolated from product packages.  It exercises a small
SQLite authority store, a separately durable checkpoint file, and enumerable fake
external effects.  Hashes in this experiment are integrity comparisons, not
signatures or authorization.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


Checkpoint = Callable[[str], None]
NO_CHECKPOINT: Checkpoint = lambda _name: None


class Refused(RuntimeError):
    """A security-sensitive operation was refused closed."""


@dataclass(frozen=True)
class Verification:
    status: str
    detail: str
    state: dict[str, Any] | None = None

    @property
    def ready(self) -> bool:
        return self.status == "ready"


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def durable_sync_file(descriptor: int) -> None:
    """Request ordinary fsync and Darwin's stronger media flush when available."""

    os.fsync(descriptor)
    if sys.platform == "darwin":
        import fcntl

        # Darwin SDK sys/fcntl.h: F_FULLFSYNC = 51.
        fcntl.fcntl(descriptor, 51)


def atomic_replace_bytes(
    path: Path,
    payload: bytes,
    checkpoint: Checkpoint = NO_CHECKPOINT,
) -> None:
    """Replace one file using write/fsync/rename/directory-fsync ordering."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.tmp-{os.getpid()}")
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        durable_sync_file(descriptor)
        checkpoint("temp-fsynced")
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    checkpoint("renamed")
    fsync_directory(path.parent)
    checkpoint("directory-fsynced")


def atomic_replace_json(
    path: Path,
    value: Any,
    checkpoint: Checkpoint = NO_CHECKPOINT,
) -> None:
    atomic_replace_bytes(path, canonical_bytes(value), checkpoint)


def copy_sqlite_bundle(source: Path, destination: Path) -> None:
    """Copy a quiescent SQLite database plus any WAL/SHM companions."""

    destination.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        candidate = Path(f"{source}{suffix}")
        target = Path(f"{destination}{suffix}")
        if candidate.exists():
            shutil.copy2(candidate, target)


class AuthorityStore:
    """Small Supervisor-like store with an independently persisted checkpoint."""

    def __init__(self, root: Path, *, timeout_seconds: float = 5.0):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path = root / "authority.sqlite"
        self.checkpoint_path = root / "checkpoint.json"
        self.connection = sqlite3.connect(
            self.database_path,
            timeout=timeout_seconds,
            isolation_level=None,
        )
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.execute("PRAGMA fullfsync=ON")
        self.connection.execute("PRAGMA checkpoint_fullfsync=ON")
        self.connection.execute("PRAGMA wal_autocheckpoint=0")
        self._schema()

    def _schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS installation(
              singleton INTEGER PRIMARY KEY CHECK(singleton=1),
              state_seq INTEGER NOT NULL,
              epoch INTEGER NOT NULL,
              epoch_digest TEXT NOT NULL,
              phase TEXT NOT NULL,
              attempts_enabled INTEGER NOT NULL CHECK(attempts_enabled IN (0,1)),
              transition_id TEXT,
              last_wall_ms INTEGER NOT NULL,
              clock_status TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS grants(
              grant_id TEXT PRIMARY KEY,
              status TEXT NOT NULL,
              attempt_id TEXT UNIQUE
            );
            CREATE TABLE IF NOT EXISTS attempts(
              attempt_id TEXT PRIMARY KEY,
              grant_id TEXT UNIQUE NOT NULL,
              status TEXT NOT NULL,
              cleanup_state TEXT NOT NULL,
              backend_handle TEXT
            );
            CREATE TABLE IF NOT EXISTS effects(
              effect_key TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              status TEXT NOT NULL,
              expected_digest TEXT,
              observed_handle TEXT
            );
            CREATE TABLE IF NOT EXISTS events(
              seq INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              detail TEXT NOT NULL
            );
            """
        )

    def close(self) -> None:
        self.connection.close()

    def initialize(self, *, wall_ms: int = 1_000_000) -> None:
        if self.connection.execute("SELECT 1 FROM installation").fetchone() is not None:
            return
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self.connection.execute(
                """INSERT INTO installation(
                     singleton,state_seq,epoch,epoch_digest,phase,attempts_enabled,
                     transition_id,last_wall_ms,clock_status
                   ) VALUES(1,1,1,'epoch-1','stable',1,NULL,?,'trusted')""",
                (wall_ms,),
            )
            self.connection.execute(
                "INSERT INTO events(kind,detail) VALUES('initialized','epoch-1')"
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.sync_checkpoint()

    def row(self) -> dict[str, Any]:
        row = self.connection.execute(
            "SELECT * FROM installation WHERE singleton=1"
        ).fetchone()
        if row is None:
            raise Refused("missing installation state")
        return dict(row)

    @staticmethod
    def checkpoint_for(row: dict[str, Any]) -> dict[str, Any]:
        body = {
            "version": 1,
            "stateSeq": row["state_seq"],
            "epoch": row["epoch"],
            "epochDigest": row["epoch_digest"],
            "phase": row["phase"],
            "attemptsEnabled": bool(row["attempts_enabled"]),
            "transitionId": row["transition_id"],
            "clockStatus": row["clock_status"],
            "lastWallMs": row["last_wall_ms"],
        }
        return {"body": body, "digest": sha256(canonical_bytes(body))}

    def sync_checkpoint(self, checkpoint: Checkpoint = NO_CHECKPOINT) -> None:
        atomic_replace_json(self.checkpoint_path, self.checkpoint_for(self.row()), checkpoint)

    def verify(self) -> Verification:
        try:
            quick = self.connection.execute("PRAGMA quick_check(1)").fetchone()
            if quick is None or quick[0] != "ok":
                return Verification("corrupt", f"quick_check={quick!r}")
            row = self.row()
        except (sqlite3.DatabaseError, Refused) as error:
            return Verification("corrupt", str(error))
        try:
            stored = json.loads(self.checkpoint_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            return Verification("checkpoint-invalid", str(error), row)
        expected = self.checkpoint_for(row)
        if stored != expected:
            return Verification("checkpoint-mismatch", "database/checkpoint disagree", row)
        if row["clock_status"] != "trusted":
            return Verification("clock-untrusted", row["clock_status"], row)
        if row["phase"] != "stable" or not row["attempts_enabled"]:
            return Verification("repair-required", "installation is fenced", row)
        return Verification("ready", "database and checkpoint agree", row)

    def fence_transition(
        self,
        transition_id: str,
        *,
        checkpoint: Checkpoint = NO_CHECKPOINT,
    ) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.row()
            if row["phase"] != "stable" or not row["attempts_enabled"]:
                raise Refused("installation is not ready to transition")
            self.connection.execute(
                """UPDATE installation
                   SET state_seq=state_seq+1,phase='preparing-update',attempts_enabled=0,
                       transition_id=? WHERE singleton=1""",
                (transition_id,),
            )
            self.connection.execute(
                "UPDATE grants SET status='invalidated-transition' WHERE status='issued'"
            )
            self.connection.execute(
                "INSERT INTO events(kind,detail) VALUES('transition-fenced',?)",
                (transition_id,),
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        checkpoint("database-committed")
        self.sync_checkpoint(
            lambda name: checkpoint(f"checkpoint-{name}")
        )

    def finalize_epoch(self, transition_id: str, epoch: int) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.row()
            if row["transition_id"] != transition_id or row["phase"] not in {
                "preparing-update",
                "repair-required",
            }:
                raise Refused("transition is not active")
            self.connection.execute(
                """UPDATE installation
                   SET state_seq=state_seq+1,epoch=?,epoch_digest=?,phase='stable',
                       attempts_enabled=1,transition_id=NULL
                   WHERE singleton=1""",
                (epoch, f"epoch-{epoch}"),
            )
            self.connection.execute(
                "INSERT INTO events(kind,detail) VALUES('epoch-finalized',?)",
                (str(epoch),),
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.sync_checkpoint()

    def observe_clock(self, now_ms: int | None, *, tolerated_backstep_ms: int = 0) -> str:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.row()
            if now_ms is None:
                status = "unavailable"
                last = row["last_wall_ms"]
            elif now_ms + tolerated_backstep_ms < row["last_wall_ms"]:
                status = "rollback-detected"
                last = row["last_wall_ms"]
            else:
                status = "trusted"
                last = max(now_ms, row["last_wall_ms"])
            attempts_enabled = int(
                status == "trusted" and row["phase"] == "stable"
            )
            self.connection.execute(
                """UPDATE installation
                   SET state_seq=state_seq+1,last_wall_ms=?,clock_status=?,attempts_enabled=?
                   WHERE singleton=1""",
                (last, status, attempts_enabled),
            )
            self.connection.execute(
                "INSERT INTO events(kind,detail) VALUES('clock-observed',?)",
                (status,),
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise
        self.sync_checkpoint()
        return status

    def issue_and_consume(self, grant_id: str, attempt_id: str) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.row()
            if row["phase"] != "stable" or not row["attempts_enabled"]:
                raise Refused("attempts are disabled")
            self.connection.execute(
                "INSERT INTO grants(grant_id,status,attempt_id) VALUES(?, 'consumed', ?)",
                (grant_id, attempt_id),
            )
            self.connection.execute(
                """INSERT INTO attempts(
                     attempt_id,grant_id,status,cleanup_state,backend_handle
                   ) VALUES(?,?,'created','none',NULL)""",
                (attempt_id, grant_id),
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def persist_effect_intent(
        self,
        effect_key: str,
        kind: str,
        *,
        expected_digest: str | None = None,
    ) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            self.connection.execute(
                """INSERT INTO effects(effect_key,kind,status,expected_digest,observed_handle)
                   VALUES(?,?,'intent',?,NULL)""",
                (effect_key, kind, expected_digest),
            )
            if kind == "backend-create":
                attempt_id = effect_key.removeprefix("backend-")
                changed = self.connection.execute(
                    """UPDATE attempts SET status='creating',cleanup_state='required'
                       WHERE attempt_id=?""",
                    (attempt_id,),
                ).rowcount
                if changed != 1:
                    raise Refused("backend intent has no exact attempt")
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def observe_effect(self, effect_key: str, handle: str) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            row = self.connection.execute(
                "SELECT * FROM effects WHERE effect_key=?", (effect_key,)
            ).fetchone()
            if row is None or row["status"] not in {"intent", "observed"}:
                raise Refused("effect has no active durable intent")
            self.connection.execute(
                "UPDATE effects SET status='observed',observed_handle=? WHERE effect_key=?",
                (handle, effect_key),
            )
            if row["kind"] == "backend-create":
                attempt_id = effect_key.removeprefix("backend-")
                self.connection.execute(
                    """UPDATE attempts SET status='unresolved',cleanup_state='required',
                       backend_handle=? WHERE attempt_id=?""",
                    (handle, attempt_id),
                )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def reconcile_effect(self, effect_key: str, external_path: Path) -> str:
        intent = self.connection.execute(
            "SELECT * FROM effects WHERE effect_key=?", (effect_key,)
        ).fetchone()
        if intent is None:
            raise Refused("external effect without a durable intent")
        if not external_path.exists():
            return "outcome-unknown"
        try:
            observed = json.loads(external_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            return "external-corrupt"
        if observed.get("effectKey") != effect_key:
            return "external-mismatch"
        if intent["expected_digest"] is not None:
            if observed.get("payloadDigest") != intent["expected_digest"]:
                return "external-mismatch"
        self.observe_effect(effect_key, str(observed.get("handle", "")))
        return "observed"

    def mark_backend_destroyed(self, attempt_id: str) -> None:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            changed = self.connection.execute(
                """UPDATE attempts SET status='terminal',cleanup_state='destroyed'
                   WHERE attempt_id=? AND cleanup_state='required'""",
                (attempt_id,),
            ).rowcount
            if changed != 1:
                raise Refused("attempt does not have a cleanup obligation")
            self.connection.execute(
                "UPDATE effects SET status='completed' WHERE effect_key=?",
                (f"backend-{attempt_id}",),
            )
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def effect_row(self, effect_key: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM effects WHERE effect_key=?", (effect_key,)
        ).fetchone()
        return None if row is None else dict(row)

    def attempt_row(self, attempt_id: str) -> dict[str, Any] | None:
        row = self.connection.execute(
            "SELECT * FROM attempts WHERE attempt_id=?", (attempt_id,)
        ).fetchone()
        return None if row is None else dict(row)

    def checkpoint_truncate(self) -> tuple[int, int, int]:
        row = self.connection.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        if row is None:
            raise RuntimeError("SQLite returned no checkpoint result")
        return tuple(row)  # type: ignore[return-value]


def write_external_effect(
    path: Path,
    *,
    effect_key: str,
    handle: str,
    payload_digest: str | None = None,
) -> None:
    body = {
        "effectKey": effect_key,
        "handle": handle,
        "payloadDigest": payload_digest,
    }
    atomic_replace_json(path, body)


def remove_external_effect(path: Path) -> None:
    if path.exists():
        path.unlink()
        fsync_directory(path.parent)


def verify_bundle(root: Path) -> Verification:
    """Open and verify a bundle without allowing SQLite damage to escape."""

    try:
        store = AuthorityStore(root)
    except sqlite3.DatabaseError as error:
        return Verification("corrupt", str(error))
    try:
        return store.verify()
    finally:
        store.close()
