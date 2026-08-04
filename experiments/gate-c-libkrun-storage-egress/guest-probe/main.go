package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const (
	guestID         = 65534
	prSetNoNewPrivs = 38
	prGetNoNewPrivs = 39
	sparseBytes     = int64(32) << 20
)

func main() {
	if len(os.Args) == 3 && os.Args[1] == "--child" {
		runChild(os.Args[2])
		return
	}
	if len(os.Args) != 4 {
		fatalf("usage: storage-probe MODE SOURCE_SHA256 INPUT_SHA256")
	}
	mode := os.Args[1]
	if mode != "valid" && mode != "hostile" && mode != "quota" && mode != "crash" {
		fatalf("unsupported mode %q", mode)
	}

	mustMount("/dev/vdb", "/capsule/source", true)
	mustMount("/dev/vdc", "/capsule/input", true)
	mustMount("/dev/vdd", "/capsule/scratch", false)

	requireBlockReadOnly("vdb", true)
	requireBlockReadOnly("vdc", true)
	requireBlockReadOnly("vdd", false)
	requireDigest("/capsule/source/program.ts", os.Args[2])
	requireDigest("/capsule/input/data.bin", os.Args[3])

	if _, _, errno := syscall.Syscall6(syscall.SYS_PRCTL, prSetNoNewPrivs, 1, 0, 0, 0, 0); errno != 0 {
		fatal("prctl(PR_SET_NO_NEW_PRIVS)", errno)
	}
	command := exec.Command(os.Args[0], "--child", mode)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	command.SysProcAttr = &syscall.SysProcAttr{
		Credential: &syscall.Credential{Uid: guestID, Gid: guestID, NoSetGroups: true},
		Pdeathsig:  syscall.SIGKILL,
	}
	childErr := command.Run()
	syscall.Sync()
	for _, target := range []string{"/capsule/scratch", "/capsule/input", "/capsule/source"} {
		if err := syscall.Unmount(target, 0); err != nil {
			fatal("unmount "+target, err)
		}
	}
	fmt.Println("PROBE_STORAGE_UNMOUNTED")
	if childErr != nil {
		fatal("child workload", childErr)
	}
}

func runChild(mode string) {
	syscall.Umask(0o077)
	requireDroppedAuthority()

	expectReadOnlyWrite("/capsule/source/program.ts")
	expectReadOnlyWrite("/capsule/input/data.bin")
	if _, err := os.Lstat("/capsule/scratch/leak-marker"); !errors.Is(err, os.ErrNotExist) {
		fatalf("fresh scratch contained prior marker: %v", err)
	}
	fmt.Println("PROBE_FRESH_SCRATCH priorMarker=false")
	writeFile("/capsule/scratch/leak-marker", []byte("attempt-local\n"), 0o600)

	switch mode {
	case "valid":
		must(os.Mkdir("/capsule/scratch/result", 0o700), "mkdir result")
		payload := []byte(`{"ok":true,"scope":"attempt"}` + "\n")
		writeFile("/capsule/scratch/result/data.json", payload, 0o600)
		must(syncPath("/capsule/scratch/result/data.json"), "sync valid result")
		fmt.Printf("PROBE_VALID_COMPLETE bytes=%d\n", len(payload))
	case "hostile":
		runHostileCases()
	case "quota":
		runQuotaCases()
	case "crash":
		fmt.Println("PROBE_READY_CRASH")
		for i := 0; ; i++ {
			writeFile("/capsule/scratch/crash-progress", []byte(fmt.Sprintf("%08d\n", i)), 0o600)
			_ = syncPath("/capsule/scratch/crash-progress")
			time.Sleep(20 * time.Millisecond)
		}
	}
}

func mustMount(device, target string, readOnly bool) {
	flags := uintptr(syscall.MS_NODEV | syscall.MS_NOSUID | syscall.MS_NOEXEC)
	if readOnly {
		flags |= syscall.MS_RDONLY
	}
	if err := syscall.Mount(device, target, "ext4", flags, ""); err != nil {
		fatal("mount "+device, err)
	}
}

func requireBlockReadOnly(name string, expected bool) {
	data, err := os.ReadFile("/sys/block/" + name + "/ro")
	if err != nil {
		fatal("read block ro state", err)
	}
	actual := strings.TrimSpace(string(data)) == "1"
	if actual != expected {
		fatalf("block %s readOnly=%v expected=%v", name, actual, expected)
	}
	fmt.Printf("PROBE_BLOCK device=%s readOnly=%v\n", name, actual)
}

func requireDigest(path, expected string) {
	data, err := os.ReadFile(path)
	if err != nil {
		fatal("read "+path, err)
	}
	digest := sha256.Sum256(data)
	actual := hex.EncodeToString(digest[:])
	if actual != expected {
		fatalf("digest mismatch path=%s expected=%s actual=%s", path, expected, actual)
	}
	fmt.Printf("PROBE_DIGEST path=%s sha256=%s\n", path, actual)
}

func requireDroppedAuthority() {
	if os.Geteuid() != guestID || os.Getegid() != guestID {
		fatalf("authority not dropped uid=%d gid=%d", os.Geteuid(), os.Getegid())
	}
	if _, _, errno := syscall.Syscall6(syscall.SYS_PRCTL, prGetNoNewPrivs, 0, 0, 0, 0, 0); errno != 0 {
		fatal("prctl(PR_GET_NO_NEW_PRIVS)", errno)
	}
	status, err := os.ReadFile("/proc/self/status")
	if err != nil {
		fatal("read /proc/self/status", err)
	}
	if !strings.Contains(string(status), "CapEff:\t0000000000000000") {
		fatalf("effective capabilities were not zero")
	}
	fmt.Printf("PROBE_AUTHORITY uid=%d gid=%d caps=zero noNewPrivs=true\n", os.Geteuid(), os.Getegid())
}

func expectReadOnlyWrite(path string) {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_TRUNC, 0)
	if err == nil {
		_ = f.Close()
		fatalf("unexpected write access to %s", path)
	}
	if !errors.Is(err, syscall.EROFS) {
		fatalf("write to %s failed with %v, want EROFS", path, err)
	}
	fmt.Printf("PROBE_MUTATION_DENIED path=%s errno=EROFS\n", path)
}

func runHostileCases() {
	root := "/capsule/scratch"
	result := filepath.Join(root, "result")
	must(os.Mkdir(result, 0o700), "mkdir result")
	writeFile(filepath.Join(result, "data.json"), []byte("hostile-link-target\n"), 0o600)
	must(os.Link(filepath.Join(result, "data.json"), filepath.Join(result, "hardlink")), "hardlink")
	must(os.Symlink("/etc/passwd", filepath.Join(result, "symlink")), "symlink")
	must(syscall.Mkfifo(filepath.Join(result, "fifo"), 0o600), "mkfifo")
	listener, err := net.Listen("unix", filepath.Join(result, "socket"))
	must(err, "unix socket")
	if unixListener, ok := listener.(*net.UnixListener); ok {
		unixListener.SetUnlinkOnClose(false)
	}
	must(listener.Close(), "close unix socket")
	writeFile(filepath.Join(result, "..dotdot"), []byte("name\n"), 0o600)
	writeFile(filepath.Join(result, "%2e%2e"), []byte("encoded\n"), 0o600)
	writeFile(filepath.Join(result, "line\nbreak"), []byte("newline\n"), 0o600)
	writeFile(filepath.Join(result, "bidi-\u202eevil"), []byte("bidi\n"), 0o600)
	writeFile(filepath.Join(result, "hostile-mode"), []byte("mode\n"), 0o600)
	must(os.Chmod(filepath.Join(result, "hostile-mode"), 0o4777), "chmod hostile mode")
	must(syscall.Setxattr(filepath.Join(result, "hostile-mode"), "user.capsule-hostile", []byte("xattr"), 0), "setxattr")
	deviceErr := syscall.Mknod(filepath.Join(result, "device"), syscall.S_IFCHR|0o600, 0x103)
	if !errors.Is(deviceErr, syscall.EPERM) {
		fatalf("unprivileged device creation error=%v want EPERM", deviceErr)
	}
	must(syncPath(filepath.Join(root, "result", "data.json")), "sync hostile result")
	fmt.Println("PROBE_HOSTILE_COMPLETE symlink=true hardlink=true fifo=true socket=true specialDevice=EPERM hostileNames=true hostileMetadata=true")
}

func runQuotaCases() {
	root := "/capsule/scratch"
	must(os.Mkdir(filepath.Join(root, "result"), 0o700), "mkdir quota result")
	sparsePath := filepath.Join(root, "result", "data.json")
	f, err := os.OpenFile(sparsePath, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o600)
	must(err, "create sparse file")
	must(f.Truncate(sparseBytes), "truncate sparse file")
	must(f.Close(), "close sparse file")
	info, err := os.Stat(sparsePath)
	must(err, "stat sparse file")
	if info.Size() != sparseBytes {
		fatalf("sparse logical size=%d want=%d", info.Size(), sparseBytes)
	}

	fill, err := os.OpenFile(filepath.Join(root, "fill"), os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o600)
	must(err, "create fill file")
	chunk := make([]byte, 64*1024)
	for i := range chunk {
		chunk[i] = byte(i)
	}
	var written int64
	var final error
	for {
		n, err := fill.Write(chunk)
		written += int64(n)
		if err != nil {
			final = err
			break
		}
	}
	_ = fill.Sync()
	_ = fill.Close()
	if !errors.Is(final, syscall.ENOSPC) {
		fatalf("fill error=%v want ENOSPC", final)
	}
	fmt.Printf("PROBE_QUOTA_COMPLETE sparseLogicalBytes=%d sequentialBytes=%d final=ENOSPC\n", sparseBytes, written)
}

func writeFile(path string, data []byte, mode os.FileMode) {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	must(err, "open "+path)
	_, err = f.Write(data)
	must(err, "write "+path)
	must(f.Close(), "close "+path)
}

func syncPath(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}

func must(err error, operation string) {
	if err != nil {
		fatal(operation, err)
	}
}

func fatal(operation string, err error) {
	fmt.Fprintf(os.Stderr, "storage-probe: %s: %v\n", operation, err)
	os.Exit(125)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "storage-probe: "+format+"\n", args...)
	os.Exit(125)
}
