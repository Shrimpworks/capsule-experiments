#!/usr/bin/env python3
"""Independent Supervisor-side descriptor client for the Gate D spike."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import socket
import sys
from pathlib import Path

from ipc import IPCError, receive_packet, send_packet


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--socket", type=Path, required=True)
    parser.add_argument("--direction", choices=("input", "output"), required=True)
    parser.add_argument("--handle", required=True)
    parser.add_argument("--binding-json", required=True)
    parser.add_argument("--payload-hex", default="")
    parser.add_argument("--crash-after-receive", action="store_true")
    parser.add_argument("--crash-after-write", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    binding = json.loads(args.binding_json)
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        connection.connect(os.fspath(args.socket))
        send_packet(
            connection,
            {
                "operation": f"redeem-{args.direction}",
                "handle_id": args.handle,
                "binding": binding,
            },
        )
        response, descriptors = receive_packet(connection)
        if not response.get("ok"):
            print(json.dumps(response, sort_keys=True))
            return 2
        if len(descriptors) != 1:
            raise IPCError("expected-one-descriptor")
        descriptor = descriptors[0]
        if args.crash_after_receive:
            os._exit(93)
        access_mode = fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE
        if args.direction == "input":
            if access_mode != os.O_RDONLY:
                raise IPCError("input-descriptor-not-read-only")
            digest = hashlib.sha256()
            size = 0
            while True:
                chunk = os.read(descriptor, 65_536)
                if not chunk:
                    break
                size += len(chunk)
                digest.update(chunk)
            os.close(descriptor)
            print(
                json.dumps(
                    {
                        "ok": True,
                        "access": "read-only",
                        "sha256": digest.hexdigest(),
                        "byteLength": size,
                        "redemptionId": response["redemptionId"],
                    },
                    sort_keys=True,
                )
            )
        else:
            if access_mode != os.O_WRONLY:
                raise IPCError("output-descriptor-not-write-only")
            payload = bytes.fromhex(args.payload_hex)
            view = memoryview(payload)
            while view:
                try:
                    written = os.write(descriptor, view)
                except BrokenPipeError:
                    break
                view = view[written:]
            if args.crash_after_write:
                os._exit(94)
            os.close(descriptor)
            print(
                json.dumps(
                    {
                        "ok": True,
                        "access": "write-only",
                        "submittedBytes": len(payload),
                        "redemptionId": response["redemptionId"],
                    },
                    sort_keys=True,
                )
            )
        return 0
    except (IPCError, OSError, ValueError, json.JSONDecodeError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, sort_keys=True))
        return 2
    finally:
        connection.close()


if __name__ == "__main__":
    sys.exit(main())
