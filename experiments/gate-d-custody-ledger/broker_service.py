#!/usr/bin/env python3
"""One-request Broker process for real descriptor-transfer fault injection.

The server-side ``--peer-role`` is deliberately only a harness stand-in for an
identity-derived role; it is never accepted from the request.  Gate B separately
proved signed XPC identity.  This Gate D process focuses on the durable ledger
and descriptor lifetime across independent process failures.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
from pathlib import Path

from ipc import IPCError, receive_packet, send_packet
from ledger import Binding, Ledger, LedgerError, random_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--socket", type=Path, required=True)
    parser.add_argument("--direction", choices=("input", "output"), required=True)
    parser.add_argument("--peer-role", choices=("supervisor", "daemon"), default="supervisor")
    parser.add_argument(
        "--crash",
        choices=(
            "after-update-before-commit",
            "after-commit-before-send",
            "after-output-fsync-before-record",
            "after-output-record",
        ),
    )
    return parser.parse_args()


def binding_from_request(request: dict[str, object]) -> Binding:
    binding = request.get("binding")
    if not isinstance(binding, dict):
        raise LedgerError("invalid-binding")
    required = ("installation_id", "epoch_digest", "registration_id", "attempt_id")
    if set(binding) != set(required) or not all(isinstance(binding[key], str) for key in required):
        raise LedgerError("invalid-binding")
    return Binding(**binding)  # type: ignore[arg-type]


def main() -> int:
    args = parse_args()
    ledger = Ledger(args.db, args.store)
    args.socket.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    try:
        args.socket.unlink()
    except FileNotFoundError:
        pass
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(os.fspath(args.socket))
        os.chmod(args.socket, 0o600)
        listener.listen(1)
        connection, _ = listener.accept()
        with connection:
            try:
                request, descriptors = receive_packet(connection)
                for descriptor in descriptors:
                    os.close(descriptor)
                if descriptors:
                    raise LedgerError("unexpected-request-descriptor")
                if request.get("operation") != f"redeem-{args.direction}":
                    raise LedgerError("unknown-operation")
                handle_id = request.get("handle_id")
                if not isinstance(handle_id, str):
                    raise LedgerError("invalid-request")
                binding = binding_from_request(request)
                redemption_id = random_id()
                crash_phase = (
                    "after-update-before-commit"
                    if args.crash == "after-update-before-commit"
                    else ("after-commit" if args.crash == "after-commit-before-send" else None)
                )
                if args.direction == "input":
                    result = ledger.redeem_input(
                        handle_id,
                        binding,
                        redemption_id,
                        peer_role=args.peer_role,
                        crash_phase=crash_phase,
                    )
                    descriptor = ledger.open_consumed_input(
                        handle_id, binding, redemption_id
                    )
                    try:
                        send_packet(
                            connection,
                            {
                                "ok": True,
                                "redemptionId": redemption_id,
                                "expectedSha256": result["expectedSha256"],
                                "expectedSize": result["expectedSize"],
                            },
                            descriptor,
                        )
                    finally:
                        os.close(descriptor)
                else:
                    ledger.begin_output(
                        handle_id,
                        binding,
                        redemption_id,
                        peer_role=args.peer_role,
                        crash_phase=crash_phase,
                    )
                    read_fd, write_fd = os.pipe()
                    try:
                        send_packet(
                            connection,
                            {"ok": True, "redemptionId": redemption_id},
                            write_fd,
                        )
                    finally:
                        os.close(write_fd)
                    try:
                        ledger.collect_output_fd(
                            read_fd,
                            handle_id,
                            binding,
                            redemption_id,
                            crash_phase=args.crash,
                        )
                    except LedgerError as error:
                        if error.code != "output-limit-exceeded":
                            raise
                    finally:
                        os.close(read_fd)
            except (IPCError, LedgerError, OSError) as error:
                code = error.code if isinstance(error, LedgerError) else str(error)
                try:
                    send_packet(connection, {"ok": False, "error": code})
                except (BrokenPipeError, IPCError, OSError):
                    pass
                return 2
        return 0
    finally:
        listener.close()
        try:
            args.socket.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    sys.exit(main())
