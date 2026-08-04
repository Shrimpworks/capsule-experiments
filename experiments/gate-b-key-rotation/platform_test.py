#!/usr/bin/env python3
"""Run real provisioned Keychain cross-use, replay, retirement, and SIGKILL cases."""

from __future__ import annotations

import argparse
import os
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path


HERE = Path(__file__).resolve().parent
CRASH_CASES = (
    ("transition_fenced", "restore-prior", 1),
    ("new_key_created_external", "finish-target", 2),
    ("new_key_authorized", "restore-prior", 1),
    ("epoch_committed", "finish-target", 2),
    ("old_key_deleted_external", "finish-target", 2),
    ("old_key_retired", "finish-target", 2),
    ("component_accepted", "finish-target", 2),
    ("execution_enabled", "finish-target", 2),
)


def run(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        list(arguments), check=check, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )


def lookup(binary: str, group: str, tag: str) -> tuple[int, str | None]:
    output = run(binary, "fingerprint-key", group, tag).stdout
    status_line = next(line for line in output.splitlines() if line.startswith("key.lookup.status="))
    status = int(status_line.split("=", 1)[1].split(" ", 1)[0])
    fingerprint_line = next(
        line for line in output.splitlines() if line.startswith("key.fingerprint=")
    )
    fingerprint = fingerprint_line.split("=", 1)[1]
    return status, None if fingerprint == "false" else fingerprint


class Case:
    def __init__(self, arguments: argparse.Namespace):
        self.arguments = arguments
        suffix = uuid.uuid4().hex
        self.old_tag = f"io.github.dills122.capsule.gate-b.rotation.old.{suffix}"
        self.new_tag = f"io.github.dills122.capsule.gate-b.rotation.new.{suffix}"

    def worker_arguments(self, action: str, state: Path) -> list[str]:
        return [
            sys.executable,
            str(HERE / "platform_worker.py"),
            action,
            "--state", str(state),
            "--old-binary", self.arguments.old_binary,
            "--new-binary", self.arguments.new_binary,
            "--old-group", self.arguments.old_group,
            "--new-group", self.arguments.new_group,
            "--old-tag", self.old_tag,
            "--new-tag", self.new_tag,
        ]

    def cleanup(self) -> None:
        run(
            self.arguments.old_binary, "delete-key", self.arguments.old_group,
            self.old_tag, check=False,
        )
        run(
            self.arguments.new_binary, "delete-key", self.arguments.new_group,
            self.new_tag, check=False,
        )


def test_cross_use_and_idempotence(arguments: argparse.Namespace) -> None:
    case = Case(arguments)
    try:
        old_first = run(
            arguments.old_binary, "ensure-key", arguments.old_group, case.old_tag, "evidence"
        ).stdout
        new_first = run(
            arguments.new_binary, "ensure-key", arguments.new_group, case.new_tag, "evidence"
        ).stdout
        new_second = run(
            arguments.new_binary, "ensure-key", arguments.new_group, case.new_tag, "evidence"
        ).stdout
        if "created=true" not in old_first or "created=true" not in new_first:
            raise RuntimeError("fresh disposable keys were not created")
        if "created=false" not in new_second:
            raise RuntimeError("idempotent ensure replaced the new key")
        old_own = lookup(arguments.old_binary, arguments.old_group, case.old_tag)
        new_own = lookup(arguments.new_binary, arguments.new_group, case.new_tag)
        old_to_new = lookup(arguments.old_binary, arguments.new_group, case.new_tag)
        new_to_old = lookup(arguments.new_binary, arguments.old_group, case.old_tag)
        if old_own[0] != 0 or new_own[0] != 0:
            raise RuntimeError("own-group key lookup failed")
        if old_to_new[0] != -34018 or new_to_old[0] != -34018:
            raise RuntimeError(
                f"cross-group lookup was not denied: old-new={old_to_new} new-old={new_to_old}"
            )
        old_sign = run(
            arguments.old_binary, "sign-key", arguments.old_group, case.old_tag
        ).stdout
        new_sign = run(
            arguments.new_binary, "sign-key", arguments.new_group, case.new_tag
        ).stdout
        if "key.sign=true" not in old_sign or "key.sign=true" not in new_sign:
            raise RuntimeError("own-group Secure Enclave signing failed")
        first_fingerprint = next(
            field.split("=", 1)[1] for field in new_first.split() if field.startswith("fingerprint=")
        )
        second_fingerprint = next(
            field.split("=", 1)[1] for field in new_second.split() if field.startswith("fingerprint=")
        )
        if first_fingerprint != second_fingerprint:
            raise RuntimeError("ensure-key replay changed the public-key fingerprint")
        print("PASS real old/new groups deny cross-use and ensure-key replay preserves fingerprint")
    finally:
        case.cleanup()


def test_crash_case(
    arguments: argparse.Namespace, checkpoint: str, strategy: str, expected_epoch: int
) -> None:
    case = Case(arguments)
    try:
        with tempfile.TemporaryDirectory(prefix="capsule-key-rotation-") as temporary:
            root = Path(temporary)
            state = root / "transition.sqlite"
            marker = root / "marker"
            run(*case.worker_arguments("init", state))
            process = subprocess.Popen(
                case.worker_arguments("flow", state)
                + ["--marker", str(marker), "--crash-at", checkpoint],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            deadline = time.monotonic() + 20
            while not marker.exists() and process.poll() is None and time.monotonic() < deadline:
                time.sleep(0.02)
            if not marker.exists():
                output = process.communicate(timeout=2)[0]
                raise RuntimeError(f"worker did not reach {checkpoint}: {output}")
            recorded_pid, recorded_checkpoint = marker.read_text().strip().split(" ", 1)
            if int(recorded_pid) != process.pid or recorded_checkpoint != checkpoint:
                raise RuntimeError("checkpoint marker did not identify the exact worker")
            os.kill(process.pid, signal.SIGKILL)
            if process.wait(timeout=5) != -signal.SIGKILL:
                raise RuntimeError("worker was not terminated by SIGKILL")
            recovery = run(
                *case.worker_arguments("recover", state), "--strategy", strategy
            ).stdout
            expected = "restored-prior" if expected_epoch == 1 else (
                "stable" if checkpoint == "execution_enabled" else "finished-target"
            )
            if f"platform.recovery={expected}" not in recovery:
                raise RuntimeError(f"unexpected recovery result: {recovery}")
            database = sqlite3.connect(state)
            database.row_factory = sqlite3.Row
            final = database.execute("SELECT * FROM state WHERE singleton=1").fetchone()
            database.close()
            if (
                final is None
                or final["phase"] != "stable"
                or final["execution_enabled"] != 1
                or final["epoch"] != expected_epoch
            ):
                raise RuntimeError(f"recovery did not reach exact stable world: {dict(final)}")
            old_key = lookup(arguments.old_binary, arguments.old_group, case.old_tag)
            new_key = lookup(arguments.new_binary, arguments.new_group, case.new_tag)
            if expected_epoch == 1:
                if old_key[0] != 0 or new_key[0] != -25300:
                    raise RuntimeError("prior repair retained target key or lost prior key")
            elif old_key[0] != -25300 or new_key[0] != 0:
                raise RuntimeError("forward repair did not retire old key and retain target key")
            print(
                f"PASS exact-PID SIGKILL checkpoint={checkpoint} strategy={strategy} "
                f"epoch={expected_epoch}"
            )
    finally:
        case.cleanup()


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--old-binary", required=True)
    parser.add_argument("--new-binary", required=True)
    parser.add_argument("--old-group", required=True)
    parser.add_argument("--new-group", required=True)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    test_cross_use_and_idempotence(arguments)
    for checkpoint, strategy, epoch in CRASH_CASES:
        test_crash_case(arguments, checkpoint, strategy, epoch)
    print(f"PASS provisioned release-scoped key transition matrix cases={len(CRASH_CASES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
