package main

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

const (
	guestID           = 65534
	prSetNoNewPrivs   = 38
	noNewPrivsEnabled = 1
)

func main() {
	if len(os.Args) < 2 || !strings.HasPrefix(os.Args[1], "/") {
		fmt.Fprintln(os.Stderr, "usage: capsule-guest-launcher /ABSOLUTE/EXECUTABLE [ARG ...]")
		os.Exit(64)
	}

	if err := syscall.Setgroups([]int{}); err != nil {
		fatal("setgroups", err)
	}
	if _, _, errno := syscall.Syscall6(syscall.SYS_PRCTL, prSetNoNewPrivs,
		noNewPrivsEnabled, 0, 0, 0, 0); errno != 0 {
		fatal("prctl(PR_SET_NO_NEW_PRIVS)", errno)
	}
	if err := syscall.Setgid(guestID); err != nil {
		fatal("setgid", err)
	}
	if err := syscall.Setuid(guestID); err != nil {
		fatal("setuid", err)
	}
	syscall.Umask(0o077)

	executable := os.Args[1]
	if err := syscall.Exec(executable, os.Args[1:], os.Environ()); err != nil {
		fatal("exec", err)
	}
}

func fatal(operation string, err error) {
	fmt.Fprintf(os.Stderr, "capsule-guest-launcher: %s: %v\n", operation, err)
	os.Exit(126)
}
