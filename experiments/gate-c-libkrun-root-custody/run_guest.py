#!/usr/bin/env python3
"""Construct, finalize, inherit, attach, and verify one owned local root image."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import pathlib
import secrets
import subprocess
import sys
from typing import Any


def manifest(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        key, value = line.split("=", 1)
        values[key] = value
    return values


def digest_fd(fd: int, length: int) -> str:
    digest = hashlib.sha256()
    offset = 0
    while offset < length:
        block = os.pread(fd, min(1024 * 1024, length - offset), offset)
        if not block:
            raise RuntimeError("unexpected EOF while hashing finalized descriptor")
        digest.update(block)
        offset += len(block)
    return digest.hexdigest()


def copy_exact(source: pathlib.Path, writer: int) -> int:
    source_fd = os.open(source, os.O_RDONLY)
    length = 0
    try:
        while True:
            block = os.read(source_fd, 1024 * 1024)
            if not block:
                break
            view = memoryview(block)
            while view:
                count = os.write(writer, view)
                view = view[count:]
            length += len(block)
    finally:
        os.close(source_fd)
    return length


def run_negative_cases(
    runner: pathlib.Path,
    expected: os.stat_result,
    length: int,
    digest: str,
    guest_executable: str,
    run_dir: pathlib.Path,
) -> dict[str, Any]:
    wrong = subprocess.run(
        [
            str(runner),
            "198",
            str(expected.st_dev),
            str(expected.st_ino),
            str(length),
            digest,
            guest_executable,
        ],
        text=True,
        capture_output=True,
        check=False,
        timeout=15,
    )
    (run_dir / "wrong-fd.stderr").write_text(wrong.stderr, encoding="utf-8")

    decoy_path = run_dir / "decoy"
    decoy_path.write_bytes(b"decoy" * 1024)
    decoy_fd = os.open(decoy_path, os.O_RDONLY)
    try:
        reused = subprocess.run(
            [
                str(runner),
                str(decoy_fd),
                str(expected.st_dev),
                str(expected.st_ino),
                str(length),
                digest,
                guest_executable,
            ],
            pass_fds=(decoy_fd,),
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    finally:
        os.close(decoy_fd)
    (run_dir / "reused-fd.stderr").write_text(reused.stderr, encoding="utf-8")
    if wrong.returncode == -6 and reused.returncode == -6:
        return {
            "wrongFdExit": wrong.returncode,
            "reusedFdExit": reused.returncode,
            "runnerInitialization": "SIGABRT-before-main",
        }
    if wrong.returncode == 0 or reused.returncode != 77:
        raise RuntimeError(
            f"descriptor negatives did not fail closed: wrong={wrong.returncode} reused={reused.returncode}"
        )
    return {
        "wrongFdExit": wrong.returncode,
        "reusedFdExit": reused.returncode,
        "reusedFdRejectedBeforeKrun": "RUNNER_DESCRIPTOR_REJECT" in reused.stderr,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sandboxed", action="store_true")
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument("--root", type=pathlib.Path)
    parser.add_argument("--manifest", type=pathlib.Path)
    arguments = parser.parse_args()

    experiment = pathlib.Path(__file__).resolve().parent
    build = experiment / ".build"
    source = arguments.root or build / "root-custody.ext4"
    values = manifest(arguments.manifest or build / "root.manifest")
    expected_digest = values["rootSha256"]
    expected_length = int(values["rootLength"])
    guest_executable = values["guestExecutable"]
    runner = (
        build
        / "CapsuleRootCustodySpike.app"
        / "Contents"
        / "MacOS"
        / "capsule-root-custody-runner"
        if arguments.sandboxed
        else build / "capsule-root-custody-runner"
    )
    for required in (source, runner):
        if not required.exists():
            raise SystemExit(f"missing build input: {required}")

    run_id = f"{'sandboxed' if arguments.sandboxed else 'unsandboxed'}-{secrets.token_hex(8)}"
    run_dir = experiment / ".runs" / run_id
    custody_dir = run_dir / "custody"
    custody_dir.mkdir(parents=True)
    os.chmod(custody_dir, 0o700)
    path = custody_dir / f"runtime-root-{secrets.token_hex(16)}"
    writer = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    reader = -1
    try:
        copied_length = copy_exact(source, writer)
        os.fsync(writer)
        os.chmod(path, 0o400)
        reader = os.open(path, os.O_RDONLY)
        before = os.fstat(reader)
        before_flags = fcntl.fcntl(reader, fcntl.F_GETFL)
        if (
            before_flags & os.O_ACCMODE != os.O_RDONLY
            or before.st_nlink != 1
            or before.st_size != expected_length
            or before.st_mode & 0o777 != 0o400
            or copied_length != expected_length
        ):
            raise RuntimeError("pre-unlink descriptor invariants failed")
    finally:
        os.close(writer)

    os.unlink(path)
    after = os.fstat(reader)
    after_flags = fcntl.fcntl(reader, fcntl.F_GETFL)
    if (
        after_flags & os.O_ACCMODE != os.O_RDONLY
        or after.st_nlink != 0
        or after.st_size != expected_length
        or after.st_mode & 0o777 != 0o400
        or (after.st_dev, after.st_ino, after.st_size)
        != (before.st_dev, before.st_ino, before.st_size)
    ):
        raise RuntimeError("post-unlink descriptor invariants failed")
    final_digest = digest_fd(reader, expected_length)
    if final_digest != expected_digest:
        raise RuntimeError(
            f"finalized digest mismatch: expected={expected_digest} actual={final_digest}"
        )

    record: dict[str, Any] = {
        "mode": "sandboxed" if arguments.sandboxed else "unsandboxed",
        "sourceManifestDigest": expected_digest,
        "finalizedDescriptorDigest": final_digest,
        "length": expected_length,
        "device": after.st_dev,
        "inode": after.st_ino,
        "modeBits": oct(after.st_mode & 0o777),
        "linkCount": after.st_nlink,
        "descriptorTransfer": "direct-fork-exec-inheritance",
        "attachmentApi": "krun_add_read_only_raw_root_fd",
        "attachmentRole": "runtime-root:vda:raw:read-only",
        "pathExistsAfterFinalization": path.exists(),
    }

    record["descriptorNegatives"] = run_negative_cases(
        runner, after, expected_length, final_digest, guest_executable, run_dir
    )
    command = [
        str(runner),
        str(reader),
        str(after.st_dev),
        str(after.st_ino),
        str(expected_length),
        final_digest,
        guest_executable,
    ]
    child_environment = os.environ.copy()
    if not arguments.sandboxed:
        child_environment["DYLD_INSERT_LIBRARIES"] = str(
            build / "libcapsule-open-trace.dylib"
        )
    try:
        completed = subprocess.run(
            command,
            pass_fds=(reader,),
            env=child_environment,
            text=True,
            capture_output=True,
            check=False,
            timeout=arguments.timeout,
        )
    except subprocess.TimeoutExpired as error:
        (run_dir / "runner.stdout").write_text(error.stdout or "", encoding="utf-8")
        (run_dir / "runner.stderr").write_text(error.stderr or "", encoding="utf-8")
        record["runner"] = {"outcome": "timeout", "seconds": arguments.timeout}
        (run_dir / "record.json").write_text(
            json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        raise SystemExit(124)

    (run_dir / "runner.stdout").write_text(completed.stdout, encoding="utf-8")
    (run_dir / "runner.stderr").write_text(completed.stderr, encoding="utf-8")
    post_digest = digest_fd(reader, expected_length)
    os.close(reader)
    reader = -1

    opens = [
        line
        for line in completed.stderr.splitlines()
        if line.startswith("LIBKRUN_ROOT_OPEN ")
    ]
    fd_native_accepts = [
        line
        for line in completed.stderr.splitlines()
        if line.startswith("LIBKRUN_FD_NATIVE_ROOT_ACCEPT ")
    ]
    guest_lines = [
        line
        for line in completed.stdout.splitlines()
        if line.startswith("GUEST_ROOT_SHA256 ")
    ]
    guest_digest = None
    guest_length = None
    if len(guest_lines) == 1:
        fields = dict(part.split("=", 1) for part in guest_lines[0].split()[1:])
        guest_digest = fields["digest"]
        guest_length = int(fields["length"])
    record["runner"] = {
        "exit": completed.returncode,
        "libkrunRootPathOpenCount": len(opens),
        "fdNativeAccepted": len(fd_native_accepts) == 1,
        "callerDescriptorClosedAfterApi": len(fd_native_accepts) == 1
        and "callerDescriptorClosed=true" in fd_native_accepts[0],
        "guestDigest": guest_digest,
        "guestLength": guest_length,
        "postStopDescriptorDigest": post_digest,
    }
    record["conjunctivePass"] = (
        completed.returncode == 0
        and len(opens) == 0
        and record["runner"]["fdNativeAccepted"]
        and record["runner"]["callerDescriptorClosedAfterApi"]
        and guest_digest == expected_digest
        and guest_length == expected_length
        and post_digest == expected_digest
    )
    (run_dir / "record.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps(record, indent=2, sort_keys=True))
    print(f"rawEvidence={run_dir}")
    if arguments.sandboxed and completed.returncode == -6:
        record["environmentalLimitation"] = (
            "ad-hoc App Sandbox bundle aborted in secinit before main; this host has no valid "
            "code-signing identity, so the installed signed App Sandbox case remains untested"
        )
        (run_dir / "record.json").write_text(
            json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return 78
    return 0 if record["conjunctivePass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
