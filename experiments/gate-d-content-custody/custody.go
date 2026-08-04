// Package custody is a development-only Gate D feasibility prototype.
//
// It is not a Capsule production package or security boundary. Product code must
// not import it.
package custody

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

const stateVersion = 1

var (
	ErrUnauthorized       = errors.New("peer is not authorized for this operation")
	ErrUnknownHandle      = errors.New("unknown content handle")
	ErrBindingMismatch    = errors.New("content handle binding mismatch")
	ErrExpired            = errors.New("content handle expired")
	ErrAlreadyRedeemed    = errors.New("content handle already redeemed")
	ErrRevoked            = errors.New("content handle revoked")
	ErrDigestMismatch     = errors.New("content digest mismatch")
	ErrSizeMismatch       = errors.New("content size mismatch")
	ErrLimitExceeded      = errors.New("content byte limit exceeded")
	ErrNotRegular         = errors.New("content object is not a regular file")
	ErrSourceMutated      = errors.New("source changed while it was snapshotted")
	ErrReleaseNotReady    = errors.New("output is not eligible for release")
	ErrInjectedCrashPoint = errors.New("injected crash point")
)

// PeerRole is an authorization result supplied by the transport boundary. It
// must never be populated from a request field in production.
type PeerRole string

const (
	PeerSupervisor PeerRole = "supervisor"
	PeerDaemon     PeerRole = "daemon"
	PeerTrustedUI  PeerRole = "trusted-ui"
)

type Direction string

const (
	DirectionInput  Direction = "broker-to-supervisor"
	DirectionOutput Direction = "supervisor-to-broker"
)

type IntegrityClass string

const (
	IntegritySucceeded     IntegrityClass = "succeeded"
	IntegrityFailed        IntegrityClass = "failed"
	IntegrityIndeterminate IntegrityClass = "indeterminate"
)

type HandleState string

const (
	StateIssued      HandleState = "issued"
	StateConsumed    HandleState = "consumed"
	StateCommitted   HandleState = "committed"
	StateQuarantined HandleState = "quarantined"
	StateRevoked     HandleState = "revoked"
	StateExpired     HandleState = "expired"
)

// Binding is the minimum attempt-scoped context needed for redemption.
type Binding struct {
	InstallationID string    `json:"installationId"`
	EpochDigest    string    `json:"epochDigest"`
	RegistrationID string    `json:"registrationId"`
	AttemptID      string    `json:"attemptId"`
	Operation      string    `json:"operation"`
	Direction      Direction `json:"direction"`
}

// ContentRef is safe manifest metadata for planning. It has no path or
// redeemable transfer authority.
type ContentRef struct {
	OpaqueID string `json:"opaqueId"`
	Digest   string `json:"digest"`
	Size     int64  `json:"size"`
}

// HandleToken is delivered only on the authenticated Broker/Supervisor
// channel. It is distinct from ContentRef.OpaqueID.
type HandleToken struct {
	ID string `json:"handleId"`
}

type contentRecord struct {
	ID          string    `json:"id"`
	Digest      string    `json:"digest"`
	Size        int64     `json:"size"`
	Kind        string    `json:"kind"`
	RetainUntil time.Time `json:"retainUntil"`
}

type handleRecord struct {
	ID              string      `json:"id"`
	ContentID       string      `json:"contentId,omitempty"`
	Binding         Binding     `json:"binding"`
	Direction       Direction   `json:"direction"`
	State           HandleState `json:"state"`
	ExpectedDigest  string      `json:"expectedDigest,omitempty"`
	ExpectedSize    int64       `json:"expectedSize,omitempty"`
	MaxBytes        int64       `json:"maxBytes"`
	ExpiresAt       time.Time   `json:"expiresAt"`
	TombstoneUntil  time.Time   `json:"tombstoneUntil"`
	RedemptionID    string      `json:"redemptionId,omitempty"`
	CommittedDigest string      `json:"committedDigest,omitempty"`
	CommittedSize   int64       `json:"committedSize,omitempty"`
	UpdatedAt       time.Time   `json:"updatedAt"`
}

type diskState struct {
	Version  int                      `json:"version"`
	Contents map[string]contentRecord `json:"contents"`
	Handles  map[string]handleRecord  `json:"handles"`
}

type Broker struct {
	root            string
	now             func() time.Time
	mu              sync.Mutex
	state           diskState
	outputTransfers map[string]*outputTransfer
}

type outputTransfer struct {
	done chan struct{}
	err  error
}

func OpenBroker(root string, now func() time.Time) (*Broker, error) {
	if now == nil {
		now = time.Now
	}
	for _, dir := range []string{root, filepath.Join(root, "content"), filepath.Join(root, "output")} {
		if err := os.MkdirAll(dir, 0o700); err != nil {
			return nil, err
		}
		if err := os.Chmod(dir, 0o700); err != nil {
			return nil, err
		}
	}
	b := &Broker{
		root:            root,
		now:             now,
		outputTransfers: make(map[string]*outputTransfer),
		state: diskState{
			Version:  stateVersion,
			Contents: make(map[string]contentRecord),
			Handles:  make(map[string]handleRecord),
		},
	}
	data, err := os.ReadFile(b.statePath())
	if errors.Is(err, os.ErrNotExist) {
		if err := b.saveLocked(); err != nil {
			return nil, err
		}
		return b, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, &b.state); err != nil {
		return nil, fmt.Errorf("decode broker state: %w", err)
	}
	if b.state.Version != stateVersion || b.state.Contents == nil || b.state.Handles == nil {
		return nil, fmt.Errorf("unsupported broker state version %d", b.state.Version)
	}
	return b, nil
}

func (b *Broker) statePath() string { return filepath.Join(b.root, "state.json") }

func (b *Broker) contentPath(id string) (string, error) {
	if !validOpaqueID(id) {
		return "", errors.New("invalid opaque content ID")
	}
	return filepath.Join(b.root, "content", id+".blob"), nil
}

func (b *Broker) outputPath(id string) (string, error) {
	if !validOpaqueID(id) {
		return "", errors.New("invalid opaque handle ID")
	}
	return filepath.Join(b.root, "output", id+".part"), nil
}

func validOpaqueID(id string) bool {
	if len(id) != 64 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

func randomID() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (b *Broker) saveLocked() error {
	encoded, err := json.MarshalIndent(b.state, "", "  ")
	if err != nil {
		return err
	}
	tmpID, err := randomID()
	if err != nil {
		return err
	}
	tmp := filepath.Join(b.root, ".state-"+tmpID+".tmp")
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	cleanup := func() {
		_ = f.Close()
		_ = os.Remove(tmp)
	}
	if _, err := f.Write(encoded); err != nil {
		cleanup()
		return err
	}
	if err := f.Sync(); err != nil {
		cleanup()
		return err
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, b.statePath()); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	dir, err := os.Open(b.root)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

// SnapshotRegularFile copies exact data-fork bytes from an already-opened
// regular file into Broker-owned storage. The original path is not retained in
// the content record or returned reference.
func (b *Broker) SnapshotRegularFile(path string, maxBytes int64, retainUntil time.Time) (ContentRef, error) {
	if maxBytes <= 0 {
		return ContentRef{}, ErrLimitExceeded
	}
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK|syscall.O_CLOEXEC, 0)
	if err != nil {
		return ContentRef{}, err
	}
	source := os.NewFile(uintptr(fd), "selected-input")
	if source == nil {
		_ = syscall.Close(fd)
		return ContentRef{}, errors.New("wrap selected input descriptor")
	}
	defer source.Close()
	before, err := source.Stat()
	if err != nil {
		return ContentRef{}, err
	}
	if !before.Mode().IsRegular() {
		return ContentRef{}, ErrNotRegular
	}
	if before.Size() > maxBytes {
		return ContentRef{}, ErrLimitExceeded
	}

	id, err := randomID()
	if err != nil {
		return ContentRef{}, err
	}
	finalPath, err := b.contentPath(id)
	if err != nil {
		return ContentRef{}, err
	}
	tmpPath := finalPath + ".tmp"
	dest, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return ContentRef{}, err
	}
	keep := false
	defer func() {
		_ = dest.Close()
		if !keep {
			_ = os.Remove(tmpPath)
		}
	}()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(dest, h), io.LimitReader(source, maxBytes+1))
	if err != nil {
		return ContentRef{}, err
	}
	if n > maxBytes {
		return ContentRef{}, ErrLimitExceeded
	}
	after, err := source.Stat()
	if err != nil {
		return ContentRef{}, err
	}
	if !os.SameFile(before, after) || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return ContentRef{}, ErrSourceMutated
	}
	if err := dest.Sync(); err != nil {
		return ContentRef{}, err
	}
	if err := dest.Close(); err != nil {
		return ContentRef{}, err
	}
	if err := os.Chmod(tmpPath, 0o400); err != nil {
		return ContentRef{}, err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return ContentRef{}, err
	}
	keep = true

	ref := ContentRef{OpaqueID: id, Digest: "sha256:" + hex.EncodeToString(h.Sum(nil)), Size: n}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.state.Contents[id] = contentRecord{
		ID: id, Digest: ref.Digest, Size: ref.Size, Kind: "input", RetainUntil: retainUntil,
	}
	if err := b.saveLocked(); err != nil {
		delete(b.state.Contents, id)
		return ContentRef{}, err
	}
	return ref, nil
}

func (b *Broker) IssueInputHandle(ref ContentRef, binding Binding, expiresAt, tombstoneUntil time.Time) (HandleToken, error) {
	if binding.Direction != DirectionInput {
		return HandleToken{}, ErrBindingMismatch
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	record, ok := b.state.Contents[ref.OpaqueID]
	if !ok || record.Digest != ref.Digest || record.Size != ref.Size {
		return HandleToken{}, ErrDigestMismatch
	}
	id, err := randomID()
	if err != nil {
		return HandleToken{}, err
	}
	now := b.now()
	b.state.Handles[id] = handleRecord{
		ID: id, ContentID: ref.OpaqueID, Binding: binding, Direction: DirectionInput,
		State: StateIssued, ExpectedDigest: ref.Digest, ExpectedSize: ref.Size,
		MaxBytes: ref.Size, ExpiresAt: expiresAt, TombstoneUntil: tombstoneUntil, UpdatedAt: now,
	}
	if err := b.saveLocked(); err != nil {
		delete(b.state.Handles, id)
		return HandleToken{}, err
	}
	return HandleToken{ID: id}, nil
}

func (b *Broker) IssueOutputHandle(binding Binding, maxBytes int64, expiresAt, tombstoneUntil time.Time) (HandleToken, error) {
	if binding.Direction != DirectionOutput || maxBytes <= 0 {
		return HandleToken{}, ErrBindingMismatch
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	id, err := randomID()
	if err != nil {
		return HandleToken{}, err
	}
	b.state.Handles[id] = handleRecord{
		ID: id, Binding: binding, Direction: DirectionOutput, State: StateIssued,
		MaxBytes: maxBytes, ExpiresAt: expiresAt, TombstoneUntil: tombstoneUntil, UpdatedAt: b.now(),
	}
	if err := b.saveLocked(); err != nil {
		delete(b.state.Handles, id)
		return HandleToken{}, err
	}
	return HandleToken{ID: id}, nil
}

type FaultPoint int

const (
	NoFault FaultPoint = iota
	CrashAfterConsumeBeforeOpen
)

// RedeemInput burns the handle before returning a descriptor. If the process
// crashes after the durable transition, retry is denied rather than authority
// being resurrected.
func (b *Broker) RedeemInput(token HandleToken, peer PeerRole, binding Binding, fault FaultPoint) (*os.File, string, error) {
	if peer != PeerSupervisor {
		return nil, "", ErrUnauthorized
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	record, err := b.validateIssuedLocked(token, binding, DirectionInput)
	if err != nil {
		return nil, "", err
	}
	redemptionID, err := randomID()
	if err != nil {
		return nil, "", err
	}
	record.State = StateConsumed
	record.RedemptionID = redemptionID
	record.UpdatedAt = b.now()
	b.state.Handles[token.ID] = record
	if err := b.saveLocked(); err != nil {
		return nil, "", err
	}
	if fault == CrashAfterConsumeBeforeOpen {
		return nil, redemptionID, ErrInjectedCrashPoint
	}
	path, err := b.contentPath(record.ContentID)
	if err != nil {
		return nil, redemptionID, err
	}
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, redemptionID, err
	}
	f := os.NewFile(uintptr(fd), "broker-input")
	if f == nil {
		_ = syscall.Close(fd)
		return nil, redemptionID, errors.New("wrap broker input descriptor")
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, redemptionID, err
	}
	if !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, redemptionID, ErrNotRegular
	}
	return f, redemptionID, nil
}

func (b *Broker) RedeemOutput(token HandleToken, peer PeerRole, binding Binding, fault FaultPoint) (*os.File, string, error) {
	if peer != PeerSupervisor {
		return nil, "", ErrUnauthorized
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	record, err := b.validateIssuedLocked(token, binding, DirectionOutput)
	if err != nil {
		return nil, "", err
	}
	redemptionID, err := randomID()
	if err != nil {
		return nil, "", err
	}
	record.State = StateConsumed
	record.RedemptionID = redemptionID
	record.UpdatedAt = b.now()
	b.state.Handles[token.ID] = record
	if err := b.saveLocked(); err != nil {
		return nil, "", err
	}
	if fault == CrashAfterConsumeBeforeOpen {
		return nil, redemptionID, ErrInjectedCrashPoint
	}
	reader, writer, err := os.Pipe()
	if err != nil {
		return nil, redemptionID, err
	}
	transfer := &outputTransfer{done: make(chan struct{})}
	b.outputTransfers[record.ID] = transfer
	go func() {
		transfer.err = b.receiveBoundedOutput(record.ID, reader, record.MaxBytes)
		close(transfer.done)
	}()
	return writer, redemptionID, nil
}

func (b *Broker) receiveBoundedOutput(handleID string, reader *os.File, maxBytes int64) error {
	defer reader.Close()
	path, err := b.outputPath(handleID)
	if err != nil {
		return err
	}
	output, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	keep := false
	defer func() {
		_ = output.Close()
		if !keep {
			_ = os.Remove(path)
		}
	}()
	n, err := io.Copy(output, io.LimitReader(reader, maxBytes+1))
	if err != nil {
		return err
	}
	if n > maxBytes {
		return ErrLimitExceeded
	}
	if err := output.Sync(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	keep = true
	return nil
}

func (b *Broker) validateIssuedLocked(token HandleToken, binding Binding, direction Direction) (handleRecord, error) {
	if !validOpaqueID(token.ID) {
		return handleRecord{}, ErrUnknownHandle
	}
	record, ok := b.state.Handles[token.ID]
	if !ok {
		return handleRecord{}, ErrUnknownHandle
	}
	if record.Direction != direction || record.Binding != binding {
		return handleRecord{}, ErrBindingMismatch
	}
	if !b.now().Before(record.ExpiresAt) {
		record.State = StateExpired
		record.UpdatedAt = b.now()
		b.state.Handles[token.ID] = record
		_ = b.saveLocked()
		return handleRecord{}, ErrExpired
	}
	switch record.State {
	case StateIssued:
		return record, nil
	case StateRevoked:
		return handleRecord{}, ErrRevoked
	default:
		return handleRecord{}, ErrAlreadyRedeemed
	}
}

func (b *Broker) Revoke(token HandleToken) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	record, ok := b.state.Handles[token.ID]
	if !ok {
		return ErrUnknownHandle
	}
	if record.State != StateIssued {
		return ErrAlreadyRedeemed
	}
	record.State = StateRevoked
	record.UpdatedAt = b.now()
	b.state.Handles[token.ID] = record
	return b.saveLocked()
}

// CommitOutput is idempotent only for the exact same successful commit. An
// integrity failure quarantines the object and cannot be upgraded to success.
func (b *Broker) CommitOutput(token HandleToken, peer PeerRole, binding Binding, digest string, size int64, integrity IntegrityClass) error {
	if peer != PeerSupervisor {
		return ErrUnauthorized
	}
	b.mu.Lock()
	transfer := b.outputTransfers[token.ID]
	b.mu.Unlock()
	if transfer != nil {
		<-transfer.done
		if transfer.err != nil {
			return transfer.err
		}
		b.mu.Lock()
		delete(b.outputTransfers, token.ID)
		b.mu.Unlock()
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	record, ok := b.state.Handles[token.ID]
	if !ok {
		return ErrUnknownHandle
	}
	if record.Direction != DirectionOutput || record.Binding != binding {
		return ErrBindingMismatch
	}
	if record.State == StateCommitted {
		if integrity == IntegritySucceeded && record.CommittedDigest == digest && record.CommittedSize == size {
			return nil
		}
		return ErrBindingMismatch
	}
	if record.State != StateConsumed {
		return ErrReleaseNotReady
	}
	if integrity != IntegritySucceeded {
		record.State = StateQuarantined
		record.UpdatedAt = b.now()
		b.state.Handles[token.ID] = record
		if err := b.saveLocked(); err != nil {
			return err
		}
		return ErrReleaseNotReady
	}
	path, err := b.outputPath(record.ID)
	if err != nil {
		return err
	}
	actualDigest, actualSize, err := digestRegularFile(path, record.MaxBytes)
	if err != nil {
		return err
	}
	if actualSize != size {
		return ErrSizeMismatch
	}
	if actualDigest != digest {
		return ErrDigestMismatch
	}
	record.State = StateCommitted
	record.CommittedDigest = digest
	record.CommittedSize = size
	record.UpdatedAt = b.now()
	b.state.Handles[token.ID] = record
	return b.saveLocked()
}

func (b *Broker) ReleaseOutput(token HandleToken, peer PeerRole, binding Binding) ([]byte, error) {
	if peer != PeerTrustedUI {
		return nil, ErrUnauthorized
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	record, ok := b.state.Handles[token.ID]
	if !ok {
		return nil, ErrUnknownHandle
	}
	if record.Binding != binding {
		return nil, ErrBindingMismatch
	}
	if record.State != StateCommitted {
		return nil, ErrReleaseNotReady
	}
	path, err := b.outputPath(record.ID)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(path)
}

func digestRegularFile(path string, maxBytes int64) (string, int64, error) {
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0)
	if err != nil {
		return "", 0, err
	}
	f := os.NewFile(uintptr(fd), "digest-input")
	if f == nil {
		_ = syscall.Close(fd)
		return "", 0, errors.New("wrap digest descriptor")
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", 0, err
	}
	if !info.Mode().IsRegular() {
		return "", 0, ErrNotRegular
	}
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, maxBytes+1))
	if err != nil {
		return "", 0, err
	}
	if n > maxBytes {
		return "", 0, ErrLimitExceeded
	}
	return "sha256:" + hex.EncodeToString(h.Sum(nil)), n, nil
}

// StageInput copies from the received descriptor, never from a supplied path,
// and publishes the stage only after exact size and digest verification.
func StageInput(input *os.File, expected ContentRef, maxBytes int64, destination string) error {
	if input == nil || maxBytes <= 0 || expected.Size > maxBytes {
		return ErrLimitExceeded
	}
	info, err := input.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return ErrNotRegular
	}
	if _, err := input.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	tmp := destination + ".partial"
	_ = os.Remove(tmp)
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		_ = out.Close()
		if !committed {
			_ = os.Remove(tmp)
		}
	}()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(out, h), io.LimitReader(input, maxBytes+1))
	if err != nil {
		return err
	}
	if n > maxBytes {
		return ErrLimitExceeded
	}
	if n != expected.Size {
		return ErrSizeMismatch
	}
	digest := "sha256:" + hex.EncodeToString(h.Sum(nil))
	if digest != expected.Digest {
		return ErrDigestMismatch
	}
	if err := out.Sync(); err != nil {
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o400); err != nil {
		return err
	}
	if err := os.Rename(tmp, destination); err != nil {
		return err
	}
	committed = true
	return nil
}

// SendFD and ReceiveFD exercise the same descriptor-capability semantics used
// by xpc_dictionary_set_fd/xpc_dictionary_dup_fd, using SCM_RIGHTS so the spike
// does not require an installed launchd/XPC service.
func SendFD(socket int, file *os.File) error {
	if file == nil {
		return errors.New("nil file descriptor")
	}
	return syscall.Sendmsg(socket, []byte{1}, syscall.UnixRights(int(file.Fd())), nil, 0)
}

func ReceiveFD(socket int) (*os.File, error) {
	payload := make([]byte, 1)
	oob := make([]byte, 128)
	n, oobn, _, _, err := syscall.Recvmsg(socket, payload, oob, 0)
	if err != nil {
		return nil, err
	}
	if n != 1 || oobn == 0 {
		return nil, errors.New("descriptor transfer was partial")
	}
	messages, err := syscall.ParseSocketControlMessage(oob[:oobn])
	if err != nil {
		return nil, err
	}
	var received []int
	for i := range messages {
		fds, parseErr := syscall.ParseUnixRights(&messages[i])
		if parseErr != nil {
			return nil, parseErr
		}
		received = append(received, fds...)
	}
	if len(received) != 1 {
		for _, fd := range received {
			_ = syscall.Close(fd)
		}
		return nil, fmt.Errorf("expected one descriptor, got %d", len(received))
	}
	syscall.CloseOnExec(received[0])
	return os.NewFile(uintptr(received[0]), "received-content"), nil
}

type GCResult struct {
	ExpiredHandles int
	DeletedHandles int
	DeletedContent int
	DeletedOutputs int
}

// CollectGarbage retains active handles and unexpired tombstones. It removes
// expired unredeemed authority before considering the referenced content.
func (b *Broker) CollectGarbage() (GCResult, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	now := b.now()
	result := GCResult{}
	for id, record := range b.state.Handles {
		if record.State == StateIssued && !now.Before(record.ExpiresAt) {
			record.State = StateExpired
			record.UpdatedAt = now
			b.state.Handles[id] = record
			result.ExpiredHandles++
		}
	}
	for id, record := range b.state.Handles {
		if now.Before(record.TombstoneUntil) || record.State == StateIssued || b.outputTransfers[id] != nil {
			continue
		}
		if record.Direction == DirectionOutput {
			path, err := b.outputPath(record.ID)
			if err != nil {
				return result, err
			}
			if err := os.Remove(path); err == nil {
				result.DeletedOutputs++
			} else if !errors.Is(err, os.ErrNotExist) {
				return result, err
			}
		}
		delete(b.state.Handles, id)
		result.DeletedHandles++
	}
	liveContent := make(map[string]bool)
	for _, record := range b.state.Handles {
		if record.Direction == DirectionInput && record.State == StateIssued {
			liveContent[record.ContentID] = true
		}
	}
	for id, record := range b.state.Contents {
		if liveContent[id] || now.Before(record.RetainUntil) {
			continue
		}
		path, err := b.contentPath(id)
		if err != nil {
			return result, err
		}
		if err := os.Chmod(path, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
			return result, err
		}
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return result, err
		}
		delete(b.state.Contents, id)
		result.DeletedContent++
	}
	if err := b.saveLocked(); err != nil {
		return result, err
	}
	return result, nil
}

// PublicStateContainsPath is a test helper that checks only the public shapes.
func PublicStateContainsPath(ref ContentRef, token HandleToken, path string) bool {
	encoded, _ := json.Marshal(struct {
		Ref   ContentRef  `json:"ref"`
		Token HandleToken `json:"token"`
	}{Ref: ref, Token: token})
	return strings.Contains(string(encoded), path)
}
