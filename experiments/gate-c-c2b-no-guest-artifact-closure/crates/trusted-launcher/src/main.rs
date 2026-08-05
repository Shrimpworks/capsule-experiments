use std::env;
use std::fs::File;
use std::io::{self, Read, Write};
use std::os::fd::{FromRawFd, RawFd};
use std::process::{Command, Stdio};
use std::thread;

const SOURCE_FRAME: &[u8] = include_bytes!("../../../fixtures/source.frame");
const INPUT_FRAME: &[u8] = include_bytes!("../../../fixtures/input.frame");
const COMPLETION_FRAME: &[u8] = include_bytes!("../../../fixtures/completion.frame");
const COMPLETION_JSON: &[u8] = b"{\"doubled\":42,\"echo\":\"capsule-c2a\"}";
const RUNTIME_PATH: &str = "/usr/local/bin/capsule-deno-core-c2b-fixed-fixture";
const STDOUT_RETAIN_MAX: usize = 262_369;
const STDERR_RETAIN_MAX: usize = 4_194;
const F_GETFD: i32 = 1;
const F_SETFD: i32 = 2;
const F_GETFL: i32 = 3;
const FD_CLOEXEC: i32 = 1;
const O_ACCMODE: i32 = 3;
const O_RDONLY: i32 = 0;
const O_WRONLY: i32 = 1;

extern "C" {
    fn fcntl(fd: i32, command: i32, ...) -> i32;
}

fn fail(message: &str) -> ! {
    eprintln!("capsule-launcher: {message}");
    std::process::exit(78);
}

fn fcntl_value(fd: RawFd, command: i32) -> i32 {
    // SAFETY: fcntl is called with integer commands that return integer values.
    unsafe { fcntl(fd, command) }
}

fn require_descriptor_manifest() {
    let expected = [O_RDONLY, O_WRONLY, O_WRONLY, O_RDONLY, O_RDONLY, O_WRONLY];
    for (fd, access) in expected.into_iter().enumerate() {
        if fcntl_value(fd as RawFd, F_GETFD) < 0 {
            fail("missing descriptor in exact 0-through-5 manifest");
        }
        if fcntl_value(fd as RawFd, F_GETFL) & O_ACCMODE != access {
            fail("wrong descriptor access mode");
        }
    }
    for fd in 6..1024 {
        if fcntl_value(fd, F_GETFD) >= 0 {
            fail("unexpected descriptor 6 or greater");
        }
    }
}

fn set_cloexec(fd: RawFd) {
    // SAFETY: fd is an already validated open descriptor and F_SETFD accepts an integer flag.
    if unsafe { fcntl(fd, F_SETFD, FD_CLOEXEC) } != 0 {
        fail("cannot seal completion descriptor against child inheritance");
    }
}

fn read_exact_frame(fd: RawFd, expected: &[u8], role: &str) {
    // SAFETY: ownership of each dedicated launcher input descriptor is transferred once here.
    let mut file = unsafe { File::from_raw_fd(fd) };
    let mut received = Vec::with_capacity(expected.len() + 1);
    if Read::by_ref(&mut file)
        .take((expected.len() + 1) as u64)
        .read_to_end(&mut received)
        .is_err()
    {
        fail("failed reading dedicated input frame");
    }
    if received != expected {
        fail(match role {
            "source" => "source frame is not exact fixed C2A known answer",
            _ => "input frame is not exact fixed C2A known answer",
        });
    }
}

fn drain(mut reader: impl Read, retain_max: usize) -> io::Result<(Vec<u8>, u64)> {
    let mut retained = Vec::with_capacity(retain_max.min(32 * 1024));
    let mut total = 0_u64;
    let mut buffer = [0_u8; 32 * 1024];
    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        total = total.saturating_add(count as u64);
        let remaining = retain_max.saturating_sub(retained.len());
        retained.extend_from_slice(&buffer[..count.min(remaining)]);
    }
    Ok((retained, total))
}

fn main() {
    if env::args_os().count() != 1 {
        fail("caller arguments are forbidden");
    }
    if env::vars_os().next().is_some() {
        fail("caller environment is forbidden");
    }
    require_descriptor_manifest();
    set_cloexec(5);
    read_exact_frame(3, SOURCE_FRAME, "source");
    read_exact_frame(4, INPUT_FRAME, "input");

    let mut child = Command::new(RUNTIME_PATH)
        .env_clear()
        .current_dir("/")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap_or_else(|_| fail("fixed runtime start failed"));
    let stdout = child
        .stdout
        .take()
        .unwrap_or_else(|| fail("runtime stdout pipe missing"));
    let stderr = child
        .stderr
        .take()
        .unwrap_or_else(|| fail("runtime stderr pipe missing"));
    let stdout_thread = thread::spawn(move || drain(stdout, STDOUT_RETAIN_MAX));
    let stderr_thread = thread::spawn(move || drain(stderr, STDERR_RETAIN_MAX));
    let status = child
        .wait()
        .unwrap_or_else(|_| fail("fixed runtime wait failed"));
    let (stdout_bytes, stdout_total) = stdout_thread
        .join()
        .unwrap_or_else(|_| fail("runtime stdout drain panicked"))
        .unwrap_or_else(|_| fail("runtime stdout drain failed"));
    let (stderr_bytes, stderr_total) = stderr_thread
        .join()
        .unwrap_or_else(|_| fail("runtime stderr drain panicked"))
        .unwrap_or_else(|_| fail("runtime stderr drain failed"));

    if !status.success() || stdout_total > STDOUT_RETAIN_MAX as u64 {
        fail("fixed runtime did not terminate inside output contract");
    }
    if stderr_total > STDERR_RETAIN_MAX as u64
        || !stderr_bytes
            .windows(b"CAPSULE_HOST_SEAL_ACTIVE".len())
            .any(|window| window == b"CAPSULE_HOST_SEAL_ACTIVE")
    {
        fail("fixed runtime manifest is missing or oversized");
    }
    if stdout_bytes != COMPLETION_JSON {
        fail("fixed runtime completion differs from C2A known answer");
    }

    // SAFETY: ownership of dedicated completion descriptor 5 is transferred exactly once.
    let mut completion = unsafe { File::from_raw_fd(5) };
    completion
        .write_all(COMPLETION_FRAME)
        .unwrap_or_else(|_| fail("completion frame write failed"));
    completion
        .flush()
        .unwrap_or_else(|_| fail("completion frame flush failed"));
}
