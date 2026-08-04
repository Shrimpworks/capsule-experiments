package main

import (
	"bufio"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	afVsock                   = 40
	vmSocketsGetLocalCIDIoctl = 0x80047bb9
	tokenPath                 = "/tmp/capsule-cross-job-token"
)

func main() {
	if len(os.Args) < 2 {
		fatal("usage: capsule-guest-adversary MODE [ARG]")
	}
	switch os.Args[1] {
	case "inventory":
		inventory()
	case "fd-stress":
		fdStress()
	case "fork-stress":
		forkStress()
	case "memory-stress":
		memoryStress(argumentInt(2, 320))
	case "output-flood":
		outputFlood(argumentInt(2, 4*1024*1024))
	case "completion-marker":
		if len(os.Args) != 3 {
			fatal("completion-marker requires one token")
		}
		fmt.Printf("completionMarker=%s\n", os.Args[2])
	case "crash":
		fmt.Println("crash.started=true")
		_ = syscall.Kill(os.Getpid(), syscall.SIGSEGV)
		time.Sleep(time.Second)
	case "hang":
		for {
			runtime.Gosched()
		}
	case "write-token":
		if err := os.WriteFile(tokenPath, []byte("attempt-one-secret"), 0o600); err != nil {
			fatal("write-token: %v", err)
		}
		fmt.Println("tokenWrite=ok")
	case "check-token":
		if _, err := os.Lstat(tokenPath); err == nil {
			fmt.Println("tokenLeak=present")
			os.Exit(90)
		} else if !os.IsNotExist(err) {
			fatal("check-token: %v", err)
		}
		fmt.Println("tokenLeak=absent")
	default:
		fatal("unknown mode: %s", os.Args[1])
	}
}

func argumentInt(index int, fallback int) int {
	if len(os.Args) <= index {
		return fallback
	}
	value, err := strconv.Atoi(os.Args[index])
	if err != nil || value <= 0 {
		fatal("invalid positive integer: %s", os.Args[index])
	}
	return value
}

func inventory() {
	fmt.Printf("uid=%d gid=%d groups=%v\n", os.Geteuid(), os.Getegid(), groups())
	printStatus()
	paths, _ := filepath.Glob("/sys/bus/virtio/devices/virtio*/uevent")
	sort.Strings(paths)
	for _, path := range paths {
		contents, err := os.ReadFile(path)
		if err == nil {
			fmt.Printf("virtio=%s:%s\n", filepath.Base(filepath.Dir(path)), strings.TrimSpace(string(contents)))
		}
	}
	if mounts, err := os.ReadFile("/proc/mounts"); err == nil {
		for _, line := range strings.Split(string(mounts), "\n") {
			if strings.Contains(line, " / ") || strings.Contains(line, "virtiofs") {
				fmt.Printf("mount=%s\n", line)
			}
		}
	}
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, item := range interfaces {
			fmt.Printf("interface=%s flags=%s\n", item.Name, item.Flags.String())
		}
	}
	probeNetwork()
	probeVsock()
}

func groups() []int {
	values, _ := os.Getgroups()
	return values
}

func printStatus() {
	file, err := os.Open("/proc/self/status")
	if err != nil {
		return
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "NoNewPrivs:") || strings.HasPrefix(line, "CapEff:") {
			fmt.Println(strings.ReplaceAll(line, "\t", "="))
		}
	}
}

func probeNetwork() {
	connection, err := net.DialTimeout("tcp", "192.0.2.1:80", 250*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		fmt.Println("network=connected")
		return
	}
	fmt.Printf("network=denied error=%v\n", err)
}

func probeVsock() {
	fd, err := syscall.Socket(afVsock, syscall.SOCK_STREAM, 0)
	if err != nil {
		fmt.Printf("vsock=unavailable socketError=%v\n", err)
		return
	}
	defer syscall.Close(fd)
	var cid uint32
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, uintptr(fd), vmSocketsGetLocalCIDIoctl, uintptr(unsafe.Pointer(&cid)))
	if errno != 0 {
		fmt.Printf("vsock=unavailable localCIDError=%v\n", errno)
		return
	}
	fmt.Printf("vsock=available localCID=%d\n", cid)
}

func fdStress() {
	fds := make([]int, 0, 256)
	var final error
	for len(fds) < cap(fds) {
		fd, err := syscall.Open("/dev/null", syscall.O_RDONLY, 0)
		if err != nil {
			final = err
			break
		}
		fds = append(fds, fd)
	}
	for _, fd := range fds {
		_ = syscall.Close(fd)
	}
	fmt.Printf("fdStress.opened=%d error=%v\n", len(fds), final)
}

func forkStress() {
	pids := make([]int, 0, 128)
	var final error
	for len(pids) < cap(pids) {
		pid, err := syscall.ForkExec("/bin/sleep", []string{"sleep", "2"}, &syscall.ProcAttr{Files: []uintptr{0, 1, 2}})
		if err != nil {
			final = err
			break
		}
		pids = append(pids, pid)
	}
	for _, pid := range pids {
		_ = syscall.Kill(pid, syscall.SIGKILL)
		_, _ = syscall.Wait4(pid, nil, 0, nil)
	}
	fmt.Printf("forkStress.spawned=%d error=%v\n", len(pids), final)
}

func memoryStress(mebibytes int) {
	fmt.Printf("memoryStress.requestMiB=%d\n", mebibytes)
	chunks := make([][]byte, 0, mebibytes)
	for index := 0; index < mebibytes; index++ {
		chunk := make([]byte, 1024*1024)
		for page := 0; page < len(chunk); page += 4096 {
			chunk[page] = byte(index)
		}
		chunks = append(chunks, chunk)
		if (index+1)%32 == 0 {
			fmt.Printf("memoryStress.touchedMiB=%d\n", index+1)
		}
	}
	runtime.KeepAlive(chunks)
	fmt.Printf("memoryStress.completedMiB=%d\n", len(chunks))
}

func outputFlood(bytes int) {
	chunk := strings.Repeat("X", 4095) + "\n"
	written := 0
	for written < bytes {
		count, err := os.Stdout.WriteString(chunk)
		written += count
		if err != nil {
			fmt.Fprintf(os.Stderr, "outputFlood.error=%v bytes=%d\n", err, written)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "outputFlood.completedBytes=%d\n", written)
}

func fatal(format string, arguments ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", arguments...)
	os.Exit(64)
}
