package store

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"syscall"
)

type Edge string

const (
	BeforePublish      Edge = "before-publish"
	AfterPublish       Edge = "after-publish"
	AfterDirectorySync Edge = "after-directory-sync"
)

// Fault is trusted test injection, never a native provider callback API.
type Fault func(Edge) error

type Store struct {
	mu                sync.Mutex
	directory         string
	owner             *os.File
	directoryIdentity os.FileInfo
	stateIdentity     os.FileInfo
	current           snapshot
	fault             Fault
	fenced, closed    bool
}

// Initialize is test-fixture bootstrap only. Existing state/owner is never replaced.
func Initialize(directory string) (*Store, error) {
	s, err := acquire(directory, true, nil)
	if err != nil {
		return nil, err
	}
	initial := snapshot{Version: snapshotVersion, Binding: FixtureBinding(), Generation: 1}
	if err = s.publish(initial, true); err != nil {
		s.Close()
		return nil, err
	}
	return s, nil
}

// Open requires an existing complete fixture; missing/corrupt state never becomes fresh.
func Open(directory string, fault Fault) (*Store, error) {
	s, err := acquire(directory, false, fault)
	if err != nil {
		return nil, err
	}
	if err = s.readExisting(); err != nil {
		s.Close()
		return nil, err
	}
	return s, nil
}
func acquire(directory string, create bool, fault Fault) (*Store, error) {
	info, err := os.Lstat(directory)
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0700 {
		return nil, ErrRefused
	}
	rootStat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || rootStat.Uid != uint32(os.Getuid()) {
		return nil, ErrRefused
	}
	flags := syscall.O_RDWR | syscall.O_NOFOLLOW | syscall.O_CLOEXEC
	if create {
		entries, readErr := os.ReadDir(directory)
		if readErr != nil || len(entries) != 0 {
			return nil, ErrRefused
		}
		flags |= syscall.O_CREAT | syscall.O_EXCL
	}
	fd, err := syscall.Open(filepath.Join(directory, "owner.lock"), flags, 0600)
	if err != nil {
		return nil, err
	}
	owner := os.NewFile(uintptr(fd), "fixture-owner")
	if err = syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		owner.Close()
		return nil, err
	}
	lockInfo, err := owner.Stat()
	if err != nil || !regularOwned(lockInfo) {
		owner.Close()
		return nil, ErrRefused
	}
	return &Store{directory: directory, owner: owner, directoryIdentity: info, fault: fault}, nil
}
func regularOwned(info os.FileInfo) bool {
	if info == nil || !info.Mode().IsRegular() || info.Mode().Perm() != 0600 {
		return false
	}
	st, ok := info.Sys().(*syscall.Stat_t)
	return ok && st.Uid == uint32(os.Getuid()) && st.Nlink == 1
}
func (s *Store) checkOwner() error {
	if s.closed || s.fenced {
		return ErrFenced
	}
	directory, err := os.Lstat(s.directory)
	if err != nil || !os.SameFile(directory, s.directoryIdentity) || directory.Mode().Perm() != 0700 {
		s.fenced = true
		return ErrFenced
	}
	named, err := os.Lstat(filepath.Join(s.directory, "owner.lock"))
	held, heldErr := s.owner.Stat()
	if err != nil || heldErr != nil || !regularOwned(named) || !os.SameFile(named, held) {
		s.fenced = true
		return ErrFenced
	}
	return nil
}
func (s *Store) readExisting() error {
	if err := s.checkOwner(); err != nil {
		return err
	}
	entries, err := os.ReadDir(s.directory)
	if err != nil {
		return err
	}
	if len(entries) != 2 {
		return ErrRefused
	}
	for _, entry := range entries {
		if entry.Name() != "owner.lock" && entry.Name() != "attempt.json" {
			return ErrRefused
		}
	}
	path := filepath.Join(s.directory, "attempt.json")
	info, err := os.Lstat(path)
	if err != nil || !regularOwned(info) || info.Size() > maximumSnapshotBytes {
		return ErrRefused
	}
	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0)
	if err != nil {
		return err
	}
	file := os.NewFile(uintptr(fd), "fixture-state")
	opened, statErr := file.Stat()
	b, readErr := io.ReadAll(io.LimitReader(file, maximumSnapshotBytes+1))
	closeErr := file.Close()
	if statErr != nil || readErr != nil || closeErr != nil || !os.SameFile(info, opened) {
		return ErrRefused
	}
	state, err := decode(b)
	if err != nil {
		return err
	}
	s.current = state
	s.stateIdentity = opened
	return nil
}
func syncDirectory(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	err = f.Sync()
	return errors.Join(err, f.Close())
}
func (s *Store) publish(next snapshot, initial bool) error {
	if err := s.checkOwner(); err != nil {
		return err
	}
	b, err := encode(next)
	if err != nil {
		return err
	}
	if !initial {
		before, encodeErr := encode(s.current)
		identity := s.stateIdentity
		err = s.readExisting()
		after, afterErr := encode(s.current)
		if err != nil || encodeErr != nil || afterErr != nil || !bytes.Equal(before, after) || !os.SameFile(identity, s.stateIdentity) {
			s.fenced = true
			return ErrFenced
		}
	}
	pending := filepath.Join(s.directory, "pending.json")
	fd, err := syscall.Open(pending, syscall.O_WRONLY|syscall.O_CREAT|syscall.O_EXCL|syscall.O_NOFOLLOW|syscall.O_CLOEXEC, 0600)
	if err != nil {
		s.fenced = true
		return ErrFenced
	}
	file := os.NewFile(uintptr(fd), "fixture-pending")
	_, writeErr := file.Write(b)
	syncErr := file.Sync()
	closeErr := file.Close()
	abort := func() error {
		if os.Remove(pending) != nil {
			s.fenced = true
			return ErrFenced
		}
		return ErrAborted
	}
	if writeErr != nil || syncErr != nil || closeErr != nil {
		return abort()
	}
	if s.fault != nil && s.fault(BeforePublish) != nil {
		return abort()
	}
	live := filepath.Join(s.directory, "attempt.json")
	if initial {
		err = os.Link(pending, live)
		if err == nil {
			err = os.Remove(pending)
		}
	} else {
		err = os.Rename(pending, live)
	}
	if err != nil {
		s.fenced = true
		return ErrIndeterminate
	}
	if s.fault != nil && s.fault(AfterPublish) != nil {
		s.fenced = true
		return ErrIndeterminate
	}
	if err = syncDirectory(s.directory); err != nil {
		s.fenced = true
		return ErrIndeterminate
	}
	if s.fault != nil && s.fault(AfterDirectorySync) != nil {
		s.fenced = true
		return ErrIndeterminate
	}
	s.current = next
	s.stateIdentity, err = os.Lstat(live)
	if err != nil {
		s.fenced = true
		return ErrIndeterminate
	}
	return nil
}
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return ErrFenced
	}
	s.closed = true
	return s.owner.Close()
}
