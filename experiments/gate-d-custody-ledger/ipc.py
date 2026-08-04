"""Small Unix-domain descriptor transport used only by the Gate D spike."""

from __future__ import annotations

import array
import json
import socket
import struct
from typing import Any


MAX_MESSAGE = 16_384


class IPCError(Exception):
    pass


def send_packet(connection: socket.socket, value: dict[str, Any], fd: int | None = None) -> None:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(payload) > MAX_MESSAGE:
        raise IPCError("message-too-large")
    packet = struct.pack("!I", len(payload)) + payload
    ancillary: list[tuple[int, int, bytes]] = []
    if fd is not None:
        descriptors = array.array("i", [fd])
        ancillary.append((socket.SOL_SOCKET, socket.SCM_RIGHTS, descriptors.tobytes()))
    sent = connection.sendmsg([packet], ancillary)
    if sent != len(packet):
        raise IPCError("partial-packet-send")


def receive_packet(connection: socket.socket) -> tuple[dict[str, Any], list[int]]:
    descriptor_array = array.array("i")
    first, ancillary, flags, _ = connection.recvmsg(
        MAX_MESSAGE + 4,
        socket.CMSG_SPACE(descriptor_array.itemsize * 4),
    )
    if flags & (socket.MSG_TRUNC | socket.MSG_CTRUNC):
        raise IPCError("truncated-packet")
    if len(first) < 4:
        raise IPCError("missing-packet-header")
    expected = struct.unpack("!I", first[:4])[0]
    if expected > MAX_MESSAGE:
        raise IPCError("message-too-large")
    payload = bytearray(first[4:])
    while len(payload) < expected:
        chunk = connection.recv(expected - len(payload))
        if not chunk:
            raise IPCError("partial-packet")
        payload.extend(chunk)
    if len(payload) != expected:
        raise IPCError("trailing-packet-data")
    descriptors: list[int] = []
    for level, kind, data in ancillary:
        if level == socket.SOL_SOCKET and kind == socket.SCM_RIGHTS:
            usable = len(data) - (len(data) % descriptor_array.itemsize)
            descriptor_array.frombytes(data[:usable])
            descriptors.extend(descriptor_array.tolist())
            descriptor_array = array.array("i")
    try:
        value = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise IPCError("invalid-json") from error
    if not isinstance(value, dict):
        raise IPCError("message-not-object")
    return value, descriptors
