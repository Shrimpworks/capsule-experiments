#!/usr/bin/env python3
"""Independent process worker for the Gate F durability follow-up."""

from __future__ import annotations

import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

from durability import (
    AuthorityStore,
    Refused,
    atomic_replace_bytes,
    atomic_replace_json,
    remove_external_effect,
    write_external_effect,
)


def publish_marker(marker: Path, name: str) -> None:
    marker.parent.mkdir(parents=True, exist_ok=True)
    atomic_replace_json(marker, {"checkpoint": name, "pid": os.getpid()})


def pause(marker: Path, name: str) -> None:
    publish_marker(marker, name)
    while True:
        signal.pause()


def run_atomic_replace(arguments: argparse.Namespace) -> None:
    def checkpoint(name: str) -> None:
        if name == arguments.checkpoint:
            pause(arguments.marker, name)

    atomic_replace_bytes(arguments.target, arguments.payload.encode("utf-8"), checkpoint)
    raise RuntimeError("requested checkpoint was not reached")


def run_lock_holder(arguments: argparse.Namespace) -> None:
    store = AuthorityStore(arguments.root, timeout_seconds=0)
    store.initialize()
    store.connection.execute("BEGIN IMMEDIATE")
    store.connection.execute(
        "UPDATE installation SET phase='uncommitted-holder' WHERE singleton=1"
    )
    pause(arguments.marker, "writer-lock-held")


def run_try_fence(arguments: argparse.Namespace) -> None:
    store = AuthorityStore(arguments.root, timeout_seconds=0)
    result: dict[str, str]
    try:
        store.fence_transition(arguments.transition)
        result = {"status": "committed"}
    except sqlite3.OperationalError as error:
        result = {"status": "locked", "error": str(error)}
    except Refused as error:
        result = {"status": "refused", "error": str(error)}
    finally:
        store.close()
    atomic_replace_json(arguments.result, result)


def run_fence_flow(arguments: argparse.Namespace) -> None:
    store = AuthorityStore(arguments.root)
    store.initialize()

    def checkpoint(name: str) -> None:
        if name == arguments.checkpoint:
            pause(arguments.marker, name)

    store.fence_transition("update-2", checkpoint=checkpoint)
    raise RuntimeError("requested checkpoint was not reached")


def run_cas_epoch(arguments: argparse.Namespace) -> None:
    deadline = time.monotonic() + 10
    while not arguments.start.exists() and time.monotonic() < deadline:
        time.sleep(0.005)
    if not arguments.start.exists():
        raise RuntimeError("start barrier was not released")
    store = AuthorityStore(arguments.root, timeout_seconds=5)
    status = "mismatch"
    store.connection.execute("BEGIN IMMEDIATE")
    try:
        row = store.row()
        if row["epoch"] == arguments.expected and row["phase"] == "stable":
            store.connection.execute(
                """UPDATE installation SET state_seq=state_seq+1,epoch=?,epoch_digest=?
                   WHERE singleton=1""",
                (arguments.target_epoch, f"epoch-{arguments.target_epoch}"),
            )
            status = "committed"
        store.connection.execute("COMMIT")
    except BaseException:
        store.connection.execute("ROLLBACK")
        raise
    if status == "committed":
        store.sync_checkpoint()
    store.close()
    atomic_replace_json(arguments.result, {"status": status})


def create_wal_database(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(path, isolation_level=None)
    connection.execute("PRAGMA page_size=4096")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=FULL")
    connection.execute("PRAGMA fullfsync=ON")
    connection.execute("PRAGMA checkpoint_fullfsync=ON")
    connection.execute("PRAGMA wal_autocheckpoint=0")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS security_state(
          singleton INTEGER PRIMARY KEY CHECK(singleton=1),
          attempts_enabled INTEGER NOT NULL,
          phase TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS padding(value BLOB NOT NULL);
        INSERT OR IGNORE INTO security_state VALUES(1,1,'stable');
        """
    )
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    return connection


def run_wal_holder(arguments: argparse.Namespace) -> None:
    connection = create_wal_database(arguments.database)
    connection.execute("BEGIN IMMEDIATE")
    connection.execute(
        "UPDATE security_state SET attempts_enabled=0,phase='repair-required' WHERE singleton=1"
    )
    for number in range(512):
        connection.execute("INSERT INTO padding(value) VALUES(?)", (os.urandom(4096),))
    connection.execute("COMMIT")
    if arguments.anchor is not None:
        atomic_replace_json(
            arguments.anchor,
            {"attemptsEnabled": False, "phase": "repair-required"},
        )
    pause(arguments.marker, "wal-commit-visible")


def run_checkpoint_boundary(arguments: argparse.Namespace) -> None:
    connection = create_wal_database(arguments.database)
    connection.execute("BEGIN IMMEDIATE")
    connection.execute(
        "UPDATE security_state SET attempts_enabled=0,phase='repair-required' WHERE singleton=1"
    )
    for _number in range(256):
        connection.execute("INSERT INTO padding(value) VALUES(?)", (os.urandom(4096),))
    connection.execute("COMMIT")
    if arguments.checkpoint == "before-checkpoint":
        pause(arguments.marker, "before-checkpoint")
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    if arguments.checkpoint == "after-checkpoint":
        pause(arguments.marker, "after-checkpoint")
    raise RuntimeError("requested checkpoint was not reached")


def external_worker(arguments: argparse.Namespace) -> None:
    if arguments.operation == "create":
        write_external_effect(
            arguments.path,
            effect_key=arguments.effect_key,
            handle=arguments.handle,
            payload_digest=arguments.payload_digest,
        )
    else:
        remove_external_effect(arguments.path)


def invoke_external(
    path: Path,
    effect_key: str,
    handle: str,
    payload_digest: str | None = None,
) -> None:
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        "external-effect",
        "--operation",
        "create",
        "--path",
        str(path),
        "--effect-key",
        effect_key,
        "--handle",
        handle,
    ]
    if payload_digest is not None:
        command.extend(("--payload-digest", payload_digest))
    subprocess.run(command, check=True)


def run_installer_flow(arguments: argparse.Namespace) -> None:
    store = AuthorityStore(arguments.root)
    store.initialize()
    store.fence_transition("update-2")
    expected = "component-v2-digest"
    store.persist_effect_intent("install-component-v2", "component-install", expected_digest=expected)
    if arguments.checkpoint == "installer-intent-durable":
        pause(arguments.marker, "installer-intent-durable")
    external = arguments.root / "external" / "component-v2.json"
    invoke_external(external, "install-component-v2", "component-v2", expected)
    if arguments.checkpoint == "installer-effect-visible":
        pause(arguments.marker, "installer-effect-visible")
    store.observe_effect("install-component-v2", "component-v2")
    if arguments.checkpoint == "installer-observation-durable":
        pause(arguments.marker, "installer-observation-durable")
    raise RuntimeError("requested checkpoint was not reached")


def run_backend_flow(arguments: argparse.Namespace) -> None:
    store = AuthorityStore(arguments.root)
    store.initialize()
    store.issue_and_consume("grant-1", "attempt-1")
    store.persist_effect_intent("backend-attempt-1", "backend-create")
    if arguments.checkpoint == "backend-intent-durable":
        pause(arguments.marker, "backend-intent-durable")
    external = arguments.root / "external" / "guest-attempt-1.json"
    invoke_external(external, "backend-attempt-1", "guest-attempt-1")
    if arguments.checkpoint == "backend-effect-visible":
        pause(arguments.marker, "backend-effect-visible")
    store.observe_effect("backend-attempt-1", "guest-attempt-1")
    if arguments.checkpoint == "backend-observation-durable":
        pause(arguments.marker, "backend-observation-durable")
    raise RuntimeError("requested checkpoint was not reached")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)

    atomic = commands.add_parser("atomic-replace")
    atomic.add_argument("--target", required=True, type=Path)
    atomic.add_argument("--payload", required=True)
    atomic.add_argument("--marker", required=True, type=Path)
    atomic.add_argument("--checkpoint", required=True)

    lock = commands.add_parser("hold-lock")
    lock.add_argument("--root", required=True, type=Path)
    lock.add_argument("--marker", required=True, type=Path)

    fence = commands.add_parser("try-fence")
    fence.add_argument("--root", required=True, type=Path)
    fence.add_argument("--transition", required=True)
    fence.add_argument("--result", required=True, type=Path)

    fence_flow = commands.add_parser("fence-flow")
    fence_flow.add_argument("--root", required=True, type=Path)
    fence_flow.add_argument("--marker", required=True, type=Path)
    fence_flow.add_argument("--checkpoint", required=True)

    cas = commands.add_parser("cas-epoch")
    cas.add_argument("--root", required=True, type=Path)
    cas.add_argument("--expected", required=True, type=int)
    cas.add_argument("--target-epoch", required=True, type=int)
    cas.add_argument("--start", required=True, type=Path)
    cas.add_argument("--result", required=True, type=Path)

    wal = commands.add_parser("wal-holder")
    wal.add_argument("--database", required=True, type=Path)
    wal.add_argument("--marker", required=True, type=Path)
    wal.add_argument("--anchor", type=Path)

    checkpoint = commands.add_parser("checkpoint-boundary")
    checkpoint.add_argument("--database", required=True, type=Path)
    checkpoint.add_argument("--marker", required=True, type=Path)
    checkpoint.add_argument(
        "--checkpoint", required=True, choices=("before-checkpoint", "after-checkpoint")
    )

    external = commands.add_parser("external-effect")
    external.add_argument("--operation", required=True, choices=("create", "delete"))
    external.add_argument("--path", required=True, type=Path)
    external.add_argument("--effect-key", default="unused")
    external.add_argument("--handle", default="unused")
    external.add_argument("--payload-digest")

    installer = commands.add_parser("installer-flow")
    installer.add_argument("--root", required=True, type=Path)
    installer.add_argument("--marker", required=True, type=Path)
    installer.add_argument("--checkpoint", required=True)

    backend = commands.add_parser("backend-flow")
    backend.add_argument("--root", required=True, type=Path)
    backend.add_argument("--marker", required=True, type=Path)
    backend.add_argument("--checkpoint", required=True)
    return root


def main() -> int:
    arguments = parser().parse_args()
    dispatch = {
        "atomic-replace": run_atomic_replace,
        "hold-lock": run_lock_holder,
        "try-fence": run_try_fence,
        "fence-flow": run_fence_flow,
        "cas-epoch": run_cas_epoch,
        "wal-holder": run_wal_holder,
        "checkpoint-boundary": run_checkpoint_boundary,
        "external-effect": external_worker,
        "installer-flow": run_installer_flow,
        "backend-flow": run_backend_flow,
    }
    dispatch[arguments.command](arguments)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
