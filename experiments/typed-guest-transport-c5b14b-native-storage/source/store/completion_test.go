package store

import (
	"bytes"
	"errors"
	"sync"
	"testing"
)

func observation() Observation {
	return Observation{Binding: FixtureBinding(), Scope: FixtureObservationScope, Terminal: true, Absent: true, RootRemoved: true, Completion: FixtureResult()}
}
func completionRequest(effect uint32) Request {
	q := request(effect)
	if effect >= 14 && effect != 24 {
		q.Failure = 12
	}
	return q
}
func TestCompletionLastImmutableAndCopied(t *testing.T) {
	s, _ := initialized(t)
	if _, err := s.Deliver(request(13)); !errors.Is(err, ErrRefused) {
		t.Fatal("early delivery")
	}
	if _, err := s.CommitCompletion(request(12), observation()); !errors.Is(err, ErrRefused) {
		t.Fatal("completion before intent")
	}
	if err := s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"binding", "scope", "terminal", "absence", "root", "bytes"} {
		o := observation()
		switch kind {
		case "binding":
			o.Binding.Plan[0] ^= 1
		case "scope":
			o.Scope = "native-attested"
		case "terminal":
			o.Terminal = false
		case "absence":
			o.Absent = false
		case "root":
			o.RootRemoved = false
		case "bytes":
			o.Completion[0] ^= 1
		}
		if _, err := s.CommitCompletion(request(12), o); !errors.Is(err, ErrRefused) {
			t.Fatalf("accepted %s", kind)
		}
	}
	result, err := s.CommitCompletion(request(12), observation())
	if err != nil {
		t.Fatal(err)
	}
	generation := s.current.Generation
	result[0] ^= 1
	result, err = s.Deliver(request(13))
	if err != nil || !bytes.Equal(result, FixtureResult()) {
		t.Fatal("aliased result")
	}
	if _, err = s.CommitCompletion(request(12), observation()); err != nil || s.current.Generation != generation {
		t.Fatal("recommitted exact replay")
	}
	changed := observation()
	changed.Completion = append(changed.Completion, 'x')
	if _, err = s.CommitCompletion(request(12), changed); !errors.Is(err, ErrRefused) {
		t.Fatal("changed immutable result")
	}
}
func TestCompletionLostResponseReopenReplay(t *testing.T) {
	for _, edge := range []Edge{BeforePublish, AfterPublish, AfterDirectorySync} {
		t.Run(string(edge), func(t *testing.T) {
			s, dir := initialized(t)
			if err := s.BeforeSpawn(request(2)); err != nil {
				t.Fatal(err)
			}
			s.fault = func(at Edge) error {
				if at == edge {
					return errors.New("lost response")
				}
				return nil
			}
			if bytes, err := s.CommitCompletion(request(12), observation()); err == nil || len(bytes) != 0 {
				t.Fatal("fault returned completion")
			}
			if edge != BeforePublish {
				if _, err := s.Deliver(request(13)); !errors.Is(err, ErrFenced) {
					t.Fatal("uncertain handle delivered")
				}
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
			if edge == BeforePublish {
				if cursor.Fresh || !cursor.Unresolved {
					t.Fatal("uncommitted completion gained replay")
				}
				return
			}
			if cursor.Fresh || cursor.Failure != 12 || cursor.Resume != 22 {
				t.Fatalf("wrong replay cursor: %+v", cursor)
			}
			if err = reopened.ReopenCompletion(completionRequest(22)); err != nil {
				t.Fatal(err)
			}
			exact, err := reopened.Replay(completionRequest(23))
			if err != nil || !bytes.Equal(exact, FixtureResult()) {
				t.Fatal("lost immutable replay")
			}
			generation := reopened.current.Generation
			exact[0] ^= 1
			exact, err = reopened.Replay(completionRequest(23))
			if err != nil || !bytes.Equal(exact, FixtureResult()) || reopened.current.Generation != generation {
				t.Fatal("replay mutation/commit")
			}
			if err = reopened.BeforeSpawn(request(2)); !errors.Is(err, ErrRefused) {
				t.Fatal("replay allowed execution")
			}
		})
	}
}
func TestConcurrentImmutableReads(t *testing.T) {
	s, _ := initialized(t)
	if err := s.BeforeSpawn(request(2)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CommitCompletion(request(12), observation()); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for range 16 {
		group.Go(func() {
			for range 10 {
				b, err := s.Deliver(request(13))
				if err != nil || !bytes.Equal(b, FixtureResult()) {
					t.Errorf("bad concurrent read: %v", err)
				}
				if len(b) > 0 {
					b[0] ^= 1
				}
			}
		})
	}
	group.Wait()
}
