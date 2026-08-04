package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type attemptRecord struct {
	Attempt  string `json:"attempt"`
	Phase    string `json:"phase"`
	PID      int    `json:"pid"`
	Identity string `json:"identity"`
}

func main() {
	if len(os.Args) < 6 {
		fatalf("usage: controller RECORD IDENTITY_HELPER RUNNER ROOT_DISK EXECUTABLE [ARG ...]")
	}
	recordPath := os.Args[1]
	identityHelper := os.Args[2]
	runner := os.Args[3]
	rootDisk := os.Args[4]
	guestArgs := os.Args[5:]

	controlReader, controlWriter, err := os.Pipe()
	if err != nil {
		fatalf("control pipe: %v", err)
	}

	args := []string{"--control-fd", "3", rootDisk}
	args = append(args, guestArgs...)
	command := exec.Command(runner, args...)
	command.ExtraFiles = []*os.File{controlReader}
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		fatalf("start runner: %v", err)
	}
	_ = controlReader.Close()
	pid := command.Process.Pid
	fmt.Printf("CONTROLLER_PHASE phase=before-record runnerPid=%d\n", pid)
	pauseIfRequested("before-record")

	identity, err := readIdentity(identityHelper, pid)
	if err != nil {
		_ = controlWriter.Close()
		_ = command.Wait()
		fatalf("verify runner identity: %v", err)
	}
	record := attemptRecord{
		Attempt:  "spike-attempt-1",
		Phase:    "create-committed",
		PID:      pid,
		Identity: identity,
	}
	if err := writeDurableJSON(recordPath, record); err != nil {
		_ = controlWriter.Close()
		_ = command.Wait()
		fatalf("write durable attempt: %v", err)
	}
	fmt.Printf("CONTROLLER_PHASE phase=after-record runnerPid=%d\n", pid)
	pauseIfRequested("after-record")

	if _, err := controlWriter.Write([]byte{'G'}); err != nil {
		_ = controlWriter.Close()
		_ = command.Wait()
		fatalf("authorize runner: %v", err)
	}
	if err := controlWriter.Close(); err != nil {
		fatalf("close control pipe: %v", err)
	}
	fmt.Printf("CONTROLLER_PHASE phase=after-go runnerPid=%d\n", pid)
	pauseIfRequested("after-go")

	if err := command.Wait(); err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			os.Exit(exitError.ExitCode())
		}
		fatalf("wait runner: %v", err)
	}
}

func pauseIfRequested(phase string) {
	if os.Getenv("CAPSULE_CONTROLLER_PAUSE") != phase {
		return
	}
	fmt.Printf("CONTROLLER_PAUSED phase=%s\n", phase)
	for {
		time.Sleep(time.Second)
	}
}

func readIdentity(helper string, pid int) (string, error) {
	var lastErr error
	for attempt := 0; attempt < 100; attempt++ {
		output, err := exec.Command(helper, strconv.Itoa(pid)).CombinedOutput()
		if err == nil && strings.Contains(string(output), "codeRequirement=valid") {
			return string(output), nil
		}
		lastErr = fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
		time.Sleep(10 * time.Millisecond)
	}
	return "", lastErr
}

func writeDurableJSON(path string, value any) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	bytes = append(bytes, '\n')
	temporary := path + ".tmp"
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	removeTemporary := true
	defer func() {
		if removeTemporary {
			_ = os.Remove(temporary)
		}
	}()
	if _, err := file.Write(bytes); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporary, path); err != nil {
		return err
	}
	removeTemporary = false
	directoryFile, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer directoryFile.Close()
	return directoryFile.Sync()
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "controller: "+format+"\n", args...)
	os.Exit(1)
}
