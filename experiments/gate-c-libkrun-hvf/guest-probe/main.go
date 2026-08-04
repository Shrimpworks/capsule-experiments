package main

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	afVsock                   = 40
	vmSocketsGetLocalCIDIoctl = 0x80047bb9
	guestProbePath            = "/usr/local/libexec/capsule-guest-probe"
)

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--fsize-child" {
		probeFileSizeChild()
		return
	}

	fmt.Printf("uid=%d gid=%d\n", os.Geteuid(), os.Getegid())
	fmt.Printf("groups=%v\n", mustGroups())
	probeProcessStatus()
	probeLimits()
	probeNetwork()
	probeVsock()
	probeRootWrite()
	probeOpenFileLimit()
	probeProcessLimit()
	probeFileSizeLimit()
}

func mustGroups() []int {
	groups, err := os.Getgroups()
	if err != nil {
		fmt.Printf("groupsError=%v\n", err)
		return nil
	}
	return groups
}

func probeProcessStatus() {
	file, err := os.Open("/proc/self/status")
	if err != nil {
		fmt.Printf("processStatusError=%v\n", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "NoNewPrivs:") ||
			strings.HasPrefix(line, "CapEff:") {
			fmt.Println(strings.ReplaceAll(line, "\t", "="))
		}
	}
}

func probeLimits() {
	limits := []struct {
		name     string
		resource int
	}{
		{name: "fsize", resource: 1},
		{name: "core", resource: 4},
		{name: "nproc", resource: 6},
		{name: "nofile", resource: 7},
	}
	for _, limit := range limits {
		var value syscall.Rlimit
		if err := syscall.Getrlimit(limit.resource, &value); err != nil {
			fmt.Printf("rlimit.%s.error=%v\n", limit.name, err)
			continue
		}
		fmt.Printf("rlimit.%s=%d:%d\n", limit.name, value.Cur, value.Max)
	}
}

func probeNetwork() {
	connection, err := net.DialTimeout("tcp", "192.0.2.1:80", 250*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		fmt.Println("network=connected")
		return
	}
	var operationError *net.OpError
	if errors.As(err, &operationError) {
		fmt.Printf("network=denied error=%v\n", operationError.Err)
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
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, uintptr(fd),
		vmSocketsGetLocalCIDIoctl, uintptr(unsafe.Pointer(&cid)))
	if errno != 0 {
		fmt.Printf("vsock=unavailable localCIDError=%v\n", errno)
		return
	}
	fmt.Printf("vsock=available localCID=%d\n", cid)
}

func probeRootWrite() {
	file, err := os.OpenFile("/capsule-write-test", os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		fmt.Printf("rootWrite=denied error=%v\n", err)
		return
	}
	_ = file.Close()
	fmt.Println("rootWrite=allowed")
}

func probeOpenFileLimit() {
	fds := make([]int, 0, 80)
	var openErr error
	for len(fds) < 80 {
		fd, err := syscall.Open("/dev/null", syscall.O_RDONLY, 0)
		if err != nil {
			openErr = err
			break
		}
		fds = append(fds, fd)
	}
	for _, fd := range fds {
		_ = syscall.Close(fd)
	}
	fmt.Printf("nofile.opened=%d error=%v\n", len(fds), openErr)
}

func probeProcessLimit() {
	pids := make([]int, 0, 64)
	var forkErr error
	for len(pids) < 64 {
		pid, err := syscall.ForkExec("/bin/sleep", []string{"sleep", "5"},
			&syscall.ProcAttr{Files: []uintptr{0, 1, 2}})
		if err != nil {
			forkErr = err
			break
		}
		pids = append(pids, pid)
	}
	for _, pid := range pids {
		_ = syscall.Kill(pid, syscall.SIGKILL)
		_, _ = syscall.Wait4(pid, nil, 0, nil)
	}
	fmt.Printf("nproc.spawned=%d error=%v\n", len(pids), forkErr)
}

func probeFileSizeLimit() {
	pid, err := syscall.ForkExec(guestProbePath,
		[]string{guestProbePath, "--fsize-child"},
		&syscall.ProcAttr{Files: []uintptr{0, 1, 2}})
	if err != nil {
		fmt.Printf("fsize.childError=%v\n", err)
		return
	}
	var status syscall.WaitStatus
	_, err = syscall.Wait4(pid, &status, 0, nil)
	fmt.Printf("fsize.childStatus=%d signal=%d waitError=%v\n",
		status.ExitStatus(), status.Signal(), err)
}

func probeFileSizeChild() {
	file, err := os.OpenFile("/dev/shm/capsule-fsize-probe", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		os.Exit(72)
	}
	defer file.Close()
	chunk := make([]byte, 64*1024)
	for written := 0; written < 2*1024*1024; written += len(chunk) {
		if _, err := file.Write(chunk); err != nil {
			os.Exit(73)
		}
	}
	os.Exit(0)
}
