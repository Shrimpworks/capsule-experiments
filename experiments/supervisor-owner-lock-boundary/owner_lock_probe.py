#!/usr/bin/env python3
"""Development-only macOS Supervisor owner-lock semantics probe.

This probe uses only files and processes created under one owned temporary
directory. It is not a Capsule product component or security boundary.
"""

from __future__ import annotations

import errno
import ctypes
import fcntl
import hashlib
import json
import os
import platform
import signal
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable


BUSY_EXIT = 73
REFUSED_EXIT = 74
SCRIPT = str(Path(__file__).resolve())
PYTHON = sys.executable


class Refused(Exception):
    """The selected opener refused a lock object before store access."""


class Busy(Exception):
    """Another open file description owns the advisory lock."""


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_regular(path: Path, data: bytes = b"capsule-owner-lock-v0\n") -> os.stat_result:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o600)
    try:
        os.write(fd, data)
        os.fsync(fd)
    finally:
        os.close(fd)
    return os.stat(path, follow_symlinks=False)


def open_flags() -> int:
    return os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW


def record_open_flags() -> int:
    # A POSIX write lock requires a descriptor opened for writing.
    return os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW


class DarwinFlock(ctypes.Structure):
    _fields_ = [
        ("l_start", ctypes.c_longlong),
        ("l_len", ctypes.c_longlong),
        ("l_pid", ctypes.c_int),
        ("l_type", ctypes.c_short),
        ("l_whence", ctypes.c_short),
    ]


def ofd_lock(fd: int) -> None:
    if not hasattr(fcntl, "F_OFD_SETLK"):
        raise OSError(errno.ENOTSUP, "F_OFD_SETLK unavailable")
    lock = DarwinFlock(0, 0, 0, fcntl.F_WRLCK, os.SEEK_SET)
    fcntl.fcntl(fd, fcntl.F_OFD_SETLK, bytes(lock))


def validate_lock_stat(
    observed: os.stat_result,
    *,
    expected_uid: int,
    expected_device: int,
    expected_inode: int,
) -> None:
    if not stat.S_ISREG(observed.st_mode):
        raise Refused("not-regular")
    if stat.S_IMODE(observed.st_mode) != 0o600:
        raise Refused("mode-not-0600")
    if observed.st_uid != expected_uid:
        raise Refused("owner-mismatch")
    if observed.st_nlink != 1:
        raise Refused("link-count-not-one")
    if observed.st_dev != expected_device:
        raise Refused("device-mismatch")
    if observed.st_ino != expected_inode:
        raise Refused("inode-mismatch")


def selected_acquire(
    directory_fd: int,
    name: str,
    *,
    expected_uid: int,
    expected_device: int,
    expected_inode: int,
) -> int:
    """Open/validate/flock/revalidate the enrolled object without mutation."""

    try:
        fd = os.open(name, open_flags(), dir_fd=directory_fd)
    except OSError as exc:
        raise Refused(f"open:{exc.errno}") from exc
    try:
        if not fcntl.fcntl(fd, fcntl.F_GETFD) & fcntl.FD_CLOEXEC:
            raise Refused("cloexec-not-set")
        validate_lock_stat(
            os.fstat(fd),
            expected_uid=expected_uid,
            expected_device=expected_device,
            expected_inode=expected_inode,
        )
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Busy("already-owned") from exc

        # Recheck the descriptor and the directory entry before any store read.
        validate_lock_stat(
            os.fstat(fd),
            expected_uid=expected_uid,
            expected_device=expected_device,
            expected_inode=expected_inode,
        )
        if not fcntl.fcntl(fd, fcntl.F_GETFD) & fcntl.FD_CLOEXEC:
            raise Refused("cloexec-not-set")
        try:
            name_fd = os.open(name, open_flags(), dir_fd=directory_fd)
        except OSError as exc:
            raise Refused(f"reopen:{exc.errno}") from exc
        try:
            named = os.fstat(name_fd)
            if named.st_dev != expected_device or named.st_ino != expected_inode:
                raise Refused("name-object-changed")
        finally:
            os.close(name_fd)
        return fd
    except Exception:
        os.close(fd)
        raise


def try_lock(method: str, path: Path) -> int:
    try:
        if method == "flock":
            fd = os.open(path, open_flags())
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except Exception:
                os.close(fd)
                raise
        elif method == "record":
            fd = os.open(path, record_open_flags())
            try:
                fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except Exception:
                os.close(fd)
                raise
        elif method == "exlock":
            if not hasattr(os, "O_EXLOCK"):
                return REFUSED_EXIT
            fd = os.open(
                path,
                open_flags() | os.O_EXLOCK | os.O_NONBLOCK,
            )
        elif method == "ofd":
            fd = os.open(path, record_open_flags())
            try:
                ofd_lock(fd)
            except Exception:
                os.close(fd)
                raise
        else:
            raise ValueError(method)
    except OSError as exc:
        if exc.errno in (errno.EAGAIN, errno.EACCES, errno.EWOULDBLOCK):
            return BUSY_EXIT
        return REFUSED_EXIT
    os.close(fd)
    return 0


def run_try(method: str, path: Path) -> int:
    completed = subprocess.run(
        [PYTHON, SCRIPT, "_try", method, str(path)],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return completed.returncode


def start_holder(method: str, path: Path) -> subprocess.Popen[str]:
    process = subprocess.Popen(
        [PYTHON, SCRIPT, "_hold", method, str(path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert process.stdout is not None
    ready = process.stdout.readline().strip()
    if ready != "ready":
        stderr = process.stderr.read() if process.stderr else ""
        process.kill()
        process.wait()
        raise AssertionError(f"holder failed: {ready!r} {stderr!r}")
    return process


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is None:
        process.kill()
    process.wait(timeout=5)


def wait_for_child_ready(read_fd: int) -> str:
    data = os.read(read_fd, 128)
    os.close(read_fd)
    return data.decode("ascii").strip()


def fork_exec_wait(lock_fd: int, *, inheritable: bool) -> tuple[int, str]:
    read_fd, write_fd = os.pipe()
    os.set_inheritable(write_fd, True)
    os.set_inheritable(lock_fd, inheritable)
    child = os.fork()
    if child == 0:
        os.close(read_fd)
        os.execv(
            PYTHON,
            [PYTHON, SCRIPT, "_exec_wait", str(lock_fd), str(write_fd)],
        )
        os._exit(127)
    os.close(write_fd)
    return child, wait_for_child_ready(read_fd)


def assert_child_exit(child: int) -> None:
    os.kill(child, signal.SIGKILL)
    os.waitpid(child, 0)


def test_validation_and_path_binding(root: Path) -> dict[str, Any]:
    directory = root / "validation"
    directory.mkdir(mode=0o700)
    lock_path = directory / "owner.lock"
    expected = make_regular(lock_path)
    directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        fd = selected_acquire(
            directory_fd,
            lock_path.name,
            expected_uid=os.geteuid(),
            expected_device=expected.st_dev,
            expected_inode=expected.st_ino,
        )
        os.close(fd)

        refusals: dict[str, str] = {}

        def expect_refusal(label: str, call: Callable[[], Any]) -> None:
            try:
                call()
            except Refused as exc:
                refusals[label] = str(exc)
                return
            raise AssertionError(f"{label} unexpectedly accepted")

        missing = "missing.lock"
        expect_refusal(
            "missing",
            lambda: selected_acquire(
                directory_fd,
                missing,
                expected_uid=os.geteuid(),
                expected_device=expected.st_dev,
                expected_inode=expected.st_ino,
            ),
        )
        if (directory / missing).exists():
            raise AssertionError("normal startup created a missing lock")

        symlink_path = directory / "symlink.lock"
        symlink_path.symlink_to(lock_path.name)
        expect_refusal(
            "symlink",
            lambda: selected_acquire(
                directory_fd,
                symlink_path.name,
                expected_uid=os.geteuid(),
                expected_device=expected.st_dev,
                expected_inode=expected.st_ino,
            ),
        )

        mode_path = directory / "mode.lock"
        mode_stat = make_regular(mode_path)
        mode_path.chmod(0o640)
        expect_refusal(
            "mode",
            lambda: selected_acquire(
                directory_fd,
                mode_path.name,
                expected_uid=os.geteuid(),
                expected_device=mode_stat.st_dev,
                expected_inode=mode_stat.st_ino,
            ),
        )

        hardlink_path = directory / "hardlink.lock"
        hardlink_peer = directory / "hardlink.peer"
        hardlink_stat = make_regular(hardlink_path)
        os.link(hardlink_path, hardlink_peer)
        expect_refusal(
            "hardlink",
            lambda: selected_acquire(
                directory_fd,
                hardlink_path.name,
                expected_uid=os.geteuid(),
                expected_device=hardlink_stat.st_dev,
                expected_inode=hardlink_stat.st_ino,
            ),
        )

        directory_object = directory / "directory.lock"
        directory_object.mkdir(mode=0o700)
        directory_stat = directory_object.stat()
        expect_refusal(
            "directory",
            lambda: selected_acquire(
                directory_fd,
                directory_object.name,
                expected_uid=os.geteuid(),
                expected_device=directory_stat.st_dev,
                expected_inode=directory_stat.st_ino,
            ),
        )

        expect_refusal(
            "owner-policy",
            lambda: selected_acquire(
                directory_fd,
                lock_path.name,
                expected_uid=os.geteuid() + 1,
                expected_device=expected.st_dev,
                expected_inode=expected.st_ino,
            ),
        )
        expect_refusal(
            "device-policy",
            lambda: selected_acquire(
                directory_fd,
                lock_path.name,
                expected_uid=os.geteuid(),
                expected_device=expected.st_dev + 1,
                expected_inode=expected.st_ino,
            ),
        )
        expect_refusal(
            "inode-policy",
            lambda: selected_acquire(
                directory_fd,
                lock_path.name,
                expected_uid=os.geteuid(),
                expected_device=expected.st_dev,
                expected_inode=expected.st_ino + 1,
            ),
        )
    finally:
        os.close(directory_fd)

    original_root = root / "directory-entry"
    original_root.mkdir(mode=0o700)
    original_lock = original_root / "owner.lock"
    original_stat = make_regular(original_lock, b"original\n")
    retained_directory_fd = os.open(
        original_root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    )
    moved_root = root / "directory-entry-moved"
    os.rename(original_root, moved_root)
    original_root.mkdir(mode=0o700)
    replacement_stat = make_regular(original_root / "owner.lock", b"replacement\n")
    try:
        fd = selected_acquire(
            retained_directory_fd,
            "owner.lock",
            expected_uid=os.geteuid(),
            expected_device=original_stat.st_dev,
            expected_inode=original_stat.st_ino,
        )
        os.close(fd)
    finally:
        os.close(retained_directory_fd)
    if replacement_stat.st_ino == original_stat.st_ino:
        raise AssertionError("replacement unexpectedly reused inode")

    return {
        "accepted": "pre-created mode-0600 regular file with exact uid/dev/inode/nlink",
        "refusals": refusals,
        "retained_directory_fd": "openat remained bound to original directory after path replacement",
        "actual_cross_uid_chown": "not run; no root or second-user authority used",
    }


def test_lock_mechanisms(root: Path) -> dict[str, Any]:
    path = root / "mechanisms.lock"
    make_regular(path)

    record = start_holder("record", path)
    try:
        if run_try("record", path) != BUSY_EXIT:
            raise AssertionError("POSIX record duplicate owner did not refuse")
    finally:
        stop_process(record)
    if run_try("record", path) != 0:
        raise AssertionError("POSIX record lock did not release on death")

    ofd_available = hasattr(fcntl, "F_OFD_SETLK")
    if ofd_available:
        ofd_holder = start_holder("ofd", path)
        try:
            if run_try("ofd", path) != BUSY_EXIT:
                raise AssertionError("OFD duplicate owner did not refuse")
        finally:
            stop_process(ofd_holder)
        if run_try("ofd", path) != 0:
            raise AssertionError("OFD lock did not release on death")

    flock_holder = start_holder("flock", path)
    try:
        if run_try("flock", path) != BUSY_EXIT:
            raise AssertionError("flock duplicate owner did not refuse")
    finally:
        stop_process(flock_holder)
    if run_try("flock", path) != 0:
        raise AssertionError("flock did not release on death")

    exlock_available = hasattr(os, "O_EXLOCK")
    exlock_interoperable = False
    if exlock_available:
        exlock_fd = os.open(path, open_flags() | os.O_EXLOCK | os.O_NONBLOCK)
        try:
            if run_try("flock", path) != BUSY_EXIT:
                raise AssertionError("flock did not observe O_EXLOCK owner")
        finally:
            os.close(exlock_fd)
        flock_fd = os.open(path, open_flags())
        fcntl.flock(flock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            if run_try("exlock", path) != BUSY_EXIT:
                raise AssertionError("O_EXLOCK did not observe flock owner")
        finally:
            os.close(flock_fd)
        exlock_interoperable = True

    compiler = subprocess.run(
        ["clang", "-dM", "-E", "-include", "fcntl.h", "-"],
        input="",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=True,
    )
    header_ofd = any(
        line.startswith("#define F_OFD_SETLK ") for line in compiler.stdout.splitlines()
    )
    python_ofd = hasattr(fcntl, "F_OFD_SETLK")

    ofd_vs_flock = "unavailable"
    ofd_vs_posix = "unavailable"
    if ofd_available:
        fd = os.open(path, record_open_flags())
        ofd_lock(fd)
        try:
            ofd_vs_flock = "contended" if run_try("flock", path) == BUSY_EXIT else "independent"
            ofd_vs_posix = "contended" if run_try("record", path) == BUSY_EXIT else "independent"
        finally:
            os.close(fd)

    return {
        "posix_record": "cross-process contention and process-death release observed",
        "flock": "cross-process contention and process-death release observed",
        "ofd": "cross-process contention and process-death release observed" if ofd_available else "unavailable",
        "o_exlock_available": exlock_available,
        "o_exlock_flock_interoperable": exlock_interoperable,
        "f_ofd_setlk_in_sdk_headers": header_ofd,
        "f_ofd_setlk_in_python": python_ofd,
        "ofd_vs_flock_namespace": ofd_vs_flock,
        "ofd_vs_posix_namespace": ofd_vs_posix,
    }


def test_descriptor_lifetime(root: Path) -> dict[str, Any]:
    path = root / "descriptors.lock"
    make_regular(path)

    fd = os.open(path, open_flags())
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    duplicate = os.dup(fd)
    os.close(fd)
    if run_try("flock", path) != BUSY_EXIT:
        raise AssertionError("flock did not survive close of one duplicate")
    unrelated = os.open(path, open_flags())
    os.close(unrelated)
    if run_try("flock", path) != BUSY_EXIT:
        raise AssertionError("unlocked independent close released flock")
    independent = os.open(path, open_flags())
    try:
        try:
            fcntl.flock(independent, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            raise AssertionError("independent description acquired duplicate flock")
    finally:
        os.close(independent)
    os.close(duplicate)
    if run_try("flock", path) != 0:
        raise AssertionError("flock remained after last duplicate closed")

    record_fd = os.open(path, record_open_flags())
    fcntl.lockf(record_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if run_try("record", path) != BUSY_EXIT:
        raise AssertionError("record lock absent before unrelated close")
    record_unrelated = os.open(path, record_open_flags())
    fcntl.lockf(record_unrelated, fcntl.LOCK_EX | fcntl.LOCK_NB)
    os.close(record_unrelated)
    if run_try("record", path) != 0:
        raise AssertionError("closing same-process descriptor did not release record lock")
    os.close(record_fd)

    ofd_fd = os.open(path, record_open_flags())
    ofd_lock(ofd_fd)
    ofd_duplicate = os.dup(ofd_fd)
    os.close(ofd_fd)
    if run_try("ofd", path) != BUSY_EXIT:
        raise AssertionError("OFD lock did not survive close of one duplicate")
    ofd_unrelated = os.open(path, record_open_flags())
    os.close(ofd_unrelated)
    if run_try("ofd", path) != BUSY_EXIT:
        raise AssertionError("unlocked independent close released OFD lock")
    os.close(ofd_duplicate)
    if run_try("ofd", path) != 0:
        raise AssertionError("OFD lock remained after last duplicate closed")

    return {
        "flock_dup": "lock survived until last duplicate of the locked description closed",
        "flock_independent": "independent open contended; closing an unlocked independent descriptor did not release owner",
        "record_same_process": "a second open joined the process lock; closing it released all record locks on the file",
        "ofd_description": "lock survived dup and unrelated closes, then released on last duplicate close",
    }


def test_fork_exec_and_cloexec(root: Path) -> dict[str, Any]:
    path = root / "inheritance.lock"
    make_regular(path)

    flock_fd = os.open(path, open_flags())
    fcntl.flock(flock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    read_fd, write_fd = os.pipe()
    child = os.fork()
    if child == 0:
        os.close(write_fd)
        os.read(read_fd, 1)
        os._exit(0)
    os.close(read_fd)
    os.close(flock_fd)
    if run_try("flock", path) != BUSY_EXIT:
        raise AssertionError("fork child did not retain flock description")
    os.write(write_fd, b"x")
    os.close(write_fd)
    os.waitpid(child, 0)
    if run_try("flock", path) != 0:
        raise AssertionError("fork-retained flock did not release on child exit")

    cloexec_fd = os.open(path, open_flags())
    fcntl.flock(cloexec_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    child, report = fork_exec_wait(cloexec_fd, inheritable=False)
    os.close(cloexec_fd)
    try:
        if report != "closed" or run_try("flock", path) != 0:
            raise AssertionError("CLOEXEC did not close inherited flock description")
    finally:
        assert_child_exit(child)

    inherited_fd = os.open(path, open_flags())
    fcntl.flock(inherited_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    child, report = fork_exec_wait(inherited_fd, inheritable=True)
    os.close(inherited_fd)
    try:
        if report != "open" or run_try("flock", path) != BUSY_EXIT:
            raise AssertionError("non-CLOEXEC descriptor did not retain flock across exec")
    finally:
        assert_child_exit(child)
    if run_try("flock", path) != 0:
        raise AssertionError("exec-held flock did not release on death")

    ofd_fd = os.open(path, record_open_flags())
    ofd_lock(ofd_fd)
    read_fd, write_fd = os.pipe()
    ofd_child = os.fork()
    if ofd_child == 0:
        os.close(write_fd)
        os.read(read_fd, 1)
        os._exit(0)
    os.close(read_fd)
    os.close(ofd_fd)
    if run_try("ofd", path) != BUSY_EXIT:
        raise AssertionError("fork child did not retain OFD lock")
    os.write(write_fd, b"x")
    os.close(write_fd)
    os.waitpid(ofd_child, 0)

    ofd_cloexec_fd = os.open(path, record_open_flags())
    ofd_lock(ofd_cloexec_fd)
    child, report = fork_exec_wait(ofd_cloexec_fd, inheritable=False)
    os.close(ofd_cloexec_fd)
    try:
        if report != "closed" or run_try("ofd", path) != 0:
            raise AssertionError("CLOEXEC did not release OFD lock")
    finally:
        assert_child_exit(child)

    ofd_exec_fd = os.open(path, record_open_flags())
    ofd_lock(ofd_exec_fd)
    child, report = fork_exec_wait(ofd_exec_fd, inheritable=True)
    os.close(ofd_exec_fd)
    try:
        if report != "open" or run_try("ofd", path) != BUSY_EXIT:
            raise AssertionError("non-CLOEXEC descriptor did not retain OFD lock")
    finally:
        assert_child_exit(child)

    record_fd = os.open(path, record_open_flags())
    fcntl.lockf(record_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    read_fd, write_fd = os.pipe()
    record_child = os.fork()
    if record_child == 0:
        os.close(write_fd)
        os.read(read_fd, 1)
        os._exit(0)
    os.close(read_fd)
    os.close(record_fd)
    if run_try("record", path) != 0:
        raise AssertionError("fork child unexpectedly retained POSIX process lock")
    os.write(write_fd, b"x")
    os.close(write_fd)
    os.waitpid(record_child, 0)

    record_exec = subprocess.Popen(
        [PYTHON, SCRIPT, "_record_exec", str(path), "inherit"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert record_exec.stdout is not None
    if record_exec.stdout.readline().strip() != "open":
        stop_process(record_exec)
        raise AssertionError("record exec holder failed")
    try:
        if run_try("record", path) != BUSY_EXIT:
            raise AssertionError("POSIX record lock did not survive same-process exec")
    finally:
        stop_process(record_exec)

    record_cloexec = subprocess.Popen(
        [PYTHON, SCRIPT, "_record_exec", str(path), "cloexec"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    assert record_cloexec.stdout is not None
    if record_cloexec.stdout.readline().strip() != "closed":
        stop_process(record_cloexec)
        raise AssertionError("record CLOEXEC holder failed")
    try:
        if run_try("record", path) != 0:
            raise AssertionError("record lock survived CLOEXEC close")
    finally:
        stop_process(record_cloexec)

    return {
        "flock_fork": "fork-only child retained the same open file description and lock",
        "flock_exec_cloexec": "CLOEXEC released lock at exec; non-CLOEXEC retained it",
        "record_fork": "POSIX record lock was not inherited across fork",
        "record_exec": "POSIX record lock survived same-process exec unless CLOEXEC closed its descriptor",
        "ofd_fork_exec": "fork retained the description; CLOEXEC released at exec and non-CLOEXEC retained it",
    }


def test_rename_unlink_and_stale_object(root: Path) -> dict[str, Any]:
    directory = root / "replacement"
    directory.mkdir(mode=0o700)
    path = directory / "owner.lock"
    original = make_regular(path, b"original\n")
    directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    owner_fd = selected_acquire(
        directory_fd,
        path.name,
        expected_uid=os.geteuid(),
        expected_device=original.st_dev,
        expected_inode=original.st_ino,
    )
    moved = directory / "owner.lock.moved"
    os.rename(path, moved)
    replacement = make_regular(path, b"replacement\n")
    if run_try("flock", moved) != BUSY_EXIT:
        raise AssertionError("flock did not follow renamed original inode")
    if run_try("flock", path) != 0:
        raise AssertionError("replacement inode could not be independently locked")
    try:
        selected_acquire(
            directory_fd,
            path.name,
            expected_uid=os.geteuid(),
            expected_device=original.st_dev,
            expected_inode=original.st_ino,
        )
    except Refused as exc:
        replacement_refusal = str(exc)
    else:
        raise AssertionError("enrolled inode check accepted replacement")
    os.unlink(moved)
    if moved.exists():
        raise AssertionError("unlink failed")
    os.close(owner_fd)
    os.close(directory_fd)
    if replacement.st_ino == original.st_ino:
        raise AssertionError("replacement reused original inode")
    return {
        "renamed_original": "held flock stayed with the original inode",
        "replacement": "new pathname inode could be locked concurrently",
        "enrolled_identity_refusal": replacement_refusal,
        "unlinked_open_object": "lock remained descriptor-scoped until close, while pathname was absent",
    }


def test_startup_order_and_reopen(root: Path) -> dict[str, Any]:
    directory = root / "startup"
    directory.mkdir(mode=0o700)
    lock_path = directory / "owner.lock"
    lock_stat = make_regular(lock_path)
    store = directory / "state.json"
    store.write_bytes(b'{"fixture":"unchanged"}\n')
    store.chmod(0o600)
    original_digest = sha256_file(store)
    store_marker = directory / "store-read.marker"
    recovery_marker = directory / "recovery.marker"
    adapter_marker = directory / "adapter.marker"

    owner = start_holder("flock", lock_path)
    command = [
        PYTHON,
        SCRIPT,
        "_startup",
        str(directory),
        lock_path.name,
        str(lock_stat.st_dev),
        str(lock_stat.st_ino),
        str(store),
        str(store_marker),
        str(recovery_marker),
        str(adapter_marker),
    ]
    blocked = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if blocked.returncode != BUSY_EXIT:
        stop_process(owner)
        raise AssertionError(f"duplicate startup result {blocked.returncode}: {blocked.stderr}")
    if any(marker.exists() for marker in (store_marker, recovery_marker, adapter_marker)):
        stop_process(owner)
        raise AssertionError("duplicate owner reached work after lock refusal")
    if sha256_file(store) != original_digest:
        stop_process(owner)
        raise AssertionError("duplicate owner mutated store")

    stop_process(owner)
    successor = subprocess.run(command, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if successor.returncode != 0:
        raise AssertionError(f"successor startup failed: {successor.stderr}")
    report = json.loads(successor.stdout)
    expected_events = ["lock-acquired", "store-opened", "recovery-enumerated", "attempts-enabled"]
    if report["events"] != expected_events:
        raise AssertionError(f"startup order {report['events']}")
    if not store_marker.exists() or not recovery_marker.exists() or adapter_marker.exists():
        raise AssertionError("successor marker order is invalid")
    if sha256_file(store) != original_digest:
        raise AssertionError("read-only startup changed store fixture")

    return {
        "duplicate": "busy before store read, recovery enumeration, mutation, or adapter marker",
        "process_death": "SIGKILL closed last owner descriptor; successor acquired",
        "successor_events": report["events"],
        "store_sha256": original_digest,
    }


def environment() -> dict[str, Any]:
    sw_vers = subprocess.run(
        ["sw_vers"], check=True, stdout=subprocess.PIPE, text=True
    ).stdout.strip().splitlines()
    clang = subprocess.run(
        ["clang", "--version"], check=True, stdout=subprocess.PIPE, text=True
    ).stdout.splitlines()[0]
    return {
        "date": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "kernel": platform.release(),
        "sw_vers": sw_vers,
        "python": sys.version.splitlines()[0],
        "clang": clang,
        "effective_uid": os.geteuid(),
        "privilege": "ordinary current user; no sudo/root/helper",
    }


def run_suite() -> dict[str, Any]:
    tests: list[tuple[str, Callable[[Path], dict[str, Any]]]] = [
        ("validation_and_path_binding", test_validation_and_path_binding),
        ("lock_mechanisms", test_lock_mechanisms),
        ("descriptor_lifetime", test_descriptor_lifetime),
        ("fork_exec_and_cloexec", test_fork_exec_and_cloexec),
        ("rename_unlink_and_stale_object", test_rename_unlink_and_stale_object),
        ("startup_order_and_reopen", test_startup_order_and_reopen),
    ]
    results: dict[str, Any] = {}
    with tempfile.TemporaryDirectory(prefix="capsule-owner-lock-") as temporary:
        root = Path(temporary)
        root.chmod(0o700)
        for name, test in tests:
            results[name] = {"status": "pass", "observations": test(root)}
    return {
        "experiment": "capsule-supervisor-owner-lock-boundary",
        "scope": "owned temporary files and child processes only; no product service/backend/guest",
        "environment": environment(),
        "result": "conditional-pass-for-local-semantics",
        "tests": results,
    }


def helper_try(args: list[str]) -> int:
    return try_lock(args[0], Path(args[1]))


def helper_hold(args: list[str]) -> int:
    method, path_text = args
    path = Path(path_text)
    try:
        if method == "flock":
            fd = os.open(path, open_flags())
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif method == "record":
            fd = os.open(path, record_open_flags())
            fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        elif method == "exlock":
            fd = os.open(path, open_flags() | os.O_EXLOCK | os.O_NONBLOCK)
        elif method == "ofd":
            fd = os.open(path, record_open_flags())
            ofd_lock(fd)
        else:
            return REFUSED_EXIT
    except OSError as exc:
        if exc.errno in (errno.EAGAIN, errno.EACCES, errno.EWOULDBLOCK):
            return BUSY_EXIT
        return REFUSED_EXIT
    print("ready", flush=True)
    signal.pause()
    os.close(fd)
    return 0


def helper_exec_wait(args: list[str]) -> int:
    lock_fd = int(args[0])
    ready_fd = int(args[1])
    try:
        os.fstat(lock_fd)
    except OSError:
        report = b"closed\n"
    else:
        report = b"open\n"
    os.write(ready_fd, report)
    os.close(ready_fd)
    signal.pause()
    return 0


def helper_record_exec(args: list[str]) -> int:
    path = Path(args[0])
    mode = args[1]
    fd = os.open(path, record_open_flags())
    fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    os.set_inheritable(fd, mode == "inherit")
    os.execv(PYTHON, [PYTHON, SCRIPT, "_exec_stdout_wait", str(fd)])
    return 127


def helper_exec_stdout_wait(args: list[str]) -> int:
    try:
        os.fstat(int(args[0]))
    except OSError:
        print("closed", flush=True)
    else:
        print("open", flush=True)
    signal.pause()
    return 0


def helper_startup(args: list[str]) -> int:
    directory, name, device, inode, store, store_marker, recovery_marker, _adapter_marker = args
    directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        try:
            owner_fd = selected_acquire(
                directory_fd,
                name,
                expected_uid=os.geteuid(),
                expected_device=int(device),
                expected_inode=int(inode),
            )
        except Busy:
            return BUSY_EXIT
        except Refused:
            return REFUSED_EXIT
        events = ["lock-acquired"]
        Path(store).read_bytes()
        Path(store_marker).touch(mode=0o600)
        events.append("store-opened")
        Path(recovery_marker).touch(mode=0o600)
        events.append("recovery-enumerated")
        events.append("attempts-enabled")
        print(json.dumps({"events": events}, sort_keys=True))
        os.close(owner_fd)
        return 0
    finally:
        os.close(directory_fd)


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1].startswith("_"):
        command = sys.argv[1]
        args = sys.argv[2:]
        helpers: dict[str, Callable[[list[str]], int]] = {
            "_try": helper_try,
            "_hold": helper_hold,
            "_exec_wait": helper_exec_wait,
            "_record_exec": helper_record_exec,
            "_exec_stdout_wait": helper_exec_stdout_wait,
            "_startup": helper_startup,
        }
        return helpers[command](args)
    print(json.dumps(run_suite(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
