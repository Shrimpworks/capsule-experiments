package store

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestBootstrapRefusesNonempty(t *testing.T) {
	dir := fixtureDir(t)
	path := filepath.Join(dir, "unrelated")
	if err := os.WriteFile(path, []byte("retain"), 0600); err != nil {
		t.Fatal(err)
	}
	if s, err := Initialize(dir); err == nil {
		s.Close()
		t.Fatal("nonempty bootstrap admitted")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 || entries[0].Name() != "unrelated" {
		t.Fatal("bootstrap changed refused directory")
	}
}

func TestLiveIdentityLossFences(t *testing.T) {
	for _, kind := range []string{"state-replaced", "state-edited", "lock-replaced", "directory-replaced", "pending-added"} {
		t.Run(kind, func(t *testing.T) {
			s, dir := initialized(t)
			live := filepath.Join(dir, "attempt.json")
			switch kind {
			case "state-replaced":
				b, err := os.ReadFile(live)
				if err != nil {
					t.Fatal(err)
				}
				if err = os.Remove(live); err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(live, b, 0600); err != nil {
					t.Fatal(err)
				}
			case "state-edited":
				if err := os.WriteFile(live, []byte("{}\n"), 0600); err != nil {
					t.Fatal(err)
				}
			case "lock-replaced":
				lock := filepath.Join(dir, "owner.lock")
				if err := os.Rename(lock, filepath.Join(dir, "old.lock")); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(lock, nil, 0600); err != nil {
					t.Fatal(err)
				}
			case "directory-replaced":
				old := dir + "-moved"
				if err := os.Rename(dir, old); err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() { os.RemoveAll(old) })
				if err := os.Mkdir(dir, 0700); err != nil {
					t.Fatal(err)
				}
			case "pending-added":
				if err := os.WriteFile(filepath.Join(dir, "pending.json"), []byte("retain"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			if err := s.BeforeSpawn(request(2)); !errors.Is(err, ErrFenced) {
				t.Fatalf("lost identity not fenced: %v", err)
			}
			if _, err := s.LookupRecovery(request(24)); !errors.Is(err, ErrFenced) {
				t.Fatal("fenced handle reused")
			}
		})
	}
}

func TestCanonicalSnapshotRefusals(t *testing.T) {
	s, _ := initialized(t)
	b, err := encode(s.current)
	if err != nil {
		t.Fatal(err)
	}
	badState := s.current
	badState.Binding.Attempt[0] ^= 1
	if _, err = encode(badState); !errors.Is(err, ErrRefused) {
		t.Fatal("cross-attempt snapshot accepted")
	}
	for _, bad := range [][]byte{
		append(bytes.Clone(b), ' '),
		append(bytes.Clone(b), b...),
		bytes.Replace(b, []byte(`"version":`), []byte(`"extra":0,"version":`), 1),
		bytes.Replace(b, []byte(`"generation":1`), []byte(`"generation":1,"generation":1`), 1),
		bytes.Replace(b, []byte(`"generation":1`), []byte(`"generation":0`), 1),
		bytes.Repeat([]byte(" "), maximumSnapshotBytes+1),
	} {
		if _, err := decode(bad); !errors.Is(err, ErrRefused) {
			t.Fatal("noncanonical snapshot accepted")
		}
	}
}

func TestMissingCompletionRemainsUnresolved(t *testing.T) {
	s, dir := initialized(t)
	if err := s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	for _, effect := range []uint32{14, 15} {
		q := request(effect)
		q.Failure = 12
		if effect == 14 {
			if err := s.Fence(q); err != nil {
				t.Fatal(err)
			}
		} else {
			if _, err := s.LookupFenced(q); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := s.ReopenCompletion(completionRequest(22)); !errors.Is(err, ErrRefused) {
		t.Fatal("missing completion manufactured")
	}
	q := request(21)
	q.Failure = 12
	q.Step = 22
	q.Resume = 22
	if err := s.RecordUnresolved(q); err != nil {
		t.Fatal(err)
	}
	s.Close()
	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	cursor, err := reopened.LookupRecovery(request(24))
	if err != nil || !cursor.Unresolved || cursor.Fresh || cursor.Resume != 22 {
		t.Fatalf("uncertainty lost: %+v %v", cursor, err)
	}
	if b, err := reopened.Replay(completionRequest(23)); err == nil || b != nil {
		t.Fatal("absent completion replayed")
	}
}
