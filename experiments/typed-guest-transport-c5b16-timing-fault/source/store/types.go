// Package store is an experiment-only, one-attempt provider-state oracle.
// It supplies no native lifecycle observation, installed authority or product DB.
package store

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
)

var (
	ErrRefused       = errors.New("fixture transition refused")
	ErrFenced        = errors.New("fixture handle requires reopen")
	ErrAborted       = errors.New("publication aborted before activation")
	ErrIndeterminate = errors.New("publication outcome indeterminate")
)

// Binding identifies only this storage fixture, never a runner or guest.
type Binding struct {
	Registration [16]byte `json:"registration"`
	Attempt      [16]byte `json:"attempt"`
	Plan         [32]byte `json:"plan"`
	Profile      [32]byte `json:"profile"`
}

func FixtureBinding() Binding {
	r := sha256.Sum256([]byte("C5b14A storage-only registration"))
	a := sha256.Sum256([]byte("C5b14A storage-only attempt"))
	return Binding{Registration: [16]byte(r[:16]), Attempt: [16]byte(a[:16]),
		Plan:    sha256.Sum256([]byte("C5b14A storage-only plan")),
		Profile: sha256.Sum256([]byte("C5b14A no-native-observer profile"))}
}

func FixtureResult() []byte { return []byte("{\"fixture\":\"C5b14A\",\"ok\":true}\n") }

type snapshot struct {
	Version          string   `json:"version"`
	Binding          Binding  `json:"binding"`
	Generation       uint32   `json:"generation"`
	SpawnIntent      bool     `json:"spawnIntent"`
	Fenced           bool     `json:"fenced"`
	Failure          uint32   `json:"failure"`
	Outcome          uint32   `json:"outcome"`
	Step             uint32   `json:"step"`
	Resume           uint32   `json:"resume"`
	Unresolved       bool     `json:"unresolved"`
	Completion       []byte   `json:"completion"`
	CompletionSHA256 [32]byte `json:"completionSHA256"`
	ObservationScope string   `json:"observationScope"`
}

const maximumSnapshotBytes = 4096
const snapshotVersion = "capsule.c5b16.native-fixture.v1"

func (s snapshot) validate() error {
	if s.Version != snapshotVersion || s.Binding != FixtureBinding() || s.Generation < 1 || s.Generation > 32 {
		return ErrRefused
	}
	if (!s.SpawnIntent && s.Fenced && s.Failure != 2 && s.Failure != 1) || (!s.SpawnIntent && !s.Fenced && s.Generation != 1) || (s.SpawnIntent && s.Generation < 2) {
		return ErrRefused
	}
	if s.Fenced {
		if s.Failure < 1 || s.Failure > 13 || s.Outcome < 1 || s.Outcome > 3 {
			return ErrRefused
		}
		if !validCursor(s.Failure, s.Step, s.Resume) {
			return ErrRefused
		}
	} else if s.Failure != 0 || s.Outcome != 0 || s.Step != 0 || s.Resume != 0 || s.Unresolved {
		return ErrRefused
	}
	if s.Unresolved && !s.Fenced {
		return ErrRefused
	}
	if len(s.Completion) > 0 {
		if s.Generation < 3 || s.ObservationScope != FixtureObservationScope || !s.SpawnIntent || !bytes.Equal(s.Completion, FixtureResult()) || s.CompletionSHA256 != sha256.Sum256(s.Completion) {
			return ErrRefused
		}
	} else if s.CompletionSHA256 != ([32]byte{}) || s.ObservationScope != "" {
		return ErrRefused
	}
	if s.Fenced && s.Failure < 12 && len(s.Completion) > 0 {
		return ErrRefused
	}
	return nil
}

func validCursor(failure, step, resume uint32) bool {
	if failure == 1 {
		return step == 21 && resume == 21
	}
	if step == 14 || step == 15 {
		return resume == step
	}
	if failure >= 12 {
		return (step == 22 || step == 23) && resume == step
	}
	return (step == 16 && resume == 17) || (step >= 17 && step <= 20 && resume == step)
}

func encode(s snapshot) ([]byte, error) {
	if err := s.validate(); err != nil {
		return nil, err
	}
	b, err := json.Marshal(s)
	if err != nil || len(b)+1 > maximumSnapshotBytes {
		return nil, ErrRefused
	}
	return append(b, '\n'), nil
}
func decode(b []byte) (snapshot, error) {
	var s snapshot
	if len(b) > maximumSnapshotBytes {
		return s, ErrRefused
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err := d.Decode(&s); err != nil {
		return s, fmt.Errorf("%w: snapshot decode", ErrRefused)
	}
	exact, err := encode(s)
	if err != nil || !bytes.Equal(exact, b) {
		return s, ErrRefused
	}
	return s, nil
}
