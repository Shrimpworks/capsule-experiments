package store

import (
	"errors"
	"testing"
)

func TestEndpointFailureNeverBecomesFresh(t *testing.T) {
	s, dir := initialized(t)
	q := request(21)
	q.Failure = 1
	if err := s.RecordUnresolved(q); err != nil {
		t.Fatal(err)
	}
	generation := s.current.Generation
	if err := s.RecordUnresolved(q); err != nil || s.current.Generation != generation {
		t.Fatal("endpoint refusal not idempotent")
	}
	s.Close()
	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	cursor, err := reopened.LookupRecovery(request(24))
	if err != nil || cursor.Fresh || !cursor.Unresolved || cursor.Failure != 1 || cursor.Resume != 21 {
		t.Fatalf("unsafe endpoint recovery: %+v %v", cursor, err)
	}
	if err := reopened.BeforeSpawn(request(2)); !errors.Is(err, ErrRefused) {
		t.Fatal("failed endpoint reset intent")
	}
	if err := reopened.Fence(request(14)); !errors.Is(err, ErrRefused) {
		t.Fatal("endpoint failure identity replaced")
	}
}
