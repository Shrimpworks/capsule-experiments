use std::env;
use std::ffi::{c_char, CString};
use std::os::unix::process::CommandExt;
use std::process::Command;

const LAUNCHER_PATH: &str = "/usr/local/libexec/capsule-launcher";
const F_SETFD: i32 = 2;
const O_RDONLY: i32 = 0;
const O_WRONLY: i32 = 1;
const O_CLOEXEC: i32 = 0o2000000;
const MS_RDONLY: usize = 1;
const MS_NOSUID: usize = 2;
const MS_NODEV: usize = 4;
const MS_NOEXEC: usize = 8;
const MS_REMOUNT: usize = 32;

unsafe extern "C" {
    fn fcntl(fd: i32, command: i32, ...) -> i32;
    fn getpid() -> i32;
    fn mount(
        source: *const c_char,
        target: *const c_char,
        filesystem_type: *const c_char,
        flags: usize,
        data: *const core::ffi::c_void,
    ) -> i32;
    fn open(path: *const c_char, flags: i32, ...) -> i32;
    fn syscall(number: i64, ...) -> i64;
}

fn fail(message: &str) -> ! {
    eprintln!("capsule-c5b1-init: {message}");
    std::process::exit(78);
}

fn open_fixed(path: &str, flags: i32) -> i32 {
    let path = CString::new(path).unwrap_or_else(|_| fail("invalid compiled device path"));
    let fd = unsafe { open(path.as_ptr(), flags | O_CLOEXEC) };
    if fd < 0 {
        fail("fixed guest device open failed");
    }
    fd
}

fn install_fd(source: i32, target: i32) {
    if source != target {
        fail("fixed device did not realize its exact descriptor number");
    }
    if unsafe { fcntl(target, F_SETFD, 0) } != 0 {
        fail("fixed descriptor inheritance setup failed");
    }
}

fn mount_fixed(source: Option<&str>, target: &str, filesystem_type: Option<&str>, flags: usize) {
    let source = source.map(|value| CString::new(value).unwrap());
    let target = CString::new(target).unwrap();
    let filesystem_type = filesystem_type.map(|value| CString::new(value).unwrap());
    let result = unsafe {
        mount(
            source
                .as_ref()
                .map_or(core::ptr::null(), |value| value.as_ptr()),
            target.as_ptr(),
            filesystem_type
                .as_ref()
                .map_or(core::ptr::null(), |value| value.as_ptr()),
            flags,
            core::ptr::null(),
        )
    };
    if result != 0 {
        fail("fixed guest filesystem mount failed");
    }
}

fn main() {
    if env::args_os().count() != 1 {
        fail("caller arguments are forbidden");
    }
    let mut environment: Vec<(String, String)> = env::vars().collect();
    environment.sort();
    let allowed = [
        ("HOME".to_string(), "/".to_string()),
        ("KRUN_DIRECT_BLOCK_ROOT".to_string(), "1".to_string()),
        ("TERM".to_string(), "linux".to_string()),
    ];
    if environment != allowed {
        fail("kernel init environment differs from exact allowlist");
    }
    if unsafe { getpid() } != 1 {
        fail("trusted init must be PID 1");
    }

    mount_fixed(
        None,
        "/",
        None,
        MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV,
    );
    mount_fixed(
        Some("devtmpfs"),
        "/dev",
        Some("devtmpfs"),
        MS_NOSUID | MS_NOEXEC,
    );
    mount_fixed(
        Some("proc"),
        "/proc",
        Some("proc"),
        MS_NOSUID | MS_NODEV | MS_NOEXEC,
    );

    const SYS_CLOSE_RANGE_AARCH64: i64 = 436;
    if unsafe { syscall(SYS_CLOSE_RANGE_AARCH64, 0_u32, u32::MAX, 0_i32) } != 0 {
        fail("cannot close inherited init descriptors");
    }
    let descriptors = [
        open_fixed("/dev/null", O_RDONLY),
        open_fixed("/dev/null", O_WRONLY),
        open_fixed("/dev/null", O_WRONLY),
        open_fixed("/dev/vport0p1", O_RDONLY),
        open_fixed("/dev/vport0p2", O_RDONLY),
        open_fixed("/dev/vport0p3", O_WRONLY),
    ];
    for (target, source) in descriptors.into_iter().enumerate() {
        install_fd(source, target as i32);
    }
    let error = Command::new(LAUNCHER_PATH).env_clear().exec();
    fail(&format!("fixed launcher exec failed: {error}"));
}
