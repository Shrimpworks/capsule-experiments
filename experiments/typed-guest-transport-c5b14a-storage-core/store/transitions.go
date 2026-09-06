package store

import (
	"bytes"
	"crypto/sha256"
	"os"
)

// Request mirrors logical effect/cursor fields, not the native C ABI layout.
// The future trusted in-process bridge must supply binding and observations.
type Request struct {
	Binding                        Binding
	Effect, Sequence               uint32
	Failure, Outcome, Step, Resume uint32
	MaximumBytes, FrameBytes       uint32
	FrameSHA256                    [32]byte
}

type Cursor struct {
	Fresh, Unresolved              bool
	Failure, Outcome, Step, Resume uint32
}

func (s *Store) requireCurrent() error {
	if err := s.checkOwner(); err != nil {
		return err
	}
	prior, err := encode(s.current)
	if err != nil {
		return err
	}
	identity := s.stateIdentity
	if err = s.readExisting(); err != nil {
		s.fenced = true
		return ErrFenced
	}
	current, err := encode(s.current)
	if err != nil || !bytes.Equal(prior, current) || !os.SameFile(identity, s.stateIdentity) {
		s.fenced = true
		return ErrFenced
	}
	return nil
}
func (s *Store) begin(q Request, effect uint32, frames bool) error {
	if q.Binding != FixtureBinding() || q.Effect != effect || q.Sequence != effect {
		return ErrRefused
	}
	if frames {
		if q.MaximumBytes != 4096 || q.FrameBytes != uint32(len(FixtureResult())) || q.FrameSHA256 != sha256.Sum256(FixtureResult()) {
			return ErrRefused
		}
	} else if q.MaximumBytes != 0 || q.FrameBytes != 0 || q.FrameSHA256 != ([32]byte{}) {
		return ErrRefused
	}
	if effect == 2 || effect == 12 || effect == 13 || effect == 24 {
		if q.Failure != 0 || q.Outcome != 0 || q.Step != 0 || q.Resume != 0 {
			return ErrRefused
		}
	} else {
		if q.Failure < 2 || q.Failure > 13 || q.Outcome < 1 || q.Outcome > 3 || !validCursor(q.Failure, q.Step, q.Resume) {
			return ErrRefused
		}
		if effect != 21 && q.Step != effect {
			return ErrRefused
		}
	}
	return s.requireCurrent()
}
func (s *Store) save(next snapshot) error { next.Generation++; return s.publish(next, false) }
func (s *Store) boundFailure(q Request) bool {
	return s.current.Fenced && s.current.Failure == q.Failure && s.current.Outcome == q.Outcome
}
func currentCursor(s snapshot) Cursor {
	return Cursor{Failure: s.Failure, Outcome: s.Outcome, Step: s.Step, Resume: s.Resume, Unresolved: s.Unresolved}
}

func (s *Store) BeforeSpawn(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 2, false); err != nil {
		return err
	}
	if s.current.SpawnIntent || s.current.Fenced {
		return ErrRefused
	}
	next := s.current
	next.SpawnIntent = true
	return s.save(next)
}
func (s *Store) Fence(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 14, false); err != nil {
		return err
	}
	if s.current.Fenced {
		if s.boundFailure(q) && s.current.Step == 14 {
			return nil
		}
		return ErrRefused
	}
	if !s.current.SpawnIntent && q.Failure != 2 {
		return ErrRefused
	}
	if len(s.current.Completion) > 0 && q.Failure < 12 {
		return ErrRefused
	}
	next := s.current
	next.Fenced = true
	next.Failure = q.Failure
	next.Outcome = q.Outcome
	next.Step = 14
	next.Resume = 14
	return s.save(next)
}
func (s *Store) LookupFenced(q Request) (Cursor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 15, false); err != nil {
		return Cursor{}, err
	}
	if !s.boundFailure(q) || (s.current.Step != 14 && s.current.Step != 15) {
		return Cursor{}, ErrRefused
	}
	if s.current.Step == 14 {
		next := s.current
		next.Step = 15
		next.Resume = 15
		if err := s.save(next); err != nil {
			return Cursor{}, err
		}
	}
	return currentCursor(s.current), nil
}
func (s *Store) BeforeTeardown(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 16, false); err != nil {
		return err
	}
	if !s.boundFailure(q) || q.Failure >= 12 || s.current.Step != 15 {
		return ErrRefused
	}
	next := s.current
	next.Step = 16
	next.Resume = 17
	return s.save(next)
}

// Checkpoint records intent before a repeatable reconciliation observation.
// It does not certify the previous or next native effect's outcome.
func (s *Store) Checkpoint(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if q.Effect < 17 || q.Effect > 20 {
		return ErrRefused
	}
	if err := s.begin(q, q.Effect, false); err != nil {
		return err
	}
	if !s.boundFailure(q) || q.Failure >= 12 {
		return ErrRefused
	}
	if q.Step == s.current.Step {
		return nil
	}
	if q.Step != s.current.Step+1 {
		return ErrRefused
	}
	next := s.current
	next.Step = q.Step
	next.Resume = q.Resume
	return s.save(next)
}

// LookupRecovery never turns retained may-exist intent into fresh authority.
// Lost process custody is represented as unresolved; no PID is retained/adopted.
func (s *Store) LookupRecovery(q Request) (Cursor, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 24, false); err != nil {
		return Cursor{}, err
	}
	if s.current.Fenced {
		return currentCursor(s.current), nil
	}
	if !s.current.SpawnIntent {
		return Cursor{Fresh: true}, nil
	}
	next := s.current
	next.Fenced = true
	next.Outcome = 3
	if len(next.Completion) > 0 {
		next.Failure = 12
		next.Step = 22
		next.Resume = 22
	} else {
		next.Failure = 2
		next.Step = 17
		next.Resume = 17
		next.Unresolved = true
	}
	if err := s.save(next); err != nil {
		return Cursor{}, err
	}
	return currentCursor(s.current), nil
}

func (s *Store) RecordUnresolved(q Request) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.begin(q, 21, false); err != nil {
		return err
	}
	if q.Step == 16 {
		return ErrRefused
	}
	if s.current.Fenced {
		if !s.boundFailure(q) || q.Step < s.current.Resume ||
			(q.Step > s.current.Resume+1 && !(s.current.Resume == 15 &&
				((q.Failure < 12 && q.Step == 17) || (q.Failure >= 12 && q.Step == 22)))) {
			return ErrRefused
		}
	} else if q.Step != 14 || (!s.current.SpawnIntent && q.Failure != 2) {
		return ErrRefused
	}
	next := s.current
	next.Fenced = true
	next.Failure = q.Failure
	next.Outcome = q.Outcome
	next.Step = q.Step
	next.Resume = q.Resume
	next.Unresolved = true
	if next.Step == s.current.Step && s.current.Unresolved {
		return nil
	}
	return s.save(next)
}
