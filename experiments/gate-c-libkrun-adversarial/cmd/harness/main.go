package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/dills122/capsule-corp/experiments/gate-c-libkrun-adversarial/internal/preflight"
)

const captureLimit = 128 * 1024

type options struct {
	runner   string
	disk     string
	launcher string
	guest    string
	identity string
	work     string
}

type captureSummary struct {
	TotalBytes int64  `json:"totalBytes"`
	KeptBytes  int    `json:"keptBytes"`
	Truncated  bool   `json:"truncated"`
	SHA256     string `json:"sha256"`
	Text       string `json:"text"`
}

type caseResult struct {
	Name        string         `json:"name"`
	PID         int            `json:"pid,omitempty"`
	DurationMS  int64          `json:"durationMs"`
	ExitCode    int            `json:"exitCode"`
	Signal      string         `json:"signal,omitempty"`
	TimedOut    bool           `json:"timedOut"`
	ForcedKill  bool           `json:"forcedKill"`
	ProcessGone bool           `json:"processGone"`
	StartError  string         `json:"startError,omitempty"`
	Stdout      captureSummary `json:"stdout"`
	Stderr      captureSummary `json:"stderr"`
}

type identityResult struct {
	Name           string `json:"name"`
	HelperAccepted bool   `json:"helperAccepted"`
	TupleAccepted  bool   `json:"tupleAccepted"`
	ExpectedPath   string `json:"expectedPath"`
	ObservedPath   string `json:"observedPath,omitempty"`
	ExpectedStart  string `json:"expectedStart,omitempty"`
	ObservedStart  string `json:"observedStart,omitempty"`
	Requirement    string `json:"requirement,omitempty"`
	Output         string `json:"output"`
}

type report struct {
	StartedAt      string           `json:"startedAt"`
	Runner         string           `json:"runner"`
	RootDisk       string           `json:"rootDisk"`
	RootDiskSHA256 string           `json:"rootDiskSha256"`
	Preflight      map[string]any   `json:"preflight"`
	Cases          []caseResult     `json:"cases"`
	IdentityCases  []identityResult `json:"identityCases"`
	Findings       []string         `json:"findings"`
	Limitations    []string         `json:"limitations"`
	Failures       []string         `json:"failures"`
	CompletedAt    string           `json:"completedAt"`
}

type cappedCapture struct {
	limit int
	total int64
	kept  bytes.Buffer
	hash  hash.Hash
}

func newCappedCapture(limit int) *cappedCapture {
	return &cappedCapture{limit: limit, hash: sha256.New()}
}

func (capture *cappedCapture) Write(value []byte) (int, error) {
	count := len(value)
	capture.total += int64(count)
	_, _ = capture.hash.Write(value)
	remaining := capture.limit - capture.kept.Len()
	if remaining > 0 {
		if remaining > count {
			remaining = count
		}
		_, _ = capture.kept.Write(value[:remaining])
	}
	return count, nil
}

func (capture *cappedCapture) summary() captureSummary {
	return captureSummary{
		TotalBytes: capture.total,
		KeptBytes:  capture.kept.Len(),
		Truncated:  capture.total > int64(capture.kept.Len()),
		SHA256:     hex.EncodeToString(capture.hash.Sum(nil)),
		Text:       capture.kept.String(),
	}
}

func main() {
	configuration, err := parseOptions(os.Args[1:])
	if err != nil {
		fatalf("%v", err)
	}
	for _, path := range []string{configuration.runner, configuration.disk, configuration.launcher, configuration.guest, configuration.identity} {
		absolute, err := filepath.Abs(path)
		if err != nil {
			fatalf("absolute path: %v", err)
		}
		switch path {
		case configuration.runner:
			configuration.runner = absolute
		case configuration.disk:
			configuration.disk = absolute
		case configuration.identity:
			configuration.identity = absolute
		}
	}
	if err := os.MkdirAll(configuration.work, 0o700); err != nil {
		fatalf("create work directory: %v", err)
	}

	digest, err := fileSHA256(configuration.disk)
	if err != nil {
		fatalf("root disk digest: %v", err)
	}
	result := report{
		StartedAt:      time.Now().UTC().Format(time.RFC3339Nano),
		Runner:         configuration.runner,
		RootDisk:       configuration.disk,
		RootDiskSHA256: digest,
		Preflight:      map[string]any{},
	}

	exact := preflight.ExactProfile()
	if err := preflight.ValidateProfile(exact); err != nil {
		result.Failures = append(result.Failures, "exact profile rejected: "+err.Error())
	} else {
		result.Preflight["exactProfile"] = "accepted"
	}
	diskInfo, err := os.Stat(configuration.disk)
	if err != nil {
		fatalf("root disk stat: %v", err)
	}
	verified, identity, err := preflight.OpenVerifiedRawBlock(configuration.disk, diskInfo.Size(), digest)
	if err != nil {
		result.Failures = append(result.Failures, "exact root preflight rejected: "+err.Error())
	} else {
		result.Preflight["root"] = identity
		_ = verified.Close()
	}

	runGuest := func(name string, timeout time.Duration, arguments ...string) caseResult {
		command := append([]string{configuration.disk, configuration.launcher, configuration.guest}, arguments...)
		caseValue := runCase(name, configuration.runner, command, timeout)
		result.Cases = append(result.Cases, caseValue)
		return caseValue
	}

	inventory := runGuest("guest.inventory", 5*time.Second, "inventory")
	if inventory.ExitCode != 0 || inventory.TimedOut {
		result.Failures = append(result.Failures, "inventory guest did not complete")
	}
	inventoryText := inventory.Stdout.Text + inventory.Stderr.Text
	for _, forbidden := range []string{
		"MODALIAS=virtio:d00000001", // net
		"MODALIAS=virtio:d00000010", // GPU
		"MODALIAS=virtio:d00000013", // vsock
		"MODALIAS=virtio:d00000019", // sound
		"network=connected",
		"vsock=available",
	} {
		if strings.Contains(strings.ToUpper(inventoryText), strings.ToUpper(forbidden)) {
			result.Failures = append(result.Failures, "inventory exposed forbidden surface: "+forbidden)
		}
	}
	if strings.Contains(inventoryText, "MODALIAS=virtio:d0000001A") {
		result.Failures = append(result.Failures,
			"minimal block-root guest exposed an unrequested virtiofs device")
	}
	for _, line := range strings.Split(inventoryText, "\n") {
		if strings.HasPrefix(line, "mount=") && strings.Contains(line, "virtiofs") {
			result.Failures = append(result.Failures, "guest had a mounted virtiofs host directory")
		}
	}
	for _, required := range []string{"uid=65534", "NoNewPrivs:=1", "CapEff:=0000000000000000", "network=denied", "vsock=unavailable"} {
		if !strings.Contains(inventoryText, required) {
			result.Failures = append(result.Failures, "inventory missing evidence: "+required)
		}
	}
	completion := runGuest("guest.completion-marker", 5*time.Second, "completion-marker", "valid-profile")
	if completion.ExitCode != 0 || completion.TimedOut ||
		!strings.Contains(completion.Stdout.Text, "completionMarker=valid-profile") {
		result.Failures = append(result.Failures, "valid guest completion marker was not observed")
	}

	fd := runGuest("guest.fd-stress", 5*time.Second, "fd-stress")
	if fd.ExitCode != 0 || !strings.Contains(fd.Stdout.Text, "error=too many open files") {
		result.Failures = append(result.Failures, "fd stress did not reach the expected bounded denial")
	}
	fork := runGuest("guest.fork-stress", 6*time.Second, "fork-stress")
	if fork.ExitCode != 0 || !strings.Contains(fork.Stdout.Text, "error=resource temporarily unavailable") {
		result.Failures = append(result.Failures, "fork stress did not reach the expected bounded denial")
	}

	memory := runGuest("guest.memory-stress", 10*time.Second, "memory-stress", "320")
	if memory.ExitCode == 0 && !strings.Contains(memory.Stdout.Text, "memoryStress.completedMiB=320") {
		result.Findings = append(result.Findings,
			"runner returned zero after the memory-stress guest stopped before its completion marker")
	}
	output := runGuest("guest.output-flood", 8*time.Second, "output-flood", strconv.Itoa(4*1024*1024))
	if output.ExitCode != 0 || output.Stdout.TotalBytes < 4*1024*1024 || !output.Stdout.Truncated {
		result.Failures = append(result.Failures, "output flood was not fully drained with bounded retained capture")
	}
	crash := runGuest("guest.crash", 5*time.Second, "crash")
	if crash.TimedOut || !crash.ProcessGone || !strings.Contains(crash.Stdout.Text, "crash.started=true") {
		result.Failures = append(result.Failures, "crashing guest did not start, terminate, and disappear")
	}
	if crash.ExitCode == 0 {
		result.Findings = append(result.Findings,
			"runner returned zero after an intentional guest crash; host exit status is not guest success evidence")
	}
	hang := runGuest("guest.hang", 2*time.Second, "hang")
	if !hang.TimedOut || !hang.ProcessGone {
		result.Failures = append(result.Failures, "hanging guest was not bounded and reaped")
	}

	writeToken := runGuest("cross-job.write-token", 5*time.Second, "write-token")
	checkToken := runGuest("cross-job.check-token", 5*time.Second, "check-token")
	if checkToken.ExitCode != 0 || !strings.Contains(checkToken.Stdout.Text, "tokenLeak=absent") {
		result.Failures = append(result.Failures, "cross-job tmpfs token isolation failed")
	}
	if !strings.Contains(writeToken.Stdout.Text, "tokenWrite=ok") {
		result.Findings = append(result.Findings,
			"read-only root prevented the token write, so writable cross-job state was not exercised in this track")
		result.Limitations = append(result.Limitations,
			"fresh writable scratch cross-job isolation is covered by the separate storage track, not this root-only profile")
	}

	forced := runForcedKillCase("runner.sigkill", configuration.runner,
		[]string{configuration.disk, configuration.launcher, configuration.guest, "hang"}, 300*time.Millisecond)
	result.Cases = append(result.Cases, forced)
	if !forced.ForcedKill || !forced.ProcessGone || forced.Signal != syscall.SIGKILL.String() {
		result.Failures = append(result.Failures, "exact runner SIGKILL did not remove the VMM process")
	}

	for index := 0; index < 10; index++ {
		caseValue := runCase(fmt.Sprintf("repeat.true.%02d", index+1), configuration.runner,
			[]string{configuration.disk, configuration.launcher, "/bin/true"}, 5*time.Second)
		result.Cases = append(result.Cases, caseValue)
		if caseValue.ExitCode != 0 || caseValue.TimedOut || !caseValue.ProcessGone {
			result.Failures = append(result.Failures, caseValue.Name+" failed")
		}
	}

	concurrent := make(chan caseResult, 4)
	for index := 0; index < 4; index++ {
		go func(index int) {
			concurrent <- runCase(fmt.Sprintf("concurrent.%02d", index+1), configuration.runner,
				[]string{configuration.disk, configuration.launcher, "/bin/sleep", "1"}, 6*time.Second)
		}(index)
	}
	for index := 0; index < 4; index++ {
		caseValue := <-concurrent
		result.Cases = append(result.Cases, caseValue)
		if caseValue.ExitCode != 0 || caseValue.TimedOut || !caseValue.ProcessGone {
			result.Failures = append(result.Failures, caseValue.Name+" failed")
		}
	}

	fixtures, fixtureErr := createMalformedFixtures(configuration.work, configuration.disk)
	if fixtureErr != nil {
		result.Failures = append(result.Failures, "malformed fixture creation: "+fixtureErr.Error())
	} else {
		for name, disk := range fixtures {
			caseValue := runCase("disk."+name, configuration.runner,
				[]string{disk, configuration.launcher, configuration.guest, "completion-marker", name}, 3*time.Second)
			result.Cases = append(result.Cases, caseValue)
			completed := strings.Contains(caseValue.Stdout.Text, "completionMarker="+name)
			if name != "symlink" && completed {
				result.Failures = append(result.Failures, "malformed disk ran the guest completion marker: "+name)
			}
			if !caseValue.ProcessGone {
				result.Failures = append(result.Failures, "malformed disk runner remained: "+name)
			}
			if name != "symlink" && caseValue.ExitCode == 0 && !completed {
				result.Findings = append(result.Findings,
					"runner returned zero after malformed disk rejection: "+name)
			}
			if _, _, err := preflight.OpenVerifiedRawBlock(disk, diskInfo.Size(), digest); err == nil {
				result.Failures = append(result.Failures, "preflight accepted non-exact disk: "+name)
			} else {
				result.Preflight[name] = "rejected: " + err.Error()
			}
		}
		if symlinkCase := findCase(result.Cases, "disk.symlink"); symlinkCase != nil &&
			strings.Contains(symlinkCase.Stdout.Text, "completionMarker=symlink") {
			result.Findings = append(result.Findings,
				"direct runner launch followed a symlink to the valid disk; Capsule preflight rejected the same path")
		}
	}

	invalidExecutable := runCase("guest.invalid-executable", configuration.runner,
		[]string{configuration.disk, configuration.launcher, "/definitely/missing/capsule"}, 5*time.Second)
	result.Cases = append(result.Cases, invalidExecutable)
	if !invalidExecutable.ProcessGone {
		result.Failures = append(result.Failures, "invalid guest executable did not fail closed")
	}
	if invalidExecutable.ExitCode == 0 {
		result.Findings = append(result.Findings,
			"runner returned zero after the trusted launcher rejected a missing guest executable")
	}

	runtimeFixtures, runtimeErr := createInvalidRuntimeFixtures(configuration.work, configuration.runner)
	if runtimeErr != nil {
		result.Failures = append(result.Failures, "invalid runtime fixture creation: "+runtimeErr.Error())
	} else {
		for name, runner := range runtimeFixtures {
			caseValue := runCase("runtime."+name, runner,
				[]string{configuration.disk, configuration.launcher, configuration.guest, "completion-marker", name}, 3*time.Second)
			result.Cases = append(result.Cases, caseValue)
			if strings.Contains(caseValue.Stdout.Text, "completionMarker="+name) || !caseValue.ProcessGone {
				result.Failures = append(result.Failures, "invalid runtime bytes executed a guest: "+name)
			}
		}
	}

	identityCases, identityFailures := runIdentitySuite(configuration)
	result.IdentityCases = identityCases
	result.Failures = append(result.Failures, identityFailures...)
	result.CompletedAt = time.Now().UTC().Format(time.RFC3339Nano)

	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		fatalf("encode report: %v", err)
	}
	if len(result.Failures) != 0 {
		os.Exit(1)
	}
}

func parseOptions(arguments []string) (options, error) {
	var result options
	for len(arguments) > 0 {
		if len(arguments) < 2 {
			return options{}, errors.New("options require a value")
		}
		value := arguments[1]
		switch arguments[0] {
		case "--runner":
			result.runner = value
		case "--disk":
			result.disk = value
		case "--launcher":
			result.launcher = value
		case "--guest":
			result.guest = value
		case "--identity":
			result.identity = value
		case "--work":
			result.work = value
		default:
			return options{}, fmt.Errorf("unknown option %s", arguments[0])
		}
		arguments = arguments[2:]
	}
	if result.runner == "" || result.disk == "" || result.launcher == "" || result.guest == "" || result.identity == "" || result.work == "" {
		return options{}, errors.New("usage: harness --runner PATH --disk PATH --launcher PATH --guest PATH --identity PATH --work DIRECTORY")
	}
	return result, nil
}

func runCase(name string, executable string, arguments []string, timeout time.Duration) caseResult {
	started := time.Now()
	result := caseResult{Name: name, ExitCode: -1}
	command := exec.Command(executable, arguments...)
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		result.StartError = err.Error()
		return result
	}
	stderrPipe, err := command.StderrPipe()
	if err != nil {
		result.StartError = err.Error()
		return result
	}
	stdout := newCappedCapture(captureLimit)
	stderr := newCappedCapture(captureLimit)
	if err := command.Start(); err != nil {
		result.StartError = err.Error()
		result.DurationMS = time.Since(started).Milliseconds()
		return result
	}
	result.PID = command.Process.Pid
	var drains sync.WaitGroup
	drains.Add(2)
	go func() { defer drains.Done(); _, _ = io.Copy(stdout, stdoutPipe) }()
	go func() { defer drains.Done(); _, _ = io.Copy(stderr, stderrPipe) }()

	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	var waitErr error
	select {
	case waitErr = <-done:
	case <-time.After(timeout):
		result.TimedOut = true
		_ = command.Process.Signal(syscall.SIGTERM)
		select {
		case waitErr = <-done:
		case <-time.After(350 * time.Millisecond):
			result.ForcedKill = true
			_ = command.Process.Kill()
			waitErr = <-done
		}
	}
	drains.Wait()
	result.DurationMS = time.Since(started).Milliseconds()
	result.Stdout = stdout.summary()
	result.Stderr = stderr.summary()
	result.ProcessGone = errors.Is(command.Process.Signal(syscall.Signal(0)), os.ErrProcessDone)
	if command.ProcessState != nil {
		if status, ok := command.ProcessState.Sys().(syscall.WaitStatus); ok {
			if status.Signaled() {
				result.Signal = status.Signal().String()
			} else {
				result.ExitCode = status.ExitStatus()
			}
		}
	}
	if waitErr == nil && result.ExitCode == -1 {
		result.ExitCode = 0
	}
	return result
}

func runForcedKillCase(name string, executable string, arguments []string, delay time.Duration) caseResult {
	started := time.Now()
	result := caseResult{Name: name, ExitCode: -1, ForcedKill: true}
	command := exec.Command(executable, arguments...)
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		result.StartError = err.Error()
		return result
	}
	stderrPipe, err := command.StderrPipe()
	if err != nil {
		result.StartError = err.Error()
		return result
	}
	stdout := newCappedCapture(captureLimit)
	stderr := newCappedCapture(captureLimit)
	if err := command.Start(); err != nil {
		result.StartError = err.Error()
		result.DurationMS = time.Since(started).Milliseconds()
		return result
	}
	result.PID = command.Process.Pid
	var drains sync.WaitGroup
	drains.Add(2)
	go func() { defer drains.Done(); _, _ = io.Copy(stdout, stdoutPipe) }()
	go func() { defer drains.Done(); _, _ = io.Copy(stderr, stderrPipe) }()
	time.Sleep(delay)
	_ = command.Process.Kill()
	waitErr := command.Wait()
	drains.Wait()
	result.DurationMS = time.Since(started).Milliseconds()
	result.Stdout = stdout.summary()
	result.Stderr = stderr.summary()
	result.ProcessGone = errors.Is(command.Process.Signal(syscall.Signal(0)), os.ErrProcessDone)
	if command.ProcessState != nil {
		if status, ok := command.ProcessState.Sys().(syscall.WaitStatus); ok {
			if status.Signaled() {
				result.Signal = status.Signal().String()
			} else {
				result.ExitCode = status.ExitStatus()
			}
		}
	}
	if waitErr == nil && result.ExitCode == -1 {
		result.ExitCode = 0
	}
	return result
}

func findCase(cases []caseResult, name string) *caseResult {
	for index := range cases {
		if cases[index].Name == name {
			return &cases[index]
		}
	}
	return nil
}

func createMalformedFixtures(directory string, validDisk string) (map[string]string, error) {
	fixtures := make(map[string]string)
	empty := filepath.Join(directory, "empty.raw")
	if err := os.WriteFile(empty, nil, 0o444); err != nil {
		return nil, err
	}
	fixtures["empty"] = empty

	random := filepath.Join(directory, "deterministic-random.raw")
	pattern := bytes.Repeat([]byte{0x43, 0x41, 0x50, 0x53, 0x55, 0x4c, 0x45, 0xff}, 128*1024)
	if err := os.WriteFile(random, pattern, 0o444); err != nil {
		return nil, err
	}
	fixtures["random-1mib"] = random

	truncated := filepath.Join(directory, "truncated.raw")
	if err := copyPrefix(validDisk, truncated, 4*1024*1024); err != nil {
		return nil, err
	}
	fixtures["truncated-4mib"] = truncated

	corrupt := filepath.Join(directory, "corrupt-superblock.raw")
	if err := copyFile(validDisk, corrupt); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(corrupt, os.O_WRONLY, 0)
	if err != nil {
		return nil, err
	}
	zeroes := make([]byte, 2048)
	_, writeErr := file.WriteAt(zeroes, 1024)
	closeErr := file.Close()
	if writeErr != nil {
		return nil, writeErr
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if err := os.Chmod(corrupt, 0o444); err != nil {
		return nil, err
	}
	fixtures["corrupt-superblock"] = corrupt

	sparse := filepath.Join(directory, "sparse-8gib.raw")
	sparseFile, err := os.OpenFile(sparse, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o444)
	if err != nil {
		return nil, err
	}
	if err := sparseFile.Truncate(8 * 1024 * 1024 * 1024); err != nil {
		_ = sparseFile.Close()
		return nil, err
	}
	if err := sparseFile.Close(); err != nil {
		return nil, err
	}
	fixtures["sparse-8gib"] = sparse

	fixtures["missing"] = filepath.Join(directory, "missing.raw")
	directoryFixture := filepath.Join(directory, "directory.raw")
	if err := os.Mkdir(directoryFixture, 0o500); err != nil {
		return nil, err
	}
	fixtures["directory"] = directoryFixture
	symlink := filepath.Join(directory, "symlink.raw")
	if err := os.Symlink(validDisk, symlink); err != nil {
		return nil, err
	}
	fixtures["symlink"] = symlink
	return fixtures, nil
}

func createInvalidRuntimeFixtures(directory string, validRunner string) (map[string]string, error) {
	fixtures := make(map[string]string)
	missingDirectory := filepath.Join(directory, "runtime-missing")
	if err := os.Mkdir(missingDirectory, 0o700); err != nil {
		return nil, err
	}
	missingRunner := filepath.Join(missingDirectory, "capsule-krun-runner")
	if err := copyFile(validRunner, missingRunner); err != nil {
		return nil, err
	}
	if err := os.Chmod(missingRunner, 0o755); err != nil {
		return nil, err
	}
	fixtures["missing-libraries"] = missingRunner

	corruptDirectory := filepath.Join(directory, "runtime-corrupt")
	corruptLibraryDirectory := filepath.Join(corruptDirectory, "lib")
	if err := os.MkdirAll(corruptLibraryDirectory, 0o700); err != nil {
		return nil, err
	}
	corruptRunner := filepath.Join(corruptDirectory, "capsule-krun-runner")
	if err := copyFile(validRunner, corruptRunner); err != nil {
		return nil, err
	}
	if err := os.Chmod(corruptRunner, 0o755); err != nil {
		return nil, err
	}
	validLibrary := filepath.Join(filepath.Dir(validRunner), "lib", "libkrun.1.19.4.dylib")
	corruptLibrary := filepath.Join(corruptLibraryDirectory, "libkrun.1.19.4.dylib")
	if err := copyFile(validLibrary, corruptLibrary); err != nil {
		return nil, err
	}
	if err := os.Symlink("libkrun.1.19.4.dylib", filepath.Join(corruptLibraryDirectory, "libkrun.1.dylib")); err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(corruptLibraryDirectory, "libkrunfw.5.dylib"),
		[]byte("deliberately invalid libkrunfw fixture\n"), 0o400); err != nil {
		return nil, err
	}
	fixtures["corrupt-firmware-library"] = corruptRunner
	return fixtures, nil
}

func copyPrefix(source string, destination string, limit int64) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o444)
	if err != nil {
		return err
	}
	_, copyErr := io.CopyN(output, input, limit)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyFile(source string, destination string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func runIdentitySuite(configuration options) ([]identityResult, []string) {
	var results []identityResult
	var failures []string

	exact, exactFailure := liveIdentityCase("identity.exact", configuration.runner, configuration.runner, false, configuration)
	results = append(results, exact)
	if exactFailure != "" {
		failures = append(failures, exactFailure)
	}

	copyPath := filepath.Join(configuration.work, "capsule-krun-runner-copy")
	if err := copyFile(configuration.runner, copyPath); err != nil {
		failures = append(failures, "copy runner for path substitution: "+err.Error())
	} else if err := os.Chmod(copyPath, 0o755); err != nil {
		failures = append(failures, "chmod copied runner: "+err.Error())
	} else if err := os.Symlink(filepath.Join(filepath.Dir(configuration.runner), "lib"),
		filepath.Join(configuration.work, "lib")); err != nil {
		failures = append(failures, "link copied runner libraries: "+err.Error())
	} else {
		wrongPath, wrongPathFailure := liveIdentityCase("identity.wrong-path", copyPath, configuration.runner, false, configuration)
		results = append(results, wrongPath)
		if wrongPathFailure != "" {
			failures = append(failures, wrongPathFailure)
		}
		if wrongPath.TupleAccepted {
			failures = append(failures, "wrong-path signed runner tuple accepted")
		}
	}

	wrongStart, wrongStartFailure := liveIdentityCase("identity.wrong-start", configuration.runner, configuration.runner, true, configuration)
	results = append(results, wrongStart)
	if wrongStartFailure != "" {
		failures = append(failures, wrongStartFailure)
	}
	if wrongStart.TupleAccepted {
		failures = append(failures, "wrong-start runner tuple accepted")
	}

	sleeper := exec.Command("/bin/sleep", "5")
	if err := sleeper.Start(); err != nil {
		failures = append(failures, "start wrong-code identity control: "+err.Error())
	} else {
		output, helperErr := exec.Command(configuration.identity, strconv.Itoa(sleeper.Process.Pid)).CombinedOutput()
		_ = sleeper.Process.Kill()
		_ = sleeper.Wait()
		fields := parseFields(string(output))
		item := identityResult{
			Name:           "identity.wrong-code",
			HelperAccepted: helperErr == nil,
			TupleAccepted:  false,
			ExpectedPath:   configuration.runner,
			ObservedPath:   fields["path"],
			ObservedStart:  fields["startSec"] + ":" + fields["startUsec"],
			Requirement:    fields["codeRequirement"],
			Output:         string(output),
		}
		results = append(results, item)
		if helperErr == nil || fields["codeRequirement"] == "valid" {
			failures = append(failures, "wrong-code process passed exact code requirement")
		}
	}
	return results, failures
}

func liveIdentityCase(name string, launchedPath string, expectedPath string, alterStart bool, configuration options) (identityResult, string) {
	arguments := []string{configuration.disk, configuration.launcher, configuration.guest, "hang"}
	command := exec.Command(launchedPath, arguments...)
	stdout, _ := command.StdoutPipe()
	stderr, _ := command.StderrPipe()
	if err := command.Start(); err != nil {
		return identityResult{Name: name, ExpectedPath: expectedPath}, name + " start: " + err.Error()
	}
	go func() { _, _ = io.Copy(io.Discard, stdout) }()
	go func() { _, _ = io.Copy(io.Discard, stderr) }()
	time.Sleep(300 * time.Millisecond)
	output, helperErr := exec.Command(configuration.identity, strconv.Itoa(command.Process.Pid)).CombinedOutput()
	fields := parseFields(string(output))
	expectedSec := fields["startSec"]
	expectedUsec := fields["startUsec"]
	if alterStart {
		seconds, _ := strconv.ParseInt(expectedSec, 10, 64)
		expectedSec = strconv.FormatInt(seconds+1, 10)
	}
	expectedAbsolute, _ := filepath.Abs(expectedPath)
	accepted := helperErr == nil && fields["codeRequirement"] == "valid" &&
		fields["path"] == expectedAbsolute && fields["startSec"] == expectedSec &&
		fields["startUsec"] == expectedUsec
	_ = command.Process.Signal(syscall.SIGTERM)
	done := make(chan error, 1)
	go func() { done <- command.Wait() }()
	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		_ = command.Process.Kill()
		<-done
	}
	item := identityResult{
		Name:           name,
		HelperAccepted: helperErr == nil,
		TupleAccepted:  accepted,
		ExpectedPath:   expectedAbsolute,
		ObservedPath:   fields["path"],
		ExpectedStart:  expectedSec + ":" + expectedUsec,
		ObservedStart:  fields["startSec"] + ":" + fields["startUsec"],
		Requirement:    fields["codeRequirement"],
		Output:         string(output),
	}
	if name == "identity.exact" && !accepted {
		return item, "exact live runner identity tuple rejected"
	}
	if name != "identity.exact" && helperErr != nil {
		return item, name + " could not establish that the copied/live code requirement remained valid"
	}
	return item, ""
}

func parseFields(output string) map[string]string {
	result := make(map[string]string)
	for _, line := range strings.Split(output, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			result[key] = value
		}
	}
	return result
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func fatalf(format string, arguments ...any) {
	fmt.Fprintf(os.Stderr, "harness: "+format+"\n", arguments...)
	os.Exit(2)
}
