package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
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

type identity struct {
	PID            int    `json:"pid"`
	StartSec       uint64 `json:"startSec"`
	StartUsec      uint64 `json:"startUsec"`
	UID            uint64 `json:"uid"`
	GID            uint64 `json:"gid"`
	Path           string `json:"path"`
	CodeIdentifier string `json:"codeIdentifier"`
	TeamIdentifier string `json:"teamIdentifier"`
	CDHash         string `json:"cdhash"`
}

type attemptRecord struct {
	Version      int      `json:"version"`
	Attempt      string   `json:"attempt"`
	Phase        string   `json:"phase"`
	RunnerSHA256 string   `json:"runnerSha256"`
	RootSHA256   string   `json:"rootSha256"`
	Identity     identity `json:"identity"`
	CreatedAt    string   `json:"createdAt"`
	RecoveredAt  string   `json:"recoveredAt,omitempty"`
}

type configuration struct {
	stateDir           string
	identityHelper     string
	runner             string
	rootDisk           string
	expectedIdentifier string
	expectedTeam       string
	expectedCDHash     string
	guestArguments     []string
}

func main() {
	if len(os.Args) < 10 {
		fatalf("usage: supervisor STATE IDENTITY RUNNER ROOT IDENTIFIER TEAM CDHASH EXECUTABLE ARG [ARG ...]")
	}
	config := configuration{
		stateDir:           os.Args[1],
		identityHelper:     os.Args[2],
		runner:             os.Args[3],
		rootDisk:           os.Args[4],
		expectedIdentifier: os.Args[5],
		expectedTeam:       os.Args[6],
		expectedCDHash:     os.Args[7],
		guestArguments:     os.Args[8:],
	}
	for _, path := range []string{config.stateDir, config.identityHelper, config.runner, config.rootDisk} {
		if !filepath.IsAbs(path) {
			fatalf("refusing non-absolute sealed path %q", path)
		}
	}
	if err := os.MkdirAll(config.stateDir, 0o700); err != nil {
		fatalf("create state directory: %v", err)
	}
	lease, err := acquireLease(config.stateDir)
	if err != nil {
		fatalf("store lease: %v", err)
	}
	defer lease.Close()
	active := filepath.Join(config.stateDir, "active.json")
	if _, err := os.Stat(active); err == nil {
		if err := recoverAttempt(config, active); err != nil {
			fatalf("recovery unresolved: %v", err)
		}
		return
	} else if !errors.Is(err, os.ErrNotExist) {
		fatalf("inspect active record: %v", err)
	}
	if err := launchAttempt(config, active); err != nil {
		fatalf("launch refused: %v", err)
	}
}

func launchAttempt(config configuration, active string) error {
	runnerHash, err := sha256File(config.runner)
	if err != nil {
		return fmt.Errorf("hash runner: %w", err)
	}
	rootHash, err := sha256File(config.rootDisk)
	if err != nil {
		return fmt.Errorf("hash root disk: %w", err)
	}
	controlReader, controlWriter, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("control pipe: %w", err)
	}
	arguments := []string{"--control-fd", "3", config.rootDisk}
	arguments = append(arguments, config.guestArguments...)
	command := exec.Command(config.runner, arguments...)
	command.ExtraFiles = []*os.File{controlReader}
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err := command.Start(); err != nil {
		_ = controlReader.Close()
		_ = controlWriter.Close()
		return fmt.Errorf("start runner: %w", err)
	}
	_ = controlReader.Close()
	abort := func() {
		_ = controlWriter.Close()
		_ = command.Wait()
	}
	live, err := readIdentityEventually(config.identityHelper, command.Process.Pid)
	if err != nil {
		abort()
		return err
	}
	if err := validateExpected(config, live); err != nil {
		abort()
		return err
	}
	record := attemptRecord{
		Version:      1,
		Attempt:      fmt.Sprintf("attempt-%d", time.Now().UnixNano()),
		Phase:        "create-committed",
		RunnerSHA256: runnerHash,
		RootSHA256:   rootHash,
		Identity:     live,
		CreatedAt:    time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err := writeDurableJSON(active, record); err != nil {
		abort()
		return fmt.Errorf("durable record before start: %w", err)
	}
	if _, err := controlWriter.Write([]byte{'G'}); err != nil {
		_ = controlWriter.Close()
		return fmt.Errorf("authorize recorded runner: %w", err)
	}
	if err := controlWriter.Close(); err != nil {
		return fmt.Errorf("close authorization pipe: %w", err)
	}
	fmt.Printf("SUPERVISOR_LAUNCHED attempt=%s pid=%d\n", record.Attempt, live.PID)
	go func() {
		err := command.Wait()
		fmt.Printf("SUPERVISOR_RUNNER_EXIT pid=%d error=%v\n", live.PID, err)
	}()
	for {
		time.Sleep(time.Second)
	}
}

func recoverAttempt(config configuration, active string) error {
	record, err := readRecord(active)
	if err != nil {
		return fmt.Errorf("read active record: %w", err)
	}
	if record.Version != 1 || record.Phase != "create-committed" {
		return fmt.Errorf("unsupported record version/phase")
	}
	if err := validateExpected(config, record.Identity); err != nil {
		return fmt.Errorf("record identity not enrolled: %w", err)
	}
	currentHash, err := sha256File(config.runner)
	if err != nil {
		return fmt.Errorf("hash installed runner: %w", err)
	}
	if currentHash != record.RunnerSHA256 {
		return fmt.Errorf("installed runner bytes changed while recorded attempt remained active")
	}
	currentRootHash, err := sha256File(config.rootDisk)
	if err != nil {
		return fmt.Errorf("hash installed root disk: %w", err)
	}
	if currentRootHash != record.RootSHA256 {
		return fmt.Errorf("installed root disk bytes changed while recorded attempt remained active")
	}
	live, err := readIdentity(config.identityHelper, record.Identity.PID)
	if err != nil {
		if processAbsent(record.Identity.PID) {
			return terminalize(config, active, record, "gone-exact-process-absent")
		}
		return fmt.Errorf("recorded runner absent or unreadable; absence is not teardown evidence: %w", err)
	}
	if !sameIdentity(record.Identity, live) {
		return fmt.Errorf("live PID identity does not match durable record")
	}
	process, err := os.FindProcess(record.Identity.PID)
	if err != nil {
		return fmt.Errorf("find exact runner: %w", err)
	}
	if err := process.Signal(syscall.SIGTERM); err != nil {
		return fmt.Errorf("signal exact runner: %w", err)
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		observed, identityErr := readIdentity(config.identityHelper, record.Identity.PID)
		if identityErr != nil {
			if processAbsent(record.Identity.PID) {
				return terminalize(config, active, record, "reaped-exact")
			}
			time.Sleep(50 * time.Millisecond)
			continue
		}
		if !sameIdentity(record.Identity, observed) {
			return fmt.Errorf("PID identity changed after signal; exact runner absence is unresolved")
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("exact runner remained live after SIGTERM")
}

func processAbsent(pid int) bool {
	err := syscall.Kill(pid, 0)
	return errors.Is(err, syscall.ESRCH)
}

func acquireLease(stateDir string) (*os.File, error) {
	path := filepath.Join(stateDir, ".supervisor.lock")
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("another Supervisor holds %s: %w", path, err)
	}
	return file, nil
}

func terminalize(config configuration, active string, record attemptRecord, phase string) error {
	record.Phase = phase
	record.RecoveredAt = time.Now().UTC().Format(time.RFC3339Nano)
	terminal := filepath.Join(config.stateDir, "terminal-"+record.Attempt+".json")
	if err := writeDurableJSON(terminal, record); err != nil {
		return fmt.Errorf("persist terminal record: %w", err)
	}
	if err := os.Remove(active); err != nil {
		return fmt.Errorf("remove active record after terminal commit: %w", err)
	}
	if err := syncDirectory(config.stateDir); err != nil {
		return fmt.Errorf("sync active removal: %w", err)
	}
	fmt.Printf("SUPERVISOR_RECOVERED attempt=%s pid=%d result=%s\n", record.Attempt, record.Identity.PID, phase)
	return nil
}

func validateExpected(config configuration, observed identity) error {
	if observed.Path != filepath.Clean(config.runner) {
		return fmt.Errorf("path mismatch: %q", observed.Path)
	}
	if observed.CodeIdentifier != config.expectedIdentifier {
		return fmt.Errorf("identifier mismatch")
	}
	if observed.TeamIdentifier != config.expectedTeam {
		return fmt.Errorf("team mismatch: %q", observed.TeamIdentifier)
	}
	if observed.CDHash != strings.ToLower(config.expectedCDHash) {
		return fmt.Errorf("CDHash mismatch")
	}
	if observed.UID != uint64(os.Geteuid()) || observed.GID != uint64(os.Getegid()) {
		return fmt.Errorf("effective user/group mismatch")
	}
	return nil
}

func sameIdentity(expected, observed identity) bool {
	return expected.PID == observed.PID &&
		expected.StartSec == observed.StartSec &&
		expected.StartUsec == observed.StartUsec &&
		expected.UID == observed.UID && expected.GID == observed.GID &&
		expected.Path == observed.Path &&
		expected.CodeIdentifier == observed.CodeIdentifier &&
		expected.TeamIdentifier == observed.TeamIdentifier &&
		expected.CDHash == observed.CDHash
}

func readIdentityEventually(helper string, pid int) (identity, error) {
	var last error
	for attempt := 0; attempt < 100; attempt++ {
		value, err := readIdentity(helper, pid)
		if err == nil {
			return value, nil
		}
		last = err
		time.Sleep(20 * time.Millisecond)
	}
	return identity{}, fmt.Errorf("read live identity: %w", last)
}

func readIdentity(helper string, pid int) (identity, error) {
	output, err := exec.Command(helper, strconv.Itoa(pid)).CombinedOutput()
	if err != nil {
		return identity{}, fmt.Errorf("identity helper: %w: %s", err, strings.TrimSpace(string(output)))
	}
	fields := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		key, value, found := strings.Cut(scanner.Text(), "=")
		if found {
			fields[key] = value
		}
	}
	if err := scanner.Err(); err != nil {
		return identity{}, err
	}
	if fields["codeValidity"] != "valid" {
		return identity{}, fmt.Errorf("dynamic code validity failed")
	}
	parseUint := func(key string) (uint64, error) {
		value, ok := fields[key]
		if !ok {
			return 0, fmt.Errorf("missing %s", key)
		}
		return strconv.ParseUint(value, 10, 64)
	}
	parsedPID, err := parseUint("pid")
	if err != nil {
		return identity{}, err
	}
	startSec, err := parseUint("startSec")
	if err != nil {
		return identity{}, err
	}
	startUsec, err := parseUint("startUsec")
	if err != nil {
		return identity{}, err
	}
	uid, err := parseUint("uid")
	if err != nil {
		return identity{}, err
	}
	gid, err := parseUint("gid")
	if err != nil {
		return identity{}, err
	}
	for _, key := range []string{"path", "codeIdentifier", "teamIdentifier", "cdhash"} {
		if fields[key] == "" || fields[key] == "unavailable" {
			return identity{}, fmt.Errorf("missing identity field %s", key)
		}
	}
	return identity{
		PID:            int(parsedPID),
		StartSec:       startSec,
		StartUsec:      startUsec,
		UID:            uid,
		GID:            gid,
		Path:           fields["path"],
		CodeIdentifier: fields["codeIdentifier"],
		TeamIdentifier: fields["teamIdentifier"],
		CDHash:         strings.ToLower(fields["cdhash"]),
	}, nil
}

func sha256File(path string) (string, error) {
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

func readRecord(path string) (attemptRecord, error) {
	file, err := os.Open(path)
	if err != nil {
		return attemptRecord{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var record attemptRecord
	if err := decoder.Decode(&record); err != nil {
		return attemptRecord{}, err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return attemptRecord{}, fmt.Errorf("trailing record data")
	}
	return record, nil
}

func writeDurableJSON(path string, value any) error {
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
	return syncDirectory(filepath.Dir(path))
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func fatalf(format string, arguments ...any) {
	fmt.Fprintf(os.Stderr, "installed-recovery-supervisor: "+format+"\n", arguments...)
	os.Exit(1)
}
