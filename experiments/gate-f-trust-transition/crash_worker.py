#!/usr/bin/env python3
"""Child process for the Gate F real-SIGKILL durability harness."""

from __future__ import annotations

import argparse
import json
import os
import signal
from pathlib import Path

from model import GateFModel, ROLES


def publish_checkpoint(path: Path, name: str) -> None:
    temporary = path.with_suffix(".tmp")
    descriptor = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        payload = json.dumps({"checkpoint": name, "pid": os.getpid()}).encode()
        os.write(descriptor, payload)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def run_flow(model: GateFModel, flow: str) -> None:
    if flow == "grant":
        model.issue_grant("grant-1")
        model.consume_grant("grant-1", "attempt-1")
        return
    if flow == "backend":
        model.issue_grant("grant-1")
        model.consume_grant("grant-1", "attempt-1")
        model.launch_backend("attempt-1")
        return
    if flow == "release":
        model.issue_grant("grant-1")
        model.consume_grant("grant-1", "attempt-1")
        model.launch_backend("attempt-1")
        model.complete_attempt("attempt-1")
        model.release_result("attempt-1")
        return
    if flow == "update":
        transition = "update-1"
        model.begin_update(transition, model.target_v2())
        model.prepare_update(transition)
        model.install_target_trust_state(transition)
        for role in ROLES:
            model.swap_component(transition, role)
        model.enter_pending_verification(transition)
        model.stage_epoch(transition)
        model.commit_epoch(transition)
        for role in ROLES:
            model.accept_epoch(transition, role)
        model.enable_stable(transition)
        return
    raise ValueError(f"unknown flow: {flow}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", required=True, type=Path)
    parser.add_argument("--marker", required=True, type=Path)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--flow", required=True, choices=("grant", "backend", "release", "update"))
    arguments = parser.parse_args()

    model = GateFModel(arguments.state)
    model.initialize()

    def checkpoint(name: str) -> None:
        if name != arguments.checkpoint:
            return
        publish_checkpoint(arguments.marker, name)
        while True:
            signal.pause()

    model.checkpoint = checkpoint  # type: ignore[method-assign]
    run_flow(model, arguments.flow)
    model.close()
    raise RuntimeError(f"requested checkpoint was not reached: {arguments.checkpoint}")


if __name__ == "__main__":
    raise SystemExit(main())
