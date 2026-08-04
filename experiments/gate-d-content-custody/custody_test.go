package custody

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"testing"
	"time"
)

type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func baseBinding(direction Direction) Binding {
	return Binding{
		InstallationID: "install_test",
		EpochDigest:    "sha256:epoch",
		RegistrationID: "registration_test",
		AttemptID:      "attempt_test",
		Operation:      "stage-primary-data",
		Direction:      direction,
	}
}

func setupBroker(t *testing.T) (*Broker, *clock) {
	t.Helper()
	c := &clock{now: time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)}
	b, err := OpenBroker(filepath.Join(t.TempDir(), "broker-private"), c.Now)
	if err != nil {
		t.Fatal(err)
	}
	return b, c
}

func snapshot(t *testing.T, b *Broker, c *clock, content []byte) (ContentRef, string) {
	t.Helper()
	source := filepath.Join(t.TempDir(), "selected.txt")
	if err := os.WriteFile(source, content, 0o600); err != nil {
		t.Fatal(err)
	}
	ref, err := b.SnapshotRegularFile(source, 1024, c.now.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	return ref, source
}

func issueInput(t *testing.T, b *Broker, c *clock, ref ContentRef, binding Binding) HandleToken {
	t.Helper()
	token, err := b.IssueInputHandle(ref, binding, c.now.Add(time.Minute), c.now.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestSnapshotAndDescriptorTransferStagesExactBytes(t *testing.T) {
	b, c := setupBroker(t)
	want := []byte("broker-owned immutable bytes\n")
	ref, originalPath := snapshot(t, b, c, want)
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)
	if PublicStateContainsPath(ref, token, originalPath) {
		t.Fatal("public content reference leaked the selected host path")
	}

	brokerFD, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	defer brokerFD.Close()
	sockets, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Close(sockets[0])
	defer syscall.Close(sockets[1])

	sendErr := make(chan error, 1)
	go func() { sendErr <- SendFD(sockets[0], brokerFD) }()
	received, err := ReceiveFD(sockets[1])
	if err != nil {
		t.Fatal(err)
	}
	defer received.Close()
	if err := <-sendErr; err != nil {
		t.Fatal(err)
	}
	if _, err := received.Write([]byte("mutate")); err == nil {
		t.Fatal("received input descriptor unexpectedly allowed writes")
	}

	staged := filepath.Join(t.TempDir(), "attempt", "input")
	if err := StageInput(received, ref, 1024, staged); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(staged)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("staged %q, want %q", got, want)
	}
}

func TestDescriptorTransferCrossesRealProcessBoundary(t *testing.T) {
	const expected = "cross-process-exact-read-only-bytes"
	path := filepath.Join(t.TempDir(), "snapshot")
	if err := os.WriteFile(path, []byte(expected), 0o400); err != nil {
		t.Fatal(err)
	}
	content, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer content.Close()

	sockets, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		t.Fatal(err)
	}
	parentSocket := sockets[0]
	childSocket := os.NewFile(uintptr(sockets[1]), "gate-d-child-socket")
	defer syscall.Close(parentSocket)

	cmd := exec.Command(os.Args[0], "-test.run=^TestDescriptorReceiverHelper$")
	cmd.Env = append(os.Environ(), "CAPSULE_GATE_D_DESCRIPTOR_HELPER=1")
	cmd.ExtraFiles = []*os.File{childSocket}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		childSocket.Close()
		t.Fatal(err)
	}
	if err := childSocket.Close(); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		t.Fatal(err)
	}
	if err := SendFD(parentSocket, content); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		t.Fatal(err)
	}
	if err := cmd.Wait(); err != nil {
		t.Fatalf("descriptor receiver process failed: %v", err)
	}
}

func TestDescriptorReceiverHelper(t *testing.T) {
	if os.Getenv("CAPSULE_GATE_D_DESCRIPTOR_HELPER") != "1" {
		t.Skip("helper subprocess only")
	}
	received, err := ReceiveFD(3)
	if err != nil {
		t.Fatal(err)
	}
	defer received.Close()
	actual, err := io.ReadAll(received)
	if err != nil {
		t.Fatal(err)
	}
	if string(actual) != "cross-process-exact-read-only-bytes" {
		t.Fatalf("received %q", actual)
	}
	if _, err := received.Write([]byte("mutate")); err == nil {
		t.Fatal("received descriptor unexpectedly allowed writes")
	}
}

func TestOriginalMutationDoesNotChangeSnapshot(t *testing.T) {
	b, c := setupBroker(t)
	ref, source := snapshot(t, b, c, []byte("approved bytes"))
	if err := os.WriteFile(source, []byte("later host bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)
	f, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	staged := filepath.Join(t.TempDir(), "stage")
	if err := StageInput(f, ref, 1024, staged); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(staged)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "approved bytes" {
		t.Fatalf("staged live source content %q", got)
	}
}

func TestRejectsSymlinkDirectoryAndFIFO(t *testing.T) {
	b, c := setupBroker(t)
	dir := t.TempDir()
	regular := filepath.Join(dir, "regular")
	if err := os.WriteFile(regular, []byte("bytes"), 0o600); err != nil {
		t.Fatal(err)
	}
	symlink := filepath.Join(dir, "link")
	if err := os.Symlink(regular, symlink); err != nil {
		t.Fatal(err)
	}
	if _, err := b.SnapshotRegularFile(symlink, 1024, c.now.Add(time.Hour)); err == nil {
		t.Fatal("symlink snapshot unexpectedly succeeded")
	}
	if _, err := b.SnapshotRegularFile(dir, 1024, c.now.Add(time.Hour)); !errors.Is(err, ErrNotRegular) {
		t.Fatalf("directory error = %v, want ErrNotRegular", err)
	}
	fifo := filepath.Join(dir, "fifo")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := b.SnapshotRegularFile(fifo, 1024, c.now.Add(time.Hour)); !errors.Is(err, ErrNotRegular) {
		t.Fatalf("FIFO error = %v, want ErrNotRegular", err)
	}
}

func TestRejectsDeviceSocketAndOversizedSparseFile(t *testing.T) {
	b, c := setupBroker(t)
	if _, err := b.SnapshotRegularFile("/dev/null", 1024, c.now.Add(time.Hour)); err == nil {
		t.Fatal("character device snapshot unexpectedly succeeded")
	}

	t.Run("unix-socket", func(t *testing.T) {
		socketPlaceholder, err := os.CreateTemp("/tmp", "capsule-gate-d-*.sock")
		if err != nil {
			t.Fatal(err)
		}
		socketPath := socketPlaceholder.Name()
		if err := socketPlaceholder.Close(); err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(socketPath); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Remove(socketPath) })
		listener, err := net.Listen("unix", socketPath)
		if errors.Is(err, syscall.EPERM) {
			t.Skip("managed test sandbox denies Unix-socket bind")
		}
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close()
		if _, err := b.SnapshotRegularFile(socketPath, 1024, c.now.Add(time.Hour)); err == nil {
			t.Fatal("Unix socket snapshot unexpectedly succeeded")
		}
	})

	sparsePath := filepath.Join(t.TempDir(), "oversized-sparse")
	if err := os.WriteFile(sparsePath, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(sparsePath, 2048); err != nil {
		t.Fatal(err)
	}
	if _, err := b.SnapshotRegularFile(sparsePath, 1024, c.now.Add(time.Hour)); !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("oversized sparse file error = %v, want ErrLimitExceeded", err)
	}
	if _, err := b.SnapshotRegularFile(sparsePath, 0, c.now.Add(time.Hour)); !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("zero-byte policy limit error = %v, want ErrLimitExceeded", err)
	}
}

func TestUnauthorizedStaleCrossAttemptAndPathLikeHandlesFail(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("private"))
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)

	if _, _, err := b.RedeemInput(token, PeerDaemon, binding, NoFault); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("daemon redemption error = %v", err)
	}
	wrong := binding
	wrong.AttemptID = "attempt_other"
	if _, _, err := b.RedeemInput(token, PeerSupervisor, wrong, NoFault); !errors.Is(err, ErrBindingMismatch) {
		t.Fatalf("cross-attempt error = %v", err)
	}
	forged := HandleToken{ID: "../../user-file"}
	if _, _, err := b.RedeemInput(forged, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrUnknownHandle) {
		t.Fatalf("path-like handle error = %v", err)
	}

	expiring := issueInput(t, b, c, ref, binding)
	c.now = c.now.Add(2 * time.Minute)
	if _, _, err := b.RedeemInput(expiring, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired handle error = %v", err)
	}
}

func TestOneTimeRedemptionAndConcurrentDuplicate(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("once"))
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)

	const contenders = 24
	var wg sync.WaitGroup
	wg.Add(contenders)
	results := make(chan error, contenders)
	for range contenders {
		go func() {
			defer wg.Done()
			f, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault)
			if f != nil {
				_ = f.Close()
			}
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	successes := 0
	duplicates := 0
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrAlreadyRedeemed):
			duplicates++
		default:
			t.Fatalf("unexpected redemption error: %v", err)
		}
	}
	if successes != 1 || duplicates != contenders-1 {
		t.Fatalf("successes=%d duplicates=%d", successes, duplicates)
	}
}

func TestCrashAfterConsumptionBurnsHandleAcrossReload(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("burn on ambiguity"))
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)
	if _, _, err := b.RedeemInput(token, PeerSupervisor, binding, CrashAfterConsumeBeforeOpen); !errors.Is(err, ErrInjectedCrashPoint) {
		t.Fatalf("fault result = %v", err)
	}

	reloaded, err := OpenBroker(b.root, c.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := reloaded.RedeemInput(token, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrAlreadyRedeemed) {
		t.Fatalf("reloaded redemption error = %v", err)
	}
}

func TestSupervisorCrashAfterReceiveDoesNotRestoreHandle(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("descriptor dies with receiver"))
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)
	f, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	// Closing the only receiver-side descriptor models Supervisor process exit.
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	reloaded, err := OpenBroker(b.root, c.Now)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := reloaded.RedeemInput(token, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrAlreadyRedeemed) {
		t.Fatalf("retry after Supervisor crash error = %v", err)
	}
}

func TestPartialDescriptorTransferFailsClosed(t *testing.T) {
	sockets, err := syscall.Socketpair(syscall.AF_UNIX, syscall.SOCK_STREAM, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer syscall.Close(sockets[0])
	defer syscall.Close(sockets[1])
	if err := syscall.Sendmsg(sockets[0], []byte{1}, nil, nil, 0); err != nil {
		t.Fatal(err)
	}
	if received, err := ReceiveFD(sockets[1]); err == nil {
		_ = received.Close()
		t.Fatal("payload without descriptor unexpectedly succeeded")
	}
}

func TestStagedDigestRejectsSubstitutionAndPartialTransfer(t *testing.T) {
	for _, tc := range []struct {
		name string
		edit func(string) error
		want error
	}{
		{name: "substitution", edit: func(path string) error { return os.WriteFile(path, []byte("same-length-bad"), 0o400) }, want: ErrDigestMismatch},
		{name: "partial", edit: func(path string) error { return os.WriteFile(path, []byte("short"), 0o400) }, want: ErrSizeMismatch},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, c := setupBroker(t)
			ref, _ := snapshot(t, b, c, []byte("same-length-ok!"))
			path, err := b.contentPath(ref.OpaqueID)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.Chmod(path, 0o600); err != nil {
				t.Fatal(err)
			}
			if err := tc.edit(path); err != nil {
				t.Fatal(err)
			}
			binding := baseBinding(DirectionInput)
			token := issueInput(t, b, c, ref, binding)
			f, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			err = StageInput(f, ref, 1024, filepath.Join(t.TempDir(), "stage"))
			if !errors.Is(err, tc.want) {
				t.Fatalf("stage error = %v, want %v", err, tc.want)
			}
		})
	}
}

func TestOutputWriteHandleIsBoundedAndReleaseWaitsForIntegrity(t *testing.T) {
	b, c := setupBroker(t)
	binding := baseBinding(DirectionOutput)
	binding.Operation = "collect-transformed-json"
	token, err := b.IssueOutputHandle(binding, 64, c.now.Add(time.Minute), c.now.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	output, _, err := b.RedeemOutput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := output.Read(make([]byte, 1)); err == nil {
		t.Fatal("received output descriptor unexpectedly allowed reads")
	}
	want := []byte(`{"ok":true}`)
	if _, err := output.Write(want); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := b.ReleaseOutput(token, PeerTrustedUI, binding); !errors.Is(err, ErrReleaseNotReady) {
		t.Fatalf("early release error = %v", err)
	}
	if _, err := b.ReleaseOutput(token, PeerDaemon, binding); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("daemon release error = %v", err)
	}
	h := sha256.Sum256(want)
	digest := "sha256:" + hex.EncodeToString(h[:])
	if err := b.CommitOutput(token, PeerSupervisor, binding, digest, int64(len(want)), IntegritySucceeded); err != nil {
		t.Fatal(err)
	}
	// Exact duplicates are idempotent; substitutions are not.
	if err := b.CommitOutput(token, PeerSupervisor, binding, digest, int64(len(want)), IntegritySucceeded); err != nil {
		t.Fatal(err)
	}
	if err := b.CommitOutput(token, PeerSupervisor, binding, "sha256:other", int64(len(want)), IntegritySucceeded); !errors.Is(err, ErrBindingMismatch) {
		t.Fatalf("mismatched duplicate commit error = %v", err)
	}
	got, err := b.ReleaseOutput(token, PeerTrustedUI, binding)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("released %q, want %q", got, want)
	}
}

func TestIntegrityFailureQuarantinesOutput(t *testing.T) {
	b, c := setupBroker(t)
	binding := baseBinding(DirectionOutput)
	token, err := b.IssueOutputHandle(binding, 64, c.now.Add(time.Minute), c.now.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	output, _, err := b.RedeemOutput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := output.Write([]byte("untrusted")); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
	if err := b.CommitOutput(token, PeerSupervisor, binding, "sha256:irrelevant", 9, IntegrityIndeterminate); !errors.Is(err, ErrReleaseNotReady) {
		t.Fatalf("commit error = %v", err)
	}
	if _, err := b.ReleaseOutput(token, PeerTrustedUI, binding); !errors.Is(err, ErrReleaseNotReady) {
		t.Fatalf("quarantined release error = %v", err)
	}
}

func TestOversizedOutputCannotCommit(t *testing.T) {
	b, c := setupBroker(t)
	binding := baseBinding(DirectionOutput)
	token, err := b.IssueOutputHandle(binding, 4, c.now.Add(time.Minute), c.now.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	output, _, err := b.RedeemOutput(token, PeerSupervisor, binding, NoFault)
	if err != nil {
		t.Fatal(err)
	}
	tooLarge := []byte("12345")
	if _, err := output.Write(tooLarge); err != nil {
		t.Fatal(err)
	}
	if err := output.Close(); err != nil {
		t.Fatal(err)
	}
	h := sha256.Sum256(tooLarge)
	digest := "sha256:" + hex.EncodeToString(h[:])
	if err := b.CommitOutput(token, PeerSupervisor, binding, digest, int64(len(tooLarge)), IntegritySucceeded); !errors.Is(err, ErrLimitExceeded) {
		t.Fatalf("oversized commit error = %v", err)
	}
	path, err := b.outputPath(token.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("oversized Broker output was retained: %v", err)
	}
	if _, err := b.ReleaseOutput(token, PeerTrustedUI, binding); !errors.Is(err, ErrReleaseNotReady) {
		t.Fatalf("oversized output release error = %v", err)
	}
}

func TestGarbageCollectionPreservesLiveAuthorityAndTombstones(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("retained while live"))
	binding := baseBinding(DirectionInput)
	token, err := b.IssueInputHandle(ref, binding, c.now.Add(time.Minute), c.now.Add(10*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	// Content retention has elapsed, but the unexpired handle keeps it live.
	c.now = c.now.Add(30 * time.Second)
	b.state.Contents[ref.OpaqueID] = contentRecord{
		ID: ref.OpaqueID, Digest: ref.Digest, Size: ref.Size, Kind: "input", RetainUntil: c.now.Add(-time.Second),
	}
	if err := b.saveLocked(); err != nil {
		t.Fatal(err)
	}
	result, err := b.CollectGarbage()
	if err != nil {
		t.Fatal(err)
	}
	if result.DeletedContent != 0 {
		t.Fatalf("deleted content referenced by live handle: %+v", result)
	}

	c.now = c.now.Add(2 * time.Minute)
	result, err = b.CollectGarbage()
	if err != nil {
		t.Fatal(err)
	}
	if result.ExpiredHandles != 1 || result.DeletedContent != 1 || result.DeletedHandles != 0 {
		t.Fatalf("unexpected expiry GC result: %+v", result)
	}
	if _, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrAlreadyRedeemed) && !errors.Is(err, ErrExpired) {
		t.Fatalf("stale tombstone redemption error = %v", err)
	}

	c.now = c.now.Add(10 * time.Minute)
	result, err = b.CollectGarbage()
	if err != nil {
		t.Fatal(err)
	}
	if result.DeletedHandles != 1 {
		t.Fatalf("expired tombstone not collected: %+v", result)
	}
}

func TestRevokeBeforeRedemption(t *testing.T) {
	b, c := setupBroker(t)
	ref, _ := snapshot(t, b, c, []byte("revocable"))
	binding := baseBinding(DirectionInput)
	token := issueInput(t, b, c, ref, binding)
	if err := b.Revoke(token); err != nil {
		t.Fatal(err)
	}
	if _, _, err := b.RedeemInput(token, PeerSupervisor, binding, NoFault); !errors.Is(err, ErrRevoked) {
		t.Fatalf("revoked handle error = %v", err)
	}
}
