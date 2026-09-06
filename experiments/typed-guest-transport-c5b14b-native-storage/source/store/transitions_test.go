package store

import (
	"crypto/sha256"
	"errors"
	"testing"
)

func request(effect uint32) Request {
	q := Request{Binding: FixtureBinding(), Effect: effect, Sequence: effect}
	if effect >= 14 && effect != 24 {
		q.Failure = 3
		q.Outcome = 3
		q.Step = effect
		q.Resume = effect
		if effect == 16 {
			q.Resume = 17
		}
	}
	if effect == 12 || effect == 13 || effect == 22 || effect == 23 {
		q.MaximumBytes = 4096
		q.FrameBytes = uint32(len(FixtureResult()))
		q.FrameSHA256 = sha256.Sum256(FixtureResult())
	}
	return q
}
func initialized(t *testing.T) (*Store, string) {
	t.Helper()
	dir := fixtureDir(t)
	s, err := Initialize(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, dir
}
func TestIntentRestartNeverFresh(t *testing.T) {
	s, dir := initialized(t)
	fresh, err := s.LookupRecovery(request(24))
	if err != nil || !fresh.Fresh {
		t.Fatalf("fresh: %+v %v", fresh, err)
	}
	if err = s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	if err = s.BeforeSpawn(request(2)); !errors.Is(err, ErrRefused) {
		t.Fatal("spawn redrive")
	}
	s.Close()
	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	cursor, err := reopened.LookupRecovery(request(24))
	if err != nil {
		t.Fatal(err)
	}
	if cursor.Fresh || !cursor.Unresolved || cursor.Resume != 17 || cursor.Failure != 2 {
		t.Fatalf("lost custody: %+v", cursor)
	}
	if err = reopened.BeforeSpawn(request(2)); !errors.Is(err, ErrRefused) {
		t.Fatal("restart granted fresh spawn")
	}
}
func TestTeardownPersistsSafeCursorAndCannotRedrive(t *testing.T) {
	s, dir := initialized(t)
	if err := s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	if err := s.Fence(request(14)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LookupFenced(request(15)); err != nil {
		t.Fatal(err)
	}
	bad := request(16)
	bad.Resume = 16
	if err := s.BeforeTeardown(bad); !errors.Is(err, ErrRefused) {
		t.Fatal("unsafe cursor accepted")
	}
	if err := s.BeforeTeardown(request(16)); err != nil {
		t.Fatal(err)
	}
	if s.current.Step != 16 || s.current.Resume != 17 {
		t.Fatal("safe cursor absent")
	}
	s.Close()
	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if err = reopened.BeforeTeardown(request(16)); !errors.Is(err, ErrRefused) {
		t.Fatal("teardown redrive")
	}
	for effect := uint32(17); effect <= 20; effect++ {
		if err = reopened.Checkpoint(request(effect)); err != nil {
			t.Fatal(err)
		}
	}
	q := request(21)
	q.Step = 20
	q.Resume = 20
	if err = reopened.RecordUnresolved(q); err != nil {
		t.Fatal(err)
	}
	if !reopened.current.Unresolved || !reopened.current.Fenced {
		t.Fatal("cleanup uncertainty cleared")
	}
}
func TestBoundRequestsAndSkippedRecoveryRefuse(t *testing.T) {
	s, _ := initialized(t)
	q := request(2)
	q.Binding.Attempt[0] ^= 1
	if err := s.BeforeSpawn(q); !errors.Is(err, ErrRefused) {
		t.Fatal("cross-attempt")
	}
	if err := s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	if err := s.Checkpoint(request(20)); !errors.Is(err, ErrRefused) {
		t.Fatal("skipped recovery")
	}
	if err := s.Fence(request(14)); err != nil {
		t.Fatal(err)
	}
	q = request(15)
	q.Outcome = 1
	if _, err := s.LookupFenced(q); !errors.Is(err, ErrRefused) {
		t.Fatal("changed failure identity")
	}
}
