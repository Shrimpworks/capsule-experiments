#!/usr/bin/env python3
"""Development-only P0-1B/C descriptor and custody corpus for owned local files."""

from __future__ import annotations

import argparse
import errno
import fcntl
import hashlib
import json
import mmap
import os
import pathlib
import secrets
import subprocess
import sys
import tempfile
from typing import Any


def digest_fd(fd: int) -> str:
    size = os.fstat(fd).st_size
    digest = hashlib.sha256()
    offset = 0
    while offset < size:
        chunk = os.pread(fd, min(1024 * 1024, size - offset), offset)
        if not chunk:
            raise RuntimeError("unexpected EOF")
        digest.update(chunk)
        offset += len(chunk)
    return digest.hexdigest()


def child_fd(fd: int, expected_dev: int | None, expected_ino: int | None) -> int:
    try:
        stat = os.fstat(fd)
    except OSError:
        return 1
    if expected_dev is not None and (stat.st_dev, stat.st_ino) != (
        expected_dev,
        expected_ino,
    ):
        return 2
    return 0


def exec_child(fd: int, inherit: bool, expected: os.stat_result | None = None) -> int:
    flags = fcntl.fcntl(fd, fcntl.F_GETFD)
    if inherit:
        fcntl.fcntl(fd, fcntl.F_SETFD, flags & ~fcntl.FD_CLOEXEC)
    else:
        fcntl.fcntl(fd, fcntl.F_SETFD, flags | fcntl.FD_CLOEXEC)
    pid = os.fork()
    if pid == 0:
        arguments = [sys.executable, __file__, "--child-fd", str(fd)]
        if expected is not None:
            arguments.extend(
                ["--expected-dev", str(expected.st_dev), "--expected-ino", str(expected.st_ino)]
            )
        os.execv(sys.executable, arguments)
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


def finalized_object(directory: pathlib.Path, payload: bytes) -> tuple[int, pathlib.Path, os.stat_result]:
    path = directory / f"root-{secrets.token_hex(16)}"
    writer = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(writer, payload)
        os.fsync(writer)
        os.chmod(path, 0o400)
        reader = os.open(path, os.O_RDONLY)
        before = os.fstat(reader)
        assert fcntl.fcntl(reader, fcntl.F_GETFL) & os.O_ACCMODE == os.O_RDONLY
        assert before.st_nlink == 1 and before.st_size == len(payload)
    finally:
        os.close(writer)
    os.unlink(path)
    after = os.fstat(reader)
    assert after.st_nlink == 0
    assert (before.st_dev, before.st_ino, before.st_size) == (
        after.st_dev,
        after.st_ino,
        after.st_size,
    )
    return reader, path, after


def run_corpus() -> dict[str, Any]:
    results: dict[str, Any] = {}
    payload = (b"capsule-p0-1\0" * 4096) + bytes(range(256))
    expected_digest = hashlib.sha256(payload).hexdigest()

    with tempfile.TemporaryDirectory(prefix="capsule-p0-1-") as temporary:
        root = pathlib.Path(temporary)

        # O_EXCL refuses a pre-created symlink at the exact candidate name.
        target = root / "target"
        target.write_bytes(b"attacker")
        candidate = root / "candidate"
        candidate.symlink_to(target)
        try:
            os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            raise AssertionError("O_EXCL followed or replaced pre-created symlink")
        except OSError as error:
            assert error.errno == errno.EEXIST
            results["precreation_symlink"] = "rejected-EEXIST"

        reader, path, final_stat = finalized_object(root, payload)
        try:
            assert digest_fd(reader) == expected_digest
            results["finalized_sequence"] = {
                "access": fcntl.fcntl(reader, fcntl.F_GETFL) & os.O_ACCMODE,
                "mode": oct(final_stat.st_mode & 0o777),
                "nlink": final_stat.st_nlink,
                "length": final_stat.st_size,
                "digest": expected_digest,
            }

            # Replacing the removed name cannot substitute the retained object.
            path.write_bytes(b"replacement")
            assert digest_fd(reader) == expected_digest
            replacement = path.stat()
            assert (replacement.st_dev, replacement.st_ino) != (
                final_stat.st_dev,
                final_stat.st_ino,
            )
            results["post_unlink_path_replacement"] = "retained-identity-stable"

            # /dev/fd opens duplicate the same open-file description on this host.
            duplicate = os.open(f"/dev/fd/{reader}", os.O_RDONLY)
            try:
                os.lseek(reader, 7, os.SEEK_SET)
                assert os.lseek(duplicate, 0, os.SEEK_CUR) == 7
                before = os.lseek(reader, 0, os.SEEK_CUR)
                assert os.pread(duplicate, 5, 11) == payload[11:16]
                assert os.lseek(reader, 0, os.SEEK_CUR) == before
                duplicate_flags = fcntl.fcntl(duplicate, fcntl.F_GETFL)
                fcntl.fcntl(duplicate, fcntl.F_SETFL, duplicate_flags | os.O_NONBLOCK)
                assert fcntl.fcntl(reader, fcntl.F_GETFL) & os.O_NONBLOCK
                results["shared_open_description"] = {
                    "offsetShared": True,
                    "statusFlagsShared": True,
                    "preadOffsetStable": True,
                }
            finally:
                os.close(duplicate)

            # Fork preserves the descriptor even when CLOEXEC is set; exec does not.
            fcntl.fcntl(reader, fcntl.F_SETFD, fcntl.FD_CLOEXEC)
            fork_pid = os.fork()
            if fork_pid == 0:
                os._exit(0 if os.fstat(reader).st_ino == final_stat.st_ino else 3)
            _, fork_status = os.waitpid(fork_pid, 0)
            assert os.waitstatus_to_exitcode(fork_status) == 0
            cloexec_status = exec_child(reader, False, final_stat)
            inherited_status = exec_child(reader, True, final_stat)
            assert cloexec_status == 1 and inherited_status == 0
            results["fork_exec_cloexec"] = {
                "forkPreserved": True,
                "execWithCloexec": "closed",
                "execAfterClearCloexec": "preserved",
            }

            # A wrong number fails; a reused number fails expected-object validation.
            wrong_status = subprocess.run(
                [sys.executable, __file__, "--child-fd", "198"], check=False
            ).returncode
            decoy = os.open(path, os.O_RDONLY)
            try:
                reused_status = subprocess.run(
                    [
                        sys.executable,
                        __file__,
                        "--child-fd",
                        str(decoy),
                        "--expected-dev",
                        str(final_stat.st_dev),
                        "--expected-ino",
                        str(final_stat.st_ino),
                    ],
                    pass_fds=(decoy,),
                    check=False,
                ).returncode
            finally:
                os.close(decoy)
            assert wrong_status == 1 and reused_status == 2
            results["wrong_and_reused_fd"] = {
                "wrong": "closed",
                "reused": "identity-mismatch",
            }
        finally:
            os.close(reader)

        # Retaining any writable alias after unlink defeats frozen custody.
        alias_path = root / "writable-alias"
        creator = os.open(alias_path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(creator, payload)
        writer_alias = os.dup(creator)
        os.chmod(alias_path, 0o400)
        alias_reader = os.open(alias_path, os.O_RDONLY)
        os.unlink(alias_path)
        os.close(creator)
        before_alias = digest_fd(alias_reader)
        os.pwrite(writer_alias, b"X", 0)
        after_alias = digest_fd(alias_reader)
        os.close(writer_alias)
        os.close(alias_reader)
        assert before_alias != after_alias
        results["retained_writable_alias"] = "mutation-observed-as-expected-negative"

        # A writable mapping remains writable after its creating descriptor closes and unlink.
        mapping_path = root / "writable-mapping"
        mapping_writer = os.open(mapping_path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(mapping_writer, payload)
        mapping = mmap.mmap(mapping_writer, len(payload), access=mmap.ACCESS_WRITE)
        os.chmod(mapping_path, 0o400)
        mapping_reader = os.open(mapping_path, os.O_RDONLY)
        os.unlink(mapping_path)
        os.close(mapping_writer)
        before_mapping = digest_fd(mapping_reader)
        mapping[1:2] = b"Y"
        mapping.flush()
        after_mapping = digest_fd(mapping_reader)
        mapping.close()
        os.close(mapping_reader)
        assert before_mapping != after_mapping
        results["retained_writable_mapping"] = "mutation-observed-as-expected-negative"

        # A retained writable original does not mutate the independently copied object.
        source_path = root / "source"
        source_path.write_bytes(payload)
        source_writer = os.open(source_path, os.O_RDWR)
        snapshot, _, _ = finalized_object(root, source_path.read_bytes())
        os.pwrite(source_writer, b"Z", 2)
        os.close(source_writer)
        assert digest_fd(snapshot) == expected_digest
        os.close(snapshot)
        results["original_source_alias"] = "independent-snapshot-stable"

        # Without platform-protected storage, a same-UID peer that learns the name wins the window.
        exposed = root / "exposed-window"
        exposed_writer = os.open(exposed, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(exposed_writer, payload)
        attacker_writer = os.open(exposed, os.O_RDWR)
        attacker_link = root / "attacker-link"
        os.link(exposed, attacker_link)
        os.close(exposed_writer)
        os.pwrite(attacker_writer, b"A", 3)
        os.close(attacker_writer)
        assert attacker_link.stat().st_nlink == 2
        results["unprotected_same_uid_window"] = {
            "writableOpenAcquired": True,
            "hardLinkAcquired": True,
            "meaning": "platform-protected construction storage remains mandatory",
        }

        # An unlinked object survives Supervisor loss while the runner retains the descriptor.
        recovery_reader, recovery_path, recovery_stat = finalized_object(root, payload)
        read_pipe, write_pipe = os.pipe()
        child = os.fork()
        if child == 0:
            os.close(read_pipe)
            os.write(write_pipe, digest_fd(recovery_reader).encode("ascii"))
            os.close(write_pipe)
            os.close(recovery_reader)
            os._exit(0)
        os.close(write_pipe)
        os.close(recovery_reader)
        child_digest = os.read(read_pipe, 64).decode("ascii")
        os.close(read_pipe)
        _, recovery_status = os.waitpid(child, 0)
        assert os.waitstatus_to_exitcode(recovery_status) == 0
        assert child_digest == expected_digest and not recovery_path.exists()
        results["supervisor_crash_runner_retention"] = {
            "runnerDigest": child_digest,
            "pathReacquisition": "impossible",
            "device": recovery_stat.st_dev,
            "inode": recovery_stat.st_ino,
        }

    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--child-fd", type=int)
    parser.add_argument("--expected-dev", type=int)
    parser.add_argument("--expected-ino", type=int)
    parser.add_argument("--output", type=pathlib.Path)
    arguments = parser.parse_args()
    if arguments.child_fd is not None:
        return child_fd(arguments.child_fd, arguments.expected_dev, arguments.expected_ino)

    results = run_corpus()
    rendered = json.dumps(results, indent=2, sort_keys=True) + "\n"
    if arguments.output is not None:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
