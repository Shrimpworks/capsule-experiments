//go:build darwin

package sourcevalidatorv2_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"capsule.local/capsule/internal/protocol/sourcevalidatorpassive"
)

const (
	expectedArtifactSHA256 = "ba2a6b38be6b4eea8c067887cf80988756e2f4a551d128bf2dabdaf7f2ecb600"
	expectedArtifactBytes  = 1_146_656
	resultBytes            = sourcevalidatorpassive.ResultFrameBytes
	mechanicalWallDeadline = 2 * time.Second
)

type boundedCollector struct {
	mu       sync.Mutex
	bytes    []byte
	total    int64
	cap      int64
	overflow chan<- string
	label    string
	once     sync.Once
}

func (collector *boundedCollector) Write(value []byte) (int, error) {
	collector.mu.Lock()
	collector.total += int64(len(value))
	remaining := collector.cap + 1 - int64(len(collector.bytes))
	if remaining > 0 {
		keep := int64(len(value))
		if keep > remaining {
			keep = remaining
		}
		collector.bytes = append(collector.bytes, value[:keep]...)
	}
	overflowed := collector.total > collector.cap
	collector.mu.Unlock()
	if overflowed {
		collector.once.Do(func() {
			select {
			case collector.overflow <- collector.label:
			default:
			}
		})
	}
	return len(value), nil
}

func (collector *boundedCollector) snapshot() ([]byte, int64) {
	collector.mu.Lock()
	defer collector.mu.Unlock()
	return bytes.Clone(collector.bytes), collector.total
}

type runOptions struct {
	input          []byte
	leaveInputOpen bool
	outputCap      int64
	wallDeadline   time.Duration
	cancelAfter    time.Duration
}

type runOutcome struct {
	stdout    []byte
	stdoutN   int64
	stderr    []byte
	stderrN   int64
	waitErr   error
	status    syscall.WaitStatus
	killedFor string
}

func TestV2FixedArtifactAndMechanicalProcessProfile(t *testing.T) {
	if runtime.GOARCH != "arm64" {
		t.Skip("the retained V1 artifact is macOS arm64 only")
	}
	requireTool(t, "clang")
	requireTool(t, "codesign")

	paths := repositoryPaths(t)
	assertArtifactIdentity(t, paths.artifact)
	artifactProfile := mustRead(t, paths.artifactProfile)
	profileDigestValue := sourcevalidatorpassive.ArtifactProfileIdentityDigest(artifactProfile)
	profileDigest := hex.EncodeToString(profileDigestValue[:])
	validatorArgument := "--artifact-profile-digest=" + profileDigest

	buildRoot := t.TempDir()
	strictValidatorLauncher := buildStrictLauncher(t, paths.bootstrapSource, paths.artifact,
		validatorArgument, filepath.Join(buildRoot, "strict-validator-launcher"))
	validatorLauncher := buildLauncher(t, paths.bootstrapSource, paths.artifact,
		validatorArgument, filepath.Join(buildRoot, "validator-launcher"))

	t.Run("strict-address-space-profile-refuses-before-exec", func(t *testing.T) {
		requestBytes := mustRead(t, filepath.Join(paths.corpus,
			"mjs-source-validator", "request-ordinary.bin"))
		outcome := runProfile(t, strictValidatorLauncher, freshWorkingDirectory(t), runOptions{
			input: requestBytes, outputCap: resultBytes, wallDeadline: mechanicalWallDeadline,
		})
		if outcome.status.ExitStatus() != 75 || outcome.stdoutN != 0 || outcome.stderrN != 0 {
			t.Fatalf("strict RLIMIT_AS stop mismatch: status=%v stdout=%d stderr=%d",
				outcome.status, outcome.stdoutN, outcome.stderrN)
		}
		t.Log("RLIMIT_AS=256MiB returned EINVAL; target was not executed")
	})

	t.Run("fixed-launch-descriptor-ordinary-and-maximum", func(t *testing.T) {
		for _, name := range []string{"request-ordinary.bin", "request-exact-maximum.bin"} {
			requestBytes := mustRead(t, filepath.Join(paths.corpus, "mjs-source-validator", name))
			outcome := runProfile(t, validatorLauncher, freshWorkingDirectory(t), runOptions{
				input: requestBytes, outputCap: resultBytes, wallDeadline: mechanicalWallDeadline,
			})
			assertCleanExit(t, outcome)
			request, err := sourcevalidatorpassive.DecodeRequest(requestBytes)
			if err != nil {
				t.Fatalf("decode retained request: %v", err)
			}
			if _, err := sourcevalidatorpassive.VerifyResult(
				request, artifactProfile, outcome.stdout); err != nil {
				t.Fatalf("verify exact child result: %v", err)
			}
			t.Logf("%s: result=%d bytes, stderr=%d, wall<%s", name,
				outcome.stdoutN, outcome.stderrN, mechanicalWallDeadline)
		}
	})

	t.Run("fixed-environment-descriptors-and-unconfined-authority", func(t *testing.T) {
		root := t.TempDir()
		cwd := filepath.Join(root, "cwd")
		if err := os.Mkdir(cwd, 0o500); err != nil {
			t.Fatal(err)
		}
		sentinel := filepath.Join(root, "outside-cwd-sentinel")
		if err := os.WriteFile(sentinel, []byte("owned V2 probe sentinel\n"), 0o400); err != nil {
			t.Fatal(err)
		}
		probe := buildProbe(t, paths.probeSource, sentinel, filepath.Join(buildRoot, "profile-probe"))
		launcher := buildLauncher(t, paths.bootstrapSource, probe,
			"audit-authority", filepath.Join(buildRoot, "audit-launcher"))
		outcome := runProfile(t, launcher, cwd, runOptions{
			outputCap: 16, wallDeadline: mechanicalWallDeadline,
		})
		assertSuccessfulExit(t, outcome, 16)
		if len(outcome.stdout) != 16 || string(outcome.stdout[:8]) != "CAPV2PRB" {
			t.Fatalf("unexpected audit report: %x", outcome.stdout)
		}
		if outcome.stdout[8] != 0 || outcome.stdout[9] != 3 {
			t.Fatalf("environment/fd inventory mismatch: env=%d fds=%d",
				outcome.stdout[8], outcome.stdout[9])
		}
		if !bytes.Equal(outcome.stdout[10:15], []byte{1, 1, 1, 1, 1}) {
			t.Fatalf("expected controlled authority probes to demonstrate missing confinement: %v",
				outcome.stdout[10:15])
		}
		if outcome.stdout[15] != 1 {
			t.Fatalf("RLIMIT_NPROC did not refuse fork: %d", outcome.stdout[15])
		}
		t.Logf("env=0 fds=3 external-read=allowed inet-socket=allowed unix-socket=allowed cwd-chmod=allowed cwd-write=allowed fork=refused")
	})

	t.Run("unbounded-memory-counterevidence-and-other-resource-limits", func(t *testing.T) {
		root := t.TempDir()
		sentinel := filepath.Join(root, "sentinel")
		if err := os.WriteFile(sentinel, []byte("owned\n"), 0o400); err != nil {
			t.Fatal(err)
		}
		probe := buildProbe(t, paths.probeSource, sentinel, filepath.Join(buildRoot, "resource-probe"))

		memory := runProbe(t, paths.bootstrapSource, probe, "memory-limit", buildRoot,
			freshWorkingDirectory(t), runOptions{outputCap: 1, wallDeadline: mechanicalWallDeadline})
		assertSuccessfulExit(t, memory, 1)
		if !bytes.Equal(memory.stdout, []byte{0}) {
			t.Fatalf("expected explicit unbounded-memory mutation to permit 512 MiB mapping: %x",
				memory.stdout)
		}

		file := runProbe(t, paths.bootstrapSource, probe, "file-limit", buildRoot,
			freshWorkingDirectory(t), runOptions{outputCap: 0, wallDeadline: mechanicalWallDeadline})
		if !file.status.Signaled() || file.status.Signal() != syscall.SIGXFSZ {
			t.Fatalf("expected SIGXFSZ from RLIMIT_FSIZE=0, status=%v err=%v", file.status, file.waitErr)
		}

		descriptors := runProbe(t, paths.bootstrapSource, probe, "descriptor-limit", buildRoot,
			freshWorkingDirectory(t), runOptions{outputCap: 2, wallDeadline: mechanicalWallDeadline})
		assertSuccessfulExit(t, descriptors, 2)
		if !bytes.Equal(descriptors.stdout, []byte{13, 1}) {
			t.Fatalf("expected RLIMIT_NOFILE=16 to permit exactly 13 opens (3 already open) then fail with EMFILE: %v",
				descriptors.stdout)
		}

		cpu := runProbe(t, paths.bootstrapSource, probe, "cpu-limit", buildRoot,
			freshWorkingDirectory(t), runOptions{outputCap: 0, wallDeadline: 3 * time.Second})
		if !cpu.status.Signaled() || cpu.killedFor == "wall" {
			t.Fatalf("expected kernel CPU-limit signal before wall deadline, status=%v reason=%s",
				cpu.status, cpu.killedFor)
		}

		hang := runProbe(t, paths.bootstrapSource, probe, "hang", buildRoot,
			freshWorkingDirectory(t), runOptions{outputCap: 0, wallDeadline: 100 * time.Millisecond})
		if hang.killedFor != "wall" || !hang.status.Signaled() || hang.status.Signal() != syscall.SIGKILL {
			t.Fatalf("wall deadline did not force kill/reap: status=%v reason=%s", hang.status, hang.killedFor)
		}
		t.Logf("memory=unbounded-counterevidence file=SIGXFSZ descriptors=13-then-EMFILE cpu=%s wall=SIGKILL-and-reap",
			cpu.status.Signal())
	})

	t.Run("partial-duplicate-trailing-oversize-crash-signal-timeout-cancel", func(t *testing.T) {
		root := t.TempDir()
		sentinel := filepath.Join(root, "sentinel")
		if err := os.WriteFile(sentinel, []byte("owned\n"), 0o400); err != nil {
			t.Fatal(err)
		}
		probe := buildProbe(t, paths.probeSource, sentinel, filepath.Join(buildRoot, "fault-probe"))
		ordinaryResult := mustRead(t, filepath.Join(paths.corpus,
			"mjs-source-validator", "result-ordinary.bin"))

		for _, mode := range []string{"partial-output", "duplicate-output", "trailing-output", "oversize-output"} {
			outcome := runProbe(t, paths.bootstrapSource, probe, mode, buildRoot,
				freshWorkingDirectory(t), runOptions{
					input: ordinaryResult, outputCap: resultBytes, wallDeadline: mechanicalWallDeadline,
				})
			if mode == "partial-output" {
				if outcome.stdoutN != 69 || outcome.killedFor != "" {
					t.Fatalf("partial output classification mismatch: bytes=%d reason=%s",
						outcome.stdoutN, outcome.killedFor)
				}
				if _, err := sourcevalidatorpassive.DecodeResult(outcome.stdout); err == nil {
					t.Fatal("partial output unexpectedly decoded")
				}
			} else if outcome.stdoutN <= resultBytes {
				t.Fatalf("%s did not cross cap: bytes=%d", mode, outcome.stdoutN)
			}
			t.Logf("%s: bytes=%d disposition=refuse reason=%s", mode,
				outcome.stdoutN, outcome.killedFor)
		}

		for _, mode := range []string{"crash", "signal"} {
			outcome := runProbe(t, paths.bootstrapSource, probe, mode, buildRoot,
				freshWorkingDirectory(t), runOptions{outputCap: resultBytes, wallDeadline: mechanicalWallDeadline})
			if !outcome.status.Signaled() || outcome.stdoutN != 0 {
				t.Fatalf("%s did not become a zero-output signaled refusal: status=%v bytes=%d",
					mode, outcome.status, outcome.stdoutN)
			}
			t.Logf("%s: signal=%s output=0 disposition=refuse", mode, outcome.status.Signal())
		}

		partialInput := runProfile(t, validatorLauncher, freshWorkingDirectory(t), runOptions{
			input: []byte{0, 0}, leaveInputOpen: true, outputCap: resultBytes,
			wallDeadline: 100 * time.Millisecond,
		})
		if partialInput.killedFor != "wall" || partialInput.stdoutN != 0 {
			t.Fatalf("partial input did not timeout with zero output: reason=%s bytes=%d",
				partialInput.killedFor, partialInput.stdoutN)
		}
		t.Log("partial-input: wall=SIGKILL output=0 disposition=refuse")

		cancelled := runProbe(t, paths.bootstrapSource, probe, "hang", buildRoot,
			freshWorkingDirectory(t), runOptions{
				outputCap: 0, wallDeadline: mechanicalWallDeadline, cancelAfter: 20 * time.Millisecond,
			})
		if cancelled.killedFor != "cancel" || !cancelled.status.Signaled() ||
			cancelled.status.Signal() != syscall.SIGKILL {
			t.Fatalf("cancellation did not force kill/reap: status=%v reason=%s",
				cancelled.status, cancelled.killedFor)
		}
		t.Log("cancellation: SIGKILL-and-reap output=0 disposition=refuse")
	})

	t.Run("clean-later-invocation", func(t *testing.T) {
		requestBytes := mustRead(t, filepath.Join(paths.corpus,
			"mjs-source-validator", "request-ordinary.bin"))
		outcome := runProfile(t, validatorLauncher, freshWorkingDirectory(t), runOptions{
			input: requestBytes, outputCap: resultBytes, wallDeadline: mechanicalWallDeadline,
		})
		assertCleanExit(t, outcome)
		request, err := sourcevalidatorpassive.DecodeRequest(requestBytes)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := sourcevalidatorpassive.VerifyResult(request, artifactProfile, outcome.stdout); err != nil {
			t.Fatalf("clean later invocation failed: %v", err)
		}
		assertArtifactIdentity(t, paths.artifact)
	})

	t.Run("supported-child-entitlements-change-v1-bytes", func(t *testing.T) {
		copyPath := filepath.Join(t.TempDir(), "validator-with-inherit-entitlements")
		if err := os.WriteFile(copyPath, mustRead(t, paths.artifact), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Chmod(copyPath, 0o700); err != nil {
			t.Fatal(err)
		}
		// #nosec G204 -- every path is repository-fixed or created by this test beneath t.TempDir.
		command := exec.Command("codesign", "--force", "--sign", "-",
			"--identifier", "com.capsulecorp.tests.mjs-source-validator-v2",
			"--options", "runtime", "--entitlements", paths.childEntitlements, copyPath)
		if output, err := command.CombinedOutput(); err != nil {
			t.Fatalf("ad hoc entitlement mutation failed: %v\n%s", err, output)
		}
		mutated := sha256.Sum256(mustRead(t, copyPath))
		if hex.EncodeToString(mutated[:]) == expectedArtifactSHA256 {
			t.Fatal("adding App Sandbox inheritance entitlements unexpectedly preserved V1 bytes")
		}
		// #nosec G204 -- copyPath is created by this test beneath t.TempDir.
		inspection := exec.Command("codesign", "-d", "--entitlements", ":-", copyPath)
		output, err := inspection.CombinedOutput()
		if err != nil {
			t.Fatalf("inspect mutated entitlements: %v\n%s", err, output)
		}
		for _, entitlement := range []string{
			"com.apple.security.app-sandbox", "com.apple.security.inherit",
		} {
			if !bytes.Contains(output, []byte(entitlement)) {
				t.Fatalf("mutated signature missing %s: %s", entitlement, output)
			}
		}
		assertArtifactIdentity(t, paths.artifact)
		t.Logf("original=%s mutated=%s; retained V1 remained unchanged",
			expectedArtifactSHA256, hex.EncodeToString(mutated[:]))
	})
}

type repoPaths struct {
	artifact          string
	artifactProfile   string
	bootstrapSource   string
	probeSource       string
	childEntitlements string
	corpus            string
}

func repositoryPaths(t *testing.T) repoPaths {
	t.Helper()
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve current test path")
	}
	v2 := filepath.Dir(current)
	v1 := filepath.Clean(filepath.Join(v2, "..", "mjs-source-validator-v1"))
	return repoPaths{
		artifact:          filepath.Join(v1, "dist", "capsule-mjs-source-validator-aarch64-apple-darwin"),
		artifactProfile:   filepath.Join(v1, "evidence", "artifact-profile.bin"),
		bootstrapSource:   filepath.Join(v2, "testdata", "profile_bootstrap.c"),
		probeSource:       filepath.Join(v2, "testdata", "profile_probe.c"),
		childEntitlements: filepath.Join(v2, "testdata", "child.entitlements"),
		corpus:            filepath.Clean(filepath.Join(v2, "..", "..", "schemas", "conformance", "v0")),
	}
}

func requireTool(t *testing.T, name string) {
	t.Helper()
	if _, err := exec.LookPath(name); err != nil {
		t.Fatalf("required local platform tool %s: %v", name, err)
	}
}

func assertArtifactIdentity(t *testing.T, path string) {
	t.Helper()
	bytesValue := mustRead(t, path)
	if len(bytesValue) != expectedArtifactBytes {
		t.Fatalf("V1 artifact length changed: got %d want %d", len(bytesValue), expectedArtifactBytes)
	}
	digest := sha256.Sum256(bytesValue)
	if observed := hex.EncodeToString(digest[:]); observed != expectedArtifactSHA256 {
		t.Fatalf("V1 artifact digest changed: got %s want %s", observed, expectedArtifactSHA256)
	}
}

func buildProbe(t *testing.T, source, sentinel, output string) string {
	t.Helper()
	compileC(t, source, output, "-DSENTINEL_PATH="+strconv.Quote(sentinel))
	return output
}

func buildLauncher(t *testing.T, source, target, argument, output string) string {
	t.Helper()
	compileC(t, source, output,
		"-DALLOW_UNBOUNDED_MEMORY_FOR_MECHANISM_TEST=1",
		"-DTARGET_PATH="+strconv.Quote(target), "-DTARGET_ARG="+strconv.Quote(argument))
	return output
}

func buildStrictLauncher(t *testing.T, source, target, argument, output string) string {
	t.Helper()
	compileC(t, source, output,
		"-DTARGET_PATH="+strconv.Quote(target), "-DTARGET_ARG="+strconv.Quote(argument))
	return output
}

func compileC(t *testing.T, source, output string, definitions ...string) {
	t.Helper()
	arguments := []string{
		"-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-D_DARWIN_C_SOURCE",
		"-mmacosx-version-min=14.0",
	}
	arguments = append(arguments, definitions...)
	arguments = append(arguments, source, "-o", output)
	command := exec.Command("clang", arguments...)
	command.Env = []string{
		"PATH=/usr/bin:/bin:/usr/sbin:/sbin",
		"TMPDIR=" + filepath.Dir(output),
	}
	if result, err := command.CombinedOutput(); err != nil {
		t.Fatalf("compile %s: %v\n%s", filepath.Base(source), err, result)
	}
}

func runProbe(t *testing.T, bootstrap, probe, mode, buildRoot, cwd string, options runOptions) runOutcome {
	t.Helper()
	launcher := buildLauncher(t, bootstrap, probe, mode,
		filepath.Join(buildRoot, "launcher-"+strings.ReplaceAll(mode, "-", "_")))
	return runProfile(t, launcher, cwd, options)
}

func freshWorkingDirectory(t *testing.T) string {
	t.Helper()
	directory := t.TempDir()
	if err := os.Chmod(directory, 0o500); err != nil {
		t.Fatal(err)
	}
	return directory
}

func runProfile(t *testing.T, launcher, cwd string, options runOptions) runOutcome {
	t.Helper()
	if options.wallDeadline <= 0 {
		options.wallDeadline = mechanicalWallDeadline
	}
	workingDirectory, err := os.Open(cwd)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := workingDirectory.Close(); err != nil {
			t.Errorf("close working-directory descriptor: %v", err)
		}
	}()

	command := exec.Command(launcher)
	command.Env = []string{}
	command.ExtraFiles = []*os.File{workingDirectory}
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	stdin, err := command.StdinPipe()
	if err != nil {
		t.Fatal(err)
	}
	stdout, err := command.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	stderr, err := command.StderrPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := command.Start(); err != nil {
		t.Fatalf("start fixed profile launcher: %v", err)
	}

	overflow := make(chan string, 2)
	stdoutCollector := &boundedCollector{cap: options.outputCap, overflow: overflow, label: "output"}
	stderrCollector := &boundedCollector{cap: 0, overflow: overflow, label: "stderr"}
	stdoutDone := make(chan struct{})
	stderrDone := make(chan struct{})
	go func() {
		_, _ = io.Copy(stdoutCollector, stdout)
		close(stdoutDone)
	}()
	go func() {
		_, _ = io.Copy(stderrCollector, stderr)
		close(stderrDone)
	}()
	inputDone := make(chan struct{})
	go func() {
		_, _ = stdin.Write(options.input)
		if !options.leaveInputOpen {
			_ = stdin.Close()
		}
		close(inputDone)
	}()
	waited := make(chan error, 1)
	go func() { waited <- command.Wait() }()

	wallTimer := time.NewTimer(options.wallDeadline)
	defer wallTimer.Stop()
	var cancelTimer *time.Timer
	var cancel <-chan time.Time
	if options.cancelAfter > 0 {
		cancelTimer = time.NewTimer(options.cancelAfter)
		cancel = cancelTimer.C
		defer cancelTimer.Stop()
	}

	outcome := runOutcome{}
	select {
	case outcome.waitErr = <-waited:
	case reason := <-overflow:
		outcome.killedFor = reason
		killProcessGroup(command.Process.Pid)
		outcome.waitErr = <-waited
	case <-wallTimer.C:
		outcome.killedFor = "wall"
		killProcessGroup(command.Process.Pid)
		outcome.waitErr = <-waited
	case <-cancel:
		outcome.killedFor = "cancel"
		killProcessGroup(command.Process.Pid)
		outcome.waitErr = <-waited
	}
	_ = stdin.Close()
	<-inputDone
	<-stdoutDone
	<-stderrDone
	outcome.stdout, outcome.stdoutN = stdoutCollector.snapshot()
	outcome.stderr, outcome.stderrN = stderrCollector.snapshot()
	if command.ProcessState != nil {
		if status, ok := command.ProcessState.Sys().(syscall.WaitStatus); ok {
			outcome.status = status
		}
	}
	if outcome.killedFor == "" {
		if outcome.stderrN > 0 {
			outcome.killedFor = "stderr"
		} else if outcome.stdoutN > options.outputCap {
			outcome.killedFor = "output"
		}
	}
	return outcome
}

func killProcessGroup(pid int) {
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		_ = syscall.Kill(pid, syscall.SIGKILL)
	}
}

func assertCleanExit(t *testing.T, outcome runOutcome) {
	t.Helper()
	assertSuccessfulExit(t, outcome, resultBytes)
}

func assertSuccessfulExit(t *testing.T, outcome runOutcome, expectedOutput int64) {
	t.Helper()
	if outcome.waitErr != nil || outcome.status.ExitStatus() != 0 || outcome.killedFor != "" ||
		outcome.stderrN != 0 || outcome.stdoutN != expectedOutput {
		t.Fatalf("child did not exit cleanly: err=%v status=%v reason=%s stdout=%d stderr=%d stderr-prefix=%q",
			outcome.waitErr, outcome.status, outcome.killedFor, outcome.stdoutN, outcome.stderrN,
			outcome.stderr)
	}
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	value, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return value
}

func TestV2ProfileConstantsRemainClosed(t *testing.T) {
	if resultBytes != 138 || mechanicalWallDeadline != 2*time.Second {
		t.Fatalf("unexpected local profile constants: output=%d wall=%s",
			resultBytes, mechanicalWallDeadline)
	}
}
