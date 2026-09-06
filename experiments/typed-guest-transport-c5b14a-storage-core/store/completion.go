package store

import (
	"bytes"
	"crypto/sha256"
)

const FixtureObservationScope = "storage-fixture-only-no-native-observer"

// Observation is trusted test testimony. The store cannot verify an OS lifecycle.
// C5b14B must bind a fixed native owner view before any integration claim.
type Observation struct {
	Binding                       Binding
	Scope                         string
	Terminal, Absent, RootRemoved bool
	Completion                    []byte
}

func (s *Store) CommitCompletion(q Request, observed Observation) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 12, true); err != nil {
		return nil, err
	}
	if !s.current.SpawnIntent || s.current.Fenced || observed.Binding != FixtureBinding() ||
		observed.Scope != FixtureObservationScope || !observed.Terminal || !observed.Absent || !observed.RootRemoved ||
		!bytes.Equal(observed.Completion, FixtureResult()) {
		return nil, ErrRefused
	}
	if len(s.current.Completion) > 0 {
		return bytes.Clone(s.current.Completion), nil
	}
	next := s.current
	next.Completion = bytes.Clone(observed.Completion)
	next.CompletionSHA256 = sha256.Sum256(next.Completion)
	next.ObservationScope = FixtureObservationScope
	if err := s.save(next); err != nil {
		return nil, err
	}
	return bytes.Clone(s.current.Completion), nil
}

// Deliver returns a defensive copy only after publication. This is a Go return
// value, not an authenticated native-client delivery channel.
func (s *Store) Deliver(q Request) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 13, true); err != nil {
		return nil, err
	}
	if s.current.Fenced || len(s.current.Completion) == 0 {
		return nil, ErrRefused
	}
	return bytes.Clone(s.current.Completion), nil
}
func (s *Store) ReopenCompletion(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 22, true); err != nil {
		return err
	}
	if !s.boundFailure(q) || q.Failure < 12 || len(s.current.Completion) == 0 ||
		(s.current.Step != 15 && s.current.Step != 22) {
		return ErrRefused
	}
	if s.current.Step == 22 {
		return nil
	}
	next := s.current
	next.Step = 22
	next.Resume = 22
	return s.save(next)
}
func (s *Store) Replay(q Request) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 23, true); err != nil {
		return nil, err
	}
	if !s.boundFailure(q) || q.Failure < 12 || len(s.current.Completion) == 0 ||
		(s.current.Step != 22 && s.current.Step != 23) {
		return nil, ErrRefused
	}
	if s.current.Step == 22 {
		next := s.current
		next.Step = 23
		next.Resume = 23
		if err := s.save(next); err != nil {
			return nil, err
		}
	}
	return bytes.Clone(s.current.Completion), nil
}
