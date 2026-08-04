#!/usr/bin/env python3
"""Short-lived independent SQLite transaction worker for Gate D tests."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from ledger import Binding, Ledger, LedgerError


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--action", required=True)
    parser.add_argument("--binding-json")
    parser.add_argument("--handle")
    parser.add_argument("--redemption")
    parser.add_argument("--direction", choices=("input", "output"))
    parser.add_argument("--peer-role", default="supervisor")
    parser.add_argument("--barrier", type=Path)
    parser.add_argument("--crash-phase")
    parser.add_argument("--sha256")
    parser.add_argument("--size", type=int)
    parser.add_argument("--terminal-state")
    parser.add_argument("--transcript")
    return parser.parse_args()


def binding_from_args(args: argparse.Namespace) -> Binding:
    if args.binding_json is None:
        raise LedgerError("missing-binding")
    value = json.loads(args.binding_json)
    return Binding(**value)


def wait_barrier(path: Path | None) -> None:
    if path is None:
        return
    deadline = time.monotonic() + 15
    while not path.exists():
        if time.monotonic() >= deadline:
            raise LedgerError("barrier-timeout")
        time.sleep(0.005)


def main() -> int:
    args = parse_args()
    ledger = Ledger(args.db, args.store)
    try:
        wait_barrier(args.barrier)
        if args.action in {"redeem-input", "begin-output"}:
            binding = binding_from_args(args)
            if args.handle is None or args.redemption is None:
                raise LedgerError("missing-handle-arguments")
            if args.action == "redeem-input":
                result = ledger.redeem_input(
                    args.handle,
                    binding,
                    args.redemption,
                    peer_role=args.peer_role,
                    crash_phase=args.crash_phase,
                )
            else:
                result = ledger.begin_output(
                    args.handle,
                    binding,
                    args.redemption,
                    peer_role=args.peer_role,
                    crash_phase=args.crash_phase,
                )
        elif args.action == "commit-output":
            binding = binding_from_args(args)
            if None in (
                args.handle,
                args.redemption,
                args.sha256,
                args.size,
                args.terminal_state,
                args.transcript,
            ):
                raise LedgerError("missing-commit-arguments")
            result = {
                "state": ledger.commit_output(
                    args.handle,
                    binding,
                    args.redemption,
                    args.sha256,
                    args.size,
                    args.terminal_state,
                    args.transcript,
                    peer_role=args.peer_role,
                )
            }
        elif args.action == "reconcile":
            result = ledger.reconcile_broker_restart()
        elif args.action == "integrity-check":
            result = {"integrity": ledger.integrity_check()}
        else:
            raise LedgerError("unknown-action")
        print(json.dumps({"ok": True, "result": result}, sort_keys=True))
        return 0
    except (LedgerError, json.JSONDecodeError, TypeError) as error:
        code = error.code if isinstance(error, LedgerError) else "invalid-json"
        print(json.dumps({"ok": False, "error": code}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
