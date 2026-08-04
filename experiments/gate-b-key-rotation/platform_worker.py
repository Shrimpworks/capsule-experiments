#!/usr/bin/env python3
"""Crashable durable transition worker backed by real provisioned Keychain groups."""

from __future__ import annotations

import argparse
import os
import signal
import sqlite3
import subprocess
from pathlib import Path


def command(binary: str, *arguments: str) -> str:
    result = subprocess.run(
        [binary, *arguments], check=True, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    return result.stdout


def value(output: str, prefix: str) -> str:
    for line in output.splitlines():
        if line.startswith(prefix):
            return line[len(prefix):].split(" ", 1)[0]
    raise RuntimeError(f"missing {prefix!r} in {output!r}")


class PlatformTransition:
    def __init__(self, arguments: argparse.Namespace):
        self.arguments = arguments
        self.db = sqlite3.connect(arguments.state)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS state(
              singleton INTEGER PRIMARY KEY CHECK(singleton=1), phase TEXT NOT NULL,
              execution_enabled INTEGER NOT NULL, epoch INTEGER NOT NULL,
              active_key TEXT NOT NULL, old_fingerprint TEXT,
              new_fingerprint TEXT, old_retired INTEGER NOT NULL DEFAULT 0,
              accepted_cdhash TEXT
            );
            CREATE TABLE IF NOT EXISTS events(
              sequence INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL
            );
            """
        )

    def close(self) -> None:
        self.db.close()

    def checkpoint(self, name: str) -> None:
        if self.arguments.crash_at != name:
            return
        marker = Path(self.arguments.marker)
        temporary = marker.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            stream.write(f"{os.getpid()} {name}\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, marker)
        descriptor = os.open(marker.parent, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        while True:
            signal.pause()

    def event(self, code: str) -> None:
        self.db.execute("INSERT INTO events(code) VALUES(?)", (code,))

    def state(self) -> sqlite3.Row:
        row = self.db.execute("SELECT * FROM state WHERE singleton=1").fetchone()
        if row is None:
            raise RuntimeError("platform state is not initialized")
        return row

    def fingerprint(self, binary: str, group: str, tag: str) -> str | None:
        output = command(binary, "fingerprint-key", group, tag)
        status = value(output, "key.lookup.status=")
        if status == "-25300":
            return None
        if status != "0":
            raise RuntimeError(f"key lookup failed: {output}")
        fingerprint = value(output, "key.fingerprint=")
        if fingerprint == "false":
            raise RuntimeError("public-key fingerprint unavailable")
        return fingerprint

    def ensure(self, binary: str, group: str, tag: str) -> str:
        output = command(binary, "ensure-key", group, tag, "evidence")
        if "key.ensure=true" not in output:
            raise RuntimeError(f"key ensure failed: {output}")
        return next(
            field.split("=", 1)[1]
            for field in output.split()
            if field.startswith("fingerprint=")
        )

    def delete(self, binary: str, group: str, tag: str) -> None:
        output = command(binary, "delete-key", group, tag)
        status = value(output, "key.delete.status=")
        if status not in ("0", "-25300"):
            raise RuntimeError(f"key deletion failed: {output}")

    def initialize(self) -> None:
        if self.db.execute("SELECT 1 FROM state").fetchone() is not None:
            return
        old_fingerprint = self.ensure(
            self.arguments.old_binary, self.arguments.old_group, self.arguments.old_tag
        )
        with self.db:
            self.db.execute(
                "INSERT INTO state VALUES(1,'stable',1,1,?,?,NULL,0,NULL)",
                (self.arguments.old_tag, old_fingerprint),
            )
            self.event("initialized")

    def flow(self) -> None:
        state = self.state()
        if state["phase"] != "stable" or state["execution_enabled"] != 1:
            raise RuntimeError("flow requires stable enabled state")
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='prepared',execution_enabled=0 WHERE singleton=1"
            )
            self.event("transition-fenced")
        self.checkpoint("transition_fenced")

        new_fingerprint = self.ensure(
            self.arguments.new_binary, self.arguments.new_group, self.arguments.new_tag
        )
        self.checkpoint("new_key_created_external")
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='new-key-authorized',new_fingerprint=? WHERE singleton=1",
                (new_fingerprint,),
            )
            self.event("new-key-authorized")
        self.checkpoint("new_key_authorized")

        with self.db:
            self.db.execute(
                """UPDATE state SET phase='epoch-committed',epoch=2,active_key=?,
                   execution_enabled=0 WHERE singleton=1""",
                (self.arguments.new_tag,),
            )
            self.event("epoch-committed")
        self.checkpoint("epoch_committed")

        self.delete(self.arguments.old_binary, self.arguments.old_group, self.arguments.old_tag)
        self.checkpoint("old_key_deleted_external")
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='awaiting-acceptance',old_retired=1 WHERE singleton=1"
            )
            self.event("old-key-retired")
        self.checkpoint("old_key_retired")

        cdhash = value(command(self.arguments.new_binary, "identity"), "identity.cdhash=")
        with self.db:
            self.db.execute(
                "UPDATE state SET accepted_cdhash=? WHERE singleton=1", (cdhash,)
            )
            self.event("component-accepted")
        self.checkpoint("component_accepted")
        self.enable_if_exact()
        self.checkpoint("execution_enabled")

    def enable_if_exact(self) -> None:
        state = self.state()
        new_fingerprint = self.fingerprint(
            self.arguments.new_binary, self.arguments.new_group, self.arguments.new_tag
        )
        old_fingerprint = self.fingerprint(
            self.arguments.old_binary, self.arguments.old_group, self.arguments.old_tag
        )
        current_cdhash = value(command(self.arguments.new_binary, "identity"), "identity.cdhash=")
        if (
            state["epoch"] != 2
            or state["old_retired"] != 1
            or old_fingerprint is not None
            or new_fingerprint != state["new_fingerprint"]
            or current_cdhash != state["accepted_cdhash"]
        ):
            raise RuntimeError("target world is not exact; execution remains fenced")
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='stable',execution_enabled=1 WHERE singleton=1"
            )
            self.event("execution-enabled")

    def recover(self, strategy: str) -> None:
        state = self.state()
        if state["phase"] == "stable" and state["execution_enabled"] == 1:
            if state["epoch"] == 2:
                self.enable_if_exact()
            print(f"platform.recovery=stable epoch={state['epoch']}")
            return
        with self.db:
            self.db.execute(
                "UPDATE state SET phase='repair-required',execution_enabled=0 WHERE singleton=1"
            )
            self.event("repair-required")
        if strategy == "restore-prior":
            if self.state()["epoch"] != 1:
                raise RuntimeError("committed epoch cannot be rewound")
            self.delete(self.arguments.new_binary, self.arguments.new_group, self.arguments.new_tag)
            old_fingerprint = self.fingerprint(
                self.arguments.old_binary, self.arguments.old_group, self.arguments.old_tag
            )
            if old_fingerprint != self.state()["old_fingerprint"]:
                raise RuntimeError("prior key is unavailable")
            with self.db:
                self.db.execute(
                    """UPDATE state SET phase='stable',execution_enabled=1,active_key=?,
                       new_fingerprint=NULL,old_retired=0,accepted_cdhash=NULL WHERE singleton=1""",
                    (self.arguments.old_tag,),
                )
                self.event("prior-restored")
            print("platform.recovery=restored-prior epoch=1")
            return
        if strategy != "finish-target":
            raise RuntimeError("unknown recovery strategy")
        new_fingerprint = self.fingerprint(
            self.arguments.new_binary, self.arguments.new_group, self.arguments.new_tag
        )
        if new_fingerprint is None:
            new_fingerprint = self.ensure(
                self.arguments.new_binary, self.arguments.new_group, self.arguments.new_tag
            )
        recorded = self.state()["new_fingerprint"]
        if recorded is not None and recorded != new_fingerprint:
            raise RuntimeError("new key changed after authorization")
        with self.db:
            self.db.execute(
                """UPDATE state SET phase='epoch-committed',epoch=2,active_key=?,
                   new_fingerprint=?,execution_enabled=0 WHERE singleton=1""",
                (self.arguments.new_tag, new_fingerprint),
            )
            self.event("forward-repair-epoch")
        self.delete(self.arguments.old_binary, self.arguments.old_group, self.arguments.old_tag)
        cdhash = value(command(self.arguments.new_binary, "identity"), "identity.cdhash=")
        with self.db:
            self.db.execute(
                """UPDATE state SET phase='awaiting-acceptance',old_retired=1,
                   accepted_cdhash=? WHERE singleton=1""",
                (cdhash,),
            )
            self.event("forward-repair-accepted")
        self.enable_if_exact()
        print("platform.recovery=finished-target epoch=2")


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("init", "flow", "recover"))
    parser.add_argument("--state", required=True)
    parser.add_argument("--old-binary", required=True)
    parser.add_argument("--new-binary", required=True)
    parser.add_argument("--old-group", required=True)
    parser.add_argument("--new-group", required=True)
    parser.add_argument("--old-tag", required=True)
    parser.add_argument("--new-tag", required=True)
    parser.add_argument("--marker", default="marker")
    parser.add_argument("--crash-at", default="")
    parser.add_argument("--strategy", choices=("restore-prior", "finish-target"), default="finish-target")
    return parser.parse_args()


def main() -> int:
    parsed = arguments()
    transition = PlatformTransition(parsed)
    try:
        transition.initialize()
        if parsed.action == "flow":
            transition.flow()
        elif parsed.action == "recover":
            transition.recover(parsed.strategy)
    finally:
        transition.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
