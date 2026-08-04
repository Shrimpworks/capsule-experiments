package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type attemptRecord struct {
	Attempt     string `json:"attempt"`
	Phase       string `json:"phase"`
	PID         int    `json:"pid"`
	Identity    string `json:"identity"`
	Profile     string `json:"profile"`
	StartedUnix int64  `json:"startedUnixNano"`
}

type streamSummary struct {
	Mode          string `json:"mode"`
	ObservedBytes int64  `json:"observedBytes"`
	RetainedBytes int64  `json:"retainedBytes"`
	CapturePath   string `json:"capturePath,omitempty"`
	Truncated     bool   `json:"truncated"`
	ReadError     string `json:"readError,omitempty"`
}

type runSummary struct {
	Attempt                    string        `json:"attempt"`
	Outcome                    string        `json:"outcome"`
	Termination                string        `json:"termination"`
	RunnerPID                  int           `json:"runnerPid"`
	Profile                    string        `json:"profile"`
	WallLimitMillis            int64         `json:"wallLimitMillis"`
	CancelAfterMillis          int64         `json:"cancelAfterMillis,omitempty"`
	GraceMillis                int64         `json:"graceMillis"`
	ControlReadyMillis         int64         `json:"controlReadyMillis"`
	DeadlineActionMillis       int64         `json:"deadlineActionMillis,omitempty"`
	DeadlineOvershootMillis    int64         `json:"deadlineOvershootMillis,omitempty"`
	ElapsedMillis              int64         `json:"elapsedMillis"`
	TeardownMillis             int64         `json:"teardownMillis,omitempty"`
	IdentityVerifiedAtStart    bool          `json:"identityVerifiedAtStart"`
	IdentityVerifiedBeforeTerm bool          `json:"identityVerifiedBeforeTerm"`
	IdentityVerifiedBeforeKill bool          `json:"identityVerifiedBeforeKill"`
	ExitCode                   int           `json:"exitCode"`
	ExitSignal                 string        `json:"exitSignal,omitempty"`
	RunnerUserCPUZero          bool          `json:"runnerUserCPUZero"`
	RunnerUserCPUMillis        int64         `json:"runnerUserCpuMillis"`
	RunnerSystemCPUMillis      int64         `json:"runnerSystemCpuMillis"`
	RunnerMaxRSSBytes          int64         `json:"runnerMaxRssBytes"`
	ControllerMaxRSSBytes      int64         `json:"controllerMaxRssBytes"`
	Stdout                     streamSummary `json:"stdout"`
	Stderr                     streamSummary `json:"stderr"`
	Error                      string        `json:"error,omitempty"`
}

type capture struct {
	name   string
	mode   string
	limit  int64
	stall  time.Duration
	path   string
	reader *os.File
	writer *os.File
	done   chan streamSummary
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "recover" {
		recoverMain(os.Args[2:])
		return
	}
	runMain(os.Args[1:])
}

func runMain(arguments []string) {
	flags := flag.NewFlagSet("controller", flag.ExitOnError)
	recordPath := flags.String("record", "", "durable attempt record")
	summaryPath := flags.String("summary", "", "terminal summary")
	identityHelper := flags.String("identity", "", "live process identity helper")
	runner := flags.String("runner", "", "signed runner")
	rootDisk := flags.String("disk", "", "immutable root disk")
	attempt := flags.String("attempt", "spike-attempt", "attempt identifier")
	profile := flags.String("profile", "vcpu1-mem256", "closed exact profile")
	terminationMode := flags.String("runner-termination", "graceful", "graceful or ignore")
	wall := flags.Duration("wall", 3*time.Second, "external wall deadline")
	cancelAfter := flags.Duration("cancel-after", 0, "external cancellation time")
	grace := flags.Duration("grace", 300*time.Millisecond, "grace before exact forced kill")
	captureLimit := flags.Int64("capture-limit", 65536, "bytes retained per stream")
	captureMode := flags.String("capture-mode", "drain", "drain, stall, or close")
	readerStall := flags.Duration("reader-stall", 0, "intentional reader stall")
	if err := flags.Parse(arguments); err != nil {
		fatalf("parse flags: %v", err)
	}
	guestArgs := flags.Args()
	if *recordPath == "" || *summaryPath == "" || *identityHelper == "" ||
		*runner == "" || *rootDisk == "" || len(guestArgs) == 0 {
		fatalf("record, summary, identity, runner, disk, and guest executable are required")
	}
	if *wall <= 0 || *grace < 0 || *captureLimit < 0 {
		fatalf("wall/capture limits must be positive and grace non-negative")
	}
	if *captureMode != "drain" && *captureMode != "stall" && *captureMode != "close" {
		fatalf("unsupported capture mode %q", *captureMode)
	}
	if *terminationMode != "graceful" && *terminationMode != "ignore" {
		fatalf("unsupported runner termination mode %q", *terminationMode)
	}

	captureDirectory := filepath.Dir(*summaryPath)
	stdoutCapture, err := newCapture("stdout", *captureMode, *captureLimit,
		*readerStall, filepath.Join(captureDirectory, *attempt+".stdout.capture"))
	if err != nil {
		fatalf("stdout capture: %v", err)
	}
	stderrCapture, err := newCapture("stderr", *captureMode, *captureLimit,
		*readerStall, filepath.Join(captureDirectory, *attempt+".stderr.capture"))
	if err != nil {
		fatalf("stderr capture: %v", err)
	}

	controlReader, controlWriter, err := os.Pipe()
	if err != nil {
		fatalf("control pipe: %v", err)
	}
	runnerArgs := []string{"--control-fd", "3", "--profile", *profile,
		"--termination", *terminationMode, *rootDisk}
	runnerArgs = append(runnerArgs, guestArgs...)
	command := exec.Command(*runner, runnerArgs...)
	command.ExtraFiles = []*os.File{controlReader}
	command.Stdout = stdoutCapture.writer
	command.Stderr = stderrCapture.writer
	start := time.Now()
	if err := command.Start(); err != nil {
		fatalf("start runner: %v", err)
	}
	_ = controlReader.Close()
	_ = stdoutCapture.writer.Close()
	_ = stderrCapture.writer.Close()
	stdoutCapture.start()
	stderrCapture.start()

	pid := command.Process.Pid
	fmt.Printf("CONTROLLER_PHASE phase=before-record runnerPid=%d\n", pid)
	pauseIfRequested("before-record")

	identity, err := readIdentity(*identityHelper, pid)
	if err != nil {
		_ = controlWriter.Close()
		_ = command.Wait()
		fatalf("verify runner identity: %v", err)
	}
	record := attemptRecord{
		Attempt: *attempt, Phase: "create-committed", PID: pid,
		Identity: identity, Profile: *profile, StartedUnix: start.UnixNano(),
	}
	if err := writeDurableJSON(*recordPath, record); err != nil {
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
	record.Phase = "started"
	if err := replaceDurableJSON(*recordPath, record); err != nil {
		fatalf("update durable attempt: %v", err)
	}
	fmt.Printf("CONTROLLER_PHASE phase=after-go runnerPid=%d\n", pid)
	pauseIfRequested("after-go")

	waitChannel := make(chan error, 1)
	go func() { waitChannel <- command.Wait() }()

	cause := "wall-timeout"
	deadline := *wall
	if *cancelAfter > 0 && *cancelAfter < deadline {
		cause = "cancelled"
		deadline = *cancelAfter
	}
	timerArmed := time.Now()
	timer := time.NewTimer(deadline)
	termination := "natural"
	identityBeforeTerm := false
	identityBeforeKill := false
	teardownMillis := int64(0)
	var waitErr error
	var terminalErr error
	var deadlineActionMillis int64
	var deadlineOvershootMillis int64

	select {
	case waitErr = <-waitChannel:
		timer.Stop()
		cause = "exited"
	case <-timer.C:
		causeAt := time.Now()
		deadlineActionMillis = causeAt.Sub(timerArmed).Milliseconds()
		deadlineOvershootMillis = deadlineActionMillis - deadline.Milliseconds()
		identityBeforeTerm, terminalErr = signalVerified(*identityHelper, record,
			syscall.SIGTERM)
		if terminalErr != nil {
			termination = "unresolved"
			cause = "unresolved"
			select {
			case waitErr = <-waitChannel:
			case <-time.After(100 * time.Millisecond):
			}
		} else {
			termination = "graceful-signal"
			graceTimer := time.NewTimer(*grace)
			select {
			case waitErr = <-waitChannel:
				graceTimer.Stop()
			case <-graceTimer.C:
				identityBeforeKill, terminalErr = signalVerified(*identityHelper, record,
					syscall.SIGKILL)
				if terminalErr != nil {
					termination = "unresolved"
					cause = "unresolved"
				} else {
					termination = "forced-kill"
					waitErr = <-waitChannel
				}
			}
		}
		teardownMillis = time.Since(causeAt).Milliseconds()
	}

	stdoutSummary := <-stdoutCapture.done
	stderrSummary := <-stderrCapture.done
	if cause == "exited" && *captureMode == "close" {
		cause = "console-error"
		termination = "console-error"
	}
	summary := runSummary{
		Attempt: *attempt, Outcome: cause, Termination: termination, RunnerPID: pid,
		Profile: *profile, WallLimitMillis: (*wall).Milliseconds(),
		CancelAfterMillis: (*cancelAfter).Milliseconds(), GraceMillis: (*grace).Milliseconds(),
		ControlReadyMillis:      timerArmed.Sub(start).Milliseconds(),
		DeadlineActionMillis:    deadlineActionMillis,
		DeadlineOvershootMillis: deadlineOvershootMillis,
		ElapsedMillis:           time.Since(start).Milliseconds(), TeardownMillis: teardownMillis,
		IdentityVerifiedAtStart: true, IdentityVerifiedBeforeTerm: identityBeforeTerm,
		IdentityVerifiedBeforeKill: identityBeforeKill, ExitCode: exitCode(command.ProcessState),
		ExitSignal: exitSignal(command.ProcessState), Stdout: stdoutSummary, Stderr: stderrSummary,
	}
	populateUsage(&summary, command.ProcessState)
	if waitErr != nil {
		summary.Error = waitErr.Error()
	}
	if terminalErr != nil {
		summary.Error = terminalErr.Error()
	}
	if err := replaceDurableJSON(*summaryPath, summary); err != nil {
		fatalf("write summary: %v", err)
	}
	fmt.Printf("CONTROLLER_TERMINAL attempt=%s outcome=%s termination=%s pid=%d\n",
		*attempt, cause, termination, pid)
	if cause == "unresolved" {
		os.Exit(2)
	}
}

func recoverMain(arguments []string) {
	flags := flag.NewFlagSet("recover", flag.ExitOnError)
	recordPath := flags.String("record", "", "durable attempt record")
	summaryPath := flags.String("summary", "", "recovery summary")
	identityHelper := flags.String("identity", "", "live process identity helper")
	grace := flags.Duration("grace", 250*time.Millisecond, "grace before forced kill")
	if err := flags.Parse(arguments); err != nil {
		fatalf("parse recovery flags: %v", err)
	}
	if *recordPath == "" || *summaryPath == "" || *identityHelper == "" {
		fatalf("recovery record, summary, and identity are required")
	}
	bytes, err := os.ReadFile(*recordPath)
	if err != nil {
		fatalf("read record: %v", err)
	}
	var record attemptRecord
	if err := json.Unmarshal(bytes, &record); err != nil {
		fatalf("decode record: %v", err)
	}
	started := time.Now()
	if err := syscall.Kill(record.PID, 0); errors.Is(err, syscall.ESRCH) {
		summary := runSummary{
			Attempt: record.Attempt, Outcome: "recovered-absent",
			Termination: "already-absent", RunnerPID: record.PID,
			Profile: record.Profile, ElapsedMillis: time.Since(started).Milliseconds(),
			ExitCode: -1,
		}
		if err := replaceDurableJSON(*summaryPath, summary); err != nil {
			fatalf("write absent recovery summary: %v", err)
		}
		fmt.Printf("RECOVERY_TERMINAL attempt=%s termination=already-absent pid=%d\n",
			record.Attempt, record.PID)
		return
	}
	verifiedTerm, err := signalVerified(*identityHelper, record, syscall.SIGTERM)
	if err != nil {
		fatalf("recovery verify/SIGTERM: %v", err)
	}
	termination := "graceful-signal"
	verifiedKill := false
	if !waitGone(record.PID, *grace) {
		verifiedKill, err = signalVerified(*identityHelper, record, syscall.SIGKILL)
		if err != nil {
			fatalf("recovery verify/SIGKILL: %v", err)
		}
		termination = "forced-kill"
		if !waitGone(record.PID, 2*time.Second) {
			fatalf("recorded runner remains after exact forced kill")
		}
	}
	summary := runSummary{
		Attempt: record.Attempt, Outcome: "recovered", Termination: termination,
		RunnerPID: record.PID, Profile: record.Profile,
		ElapsedMillis:           time.Since(started).Milliseconds(),
		TeardownMillis:          time.Since(started).Milliseconds(),
		IdentityVerifiedAtStart: true, IdentityVerifiedBeforeTerm: verifiedTerm,
		IdentityVerifiedBeforeKill: verifiedKill, ExitCode: -1,
	}
	if err := replaceDurableJSON(*summaryPath, summary); err != nil {
		fatalf("write recovery summary: %v", err)
	}
	fmt.Printf("RECOVERY_TERMINAL attempt=%s termination=%s pid=%d\n",
		record.Attempt, termination, record.PID)
}

func newCapture(name, mode string, limit int64, stall time.Duration, path string) (*capture, error) {
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	return &capture{name: name, mode: mode, limit: limit, stall: stall, path: path,
		reader: reader, writer: writer, done: make(chan streamSummary, 1)}, nil
}

func (capture *capture) start() {
	if capture.mode == "close" {
		go func() {
			if capture.stall > 0 {
				time.Sleep(capture.stall)
			}
			_ = capture.reader.Close()
			capture.done <- streamSummary{Mode: capture.mode}
		}()
		return
	}
	go func() {
		if capture.mode == "stall" && capture.stall > 0 {
			time.Sleep(capture.stall)
		}
		capture.done <- drainBounded(capture.reader, capture.mode, capture.limit, capture.path)
	}()
}

func drainBounded(reader *os.File, mode string, limit int64, path string) streamSummary {
	defer reader.Close()
	result := streamSummary{Mode: mode, CapturePath: filepath.Base(path)}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		result.ReadError = err.Error()
		return result
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		result.ReadError = err.Error()
		return result
	}
	defer file.Close()
	buffer := make([]byte, 32768)
	for {
		count, readErr := reader.Read(buffer)
		if count > 0 {
			result.ObservedBytes += int64(count)
			remaining := limit - result.RetainedBytes
			if remaining > 0 {
				keep := int64(count)
				if keep > remaining {
					keep = remaining
				}
				written, writeErr := file.Write(buffer[:keep])
				result.RetainedBytes += int64(written)
				if writeErr != nil {
					result.ReadError = writeErr.Error()
					return result
				}
			}
		}
		if readErr != nil {
			if !errors.Is(readErr, io.EOF) {
				result.ReadError = readErr.Error()
			}
			break
		}
	}
	result.Truncated = result.ObservedBytes > result.RetainedBytes
	if result.Truncated {
		marker := fmt.Sprintf("\n[CAPSULE_TRUNCATED stream=%s limit_bytes=%d observed_bytes=%d]\n",
			filepath.Base(strings.TrimSuffix(path, ".capture")), limit, result.ObservedBytes)
		_, _ = file.WriteString(marker)
	}
	return result
}

func readIdentity(helper string, pid int) (string, error) {
	var lastErr error
	for attempt := 0; attempt < 100; attempt++ {
		output, err := exec.Command(helper, strconv.Itoa(pid)).CombinedOutput()
		if err == nil && bytes.Contains(output, []byte("codeRequirement=valid")) {
			return string(output), nil
		}
		lastErr = fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
		time.Sleep(10 * time.Millisecond)
	}
	return "", lastErr
}

func signalVerified(helper string, record attemptRecord, signal syscall.Signal) (bool, error) {
	identity, err := readIdentity(helper, record.PID)
	if err != nil {
		return false, fmt.Errorf("identity unavailable before %s: %w", signal, err)
	}
	if !sameImmutableIdentity(record.Identity, identity) {
		return false, fmt.Errorf("identity mismatch before %s", signal)
	}
	if err := syscall.Kill(record.PID, signal); err != nil {
		return false, fmt.Errorf("send %s to exact runner: %w", signal, err)
	}
	return true, nil
}

func pauseIfRequested(phase string) {
	if os.Getenv("CAPSULE_CONTROLLER_PAUSE") != phase {
		return
	}
	if delay := os.Getenv("CAPSULE_CONTROLLER_PAUSE_DELAY"); delay != "" {
		parsed, err := time.ParseDuration(delay)
		if err != nil {
			fatalf("invalid CAPSULE_CONTROLLER_PAUSE_DELAY: %v", err)
		}
		time.Sleep(parsed)
	}
	fmt.Printf("CONTROLLER_PAUSED phase=%s\n", phase)
	for {
		time.Sleep(time.Second)
	}
}

func sameImmutableIdentity(recorded, live string) bool {
	recordedFields := identityFields(recorded)
	liveFields := identityFields(live)
	for _, key := range []string{
		"pid", "startSec", "startUsec", "uid", "gid", "path",
		"codeIdentifier", "teamIdentifier", "cdhash", "codeRequirement",
	} {
		if recordedFields[key] == "" || recordedFields[key] != liveFields[key] {
			return false
		}
	}
	return true
}

func identityFields(identity string) map[string]string {
	fields := make(map[string]string)
	for _, line := range strings.Split(identity, "\n") {
		key, value, ok := strings.Cut(line, "=")
		if ok {
			fields[key] = value
		}
	}
	return fields
}

func writeDurableJSON(path string, value any) error {
	if _, err := os.Stat(path); err == nil {
		return fmt.Errorf("refusing to overwrite %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return durableJSON(path, value)
}

func replaceDurableJSON(path string, value any) error {
	return durableJSON(path, value)
}

func durableJSON(path string, value any) error {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	bytes, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	bytes = append(bytes, '\n')
	temporary := fmt.Sprintf("%s.tmp.%d", path, os.Getpid())
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

func exitCode(state *os.ProcessState) int {
	if state == nil {
		return -1
	}
	return state.ExitCode()
}

func exitSignal(state *os.ProcessState) string {
	if state == nil {
		return ""
	}
	waitStatus, ok := state.Sys().(syscall.WaitStatus)
	if !ok || !waitStatus.Signaled() {
		return ""
	}
	return waitStatus.Signal().String()
}

func populateUsage(summary *runSummary, state *os.ProcessState) {
	if state != nil {
		summary.RunnerUserCPUMillis = state.UserTime().Milliseconds()
		summary.RunnerSystemCPUMillis = state.SystemTime().Milliseconds()
		summary.RunnerUserCPUZero = state.UserTime() == 0
		if usage, ok := state.SysUsage().(*syscall.Rusage); ok {
			summary.RunnerMaxRSSBytes = usage.Maxrss
		}
	}
	var controllerUsage syscall.Rusage
	if syscall.Getrusage(syscall.RUSAGE_SELF, &controllerUsage) == nil {
		summary.ControllerMaxRSSBytes = controllerUsage.Maxrss
	}
}

func waitGone(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return errors.Is(syscall.Kill(pid, 0), syscall.ESRCH)
}

func fatalf(format string, arguments ...any) {
	fmt.Fprintf(os.Stderr, "controller: "+format+"\n", arguments...)
	os.Exit(1)
}
