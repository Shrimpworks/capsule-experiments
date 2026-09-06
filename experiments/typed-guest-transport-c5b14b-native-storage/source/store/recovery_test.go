package store

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func setupAction(t *testing.T, name string) (*Store, string, func() error) {
	t.Helper()
	s, dir := initialized(t)
	spawn := func() {
		if err := s.BeforeSpawn(request(2)); err != nil {
			t.Fatal(err)
		}
	}
	fence := func(failure uint32) {
		q := request(14)
		q.Failure = failure
		if err := s.Fence(q); err != nil {
			t.Fatal(err)
		}
		q = request(15)
		q.Failure = failure
		if _, err := s.LookupFenced(q); err != nil {
			t.Fatal(err)
		}
	}
	if name == "spawn" {
		return s, dir, func() error { return s.BeforeSpawn(request(2)) }
	}
	spawn()
	switch name {
	case "fence":
		return s, dir, func() error { return s.Fence(request(14)) }
	case "lookup-recovery":
		return s, dir, func() error { _, err := s.LookupRecovery(request(24)); return err }
	case "completion":
		return s, dir, func() error { _, err := s.CommitCompletion(request(12), observation()); return err }
	case "reopen", "replay":
		if _, err := s.CommitCompletion(request(12), observation()); err != nil {
			t.Fatal(err)
		}
		fence(12)
		if name == "reopen" {
			return s, dir, func() error { return s.ReopenCompletion(completionRequest(22)) }
		}
		if err := s.ReopenCompletion(completionRequest(22)); err != nil {
			t.Fatal(err)
		}
		return s, dir, func() error { _, err := s.Replay(completionRequest(23)); return err }
	case "lookup-fenced":
		if err := s.Fence(request(14)); err != nil {
			t.Fatal(err)
		}
		return s, dir, func() error { _, err := s.LookupFenced(request(15)); return err }
	}
	fence(3)
	if name == "teardown" {
		return s, dir, func() error { return s.BeforeTeardown(request(16)) }
	}
	if err := s.BeforeTeardown(request(16)); err != nil {
		t.Fatal(err)
	}
	target := uint32(17)
	switch name {
	case "terminal":
		target = 18
	case "absence":
		target = 19
	case "root":
		target = 20
	case "unresolved":
		target = 20
	}
	for e := uint32(17); e < target; e++ {
		if err := s.Checkpoint(request(e)); err != nil {
			t.Fatal(err)
		}
	}
	if name == "unresolved" {
		q := request(21)
		q.Step = 20
		q.Resume = 20
		return s, dir, func() error { return s.RecordUnresolved(q) }
	}
	return s, dir, func() error { return s.Checkpoint(request(target)) }
}
func TestEveryMutationPublicationBoundary(t *testing.T) {
	names := []string{"spawn", "fence", "lookup-fenced", "teardown", "reconcile", "terminal", "absence", "root", "unresolved", "completion", "reopen", "replay", "lookup-recovery"}
	for _, name := range names {
		for _, edge := range []Edge{BeforePublish, AfterPublish, AfterDirectorySync} {
			t.Run(name+"/"+string(edge), func(t *testing.T) {
				s, dir, apply := setupAction(t, name)
				generation := s.current.Generation
				s.fault = func(at Edge) error {
					if at == edge {
						return errors.New("injected")
					}
					return nil
				}
				want := ErrIndeterminate
				if edge == BeforePublish {
					want = ErrAborted
				}
				if err := apply(); !errors.Is(err, want) {
					t.Fatalf("got %v want %v", err, want)
				}
				if edge != BeforePublish {
					if !s.fenced {
						t.Fatal("indeterminate handle unfenced")
					}
				}
				s.Close()
				reopened, err := Open(dir, nil)
				if err != nil {
					t.Fatal(err)
				}
				defer reopened.Close()
				if edge != BeforePublish {
					generation++
				}
				if reopened.current.Generation != generation {
					t.Fatalf("mixed/lost generation: %d != %d", reopened.current.Generation, generation)
				}
				if name == "teardown" && edge != BeforePublish && reopened.current.Resume != 17 {
					t.Fatal("teardown safe cursor lost")
				}
			})
		}
	}
}

// TestCrashWorker is a fixed subprocess fixture, selected only by this test's
// parent. It opens the parent's exact disposable directory and never launches
// a runner, accepts user content, or targets another process.
func TestCrashWorker(t *testing.T) {
	mode := os.Getenv("CAPSULE_C5B14_CRASH_MODE")
	if mode == "" {
		return
	}
	dir := os.Getenv("CAPSULE_C5B14_CRASH_DIRECTORY")
	edge := AfterPublish
	if mode == "staging" {
		edge = BeforePublish
	}
	s, err := Open(dir, func(at Edge) error {
		if at == edge {
			os.Exit(73)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	switch mode {
	case "spawn", "staging":
		err = s.BeforeSpawn(request(2))
	case "teardown":
		err = s.BeforeTeardown(request(16))
	case "completion":
		_, err = s.CommitCompletion(request(12), observation())
	default:
		t.Fatal("unknown fixed fixture")
	}
	t.Fatalf("crash edge not reached: %v", err)
}
func TestSubprocessCrashReopen(t *testing.T) {
	for _, mode := range []string{"spawn", "teardown", "completion", "staging"} {
		t.Run(mode, func(t *testing.T) {
			s, dir := initialized(t)
			if mode == "teardown" || mode == "completion" {
				if err := s.BeforeSpawn(request(2)); err != nil {
					t.Fatal(err)
				}
			}
			if mode == "teardown" {
				if err := s.Fence(request(14)); err != nil {
					t.Fatal(err)
				}
				if _, err := s.LookupFenced(request(15)); err != nil {
					t.Fatal(err)
				}
			}
			s.Close()
			command := exec.Command(os.Args[0], "-test.run=^TestCrashWorker$", "-test.timeout=10s")
			command.Env = append(os.Environ(), "CAPSULE_C5B14_CRASH_MODE="+mode, "CAPSULE_C5B14_CRASH_DIRECTORY="+dir)
			output, err := command.CombinedOutput()
			var exit *exec.ExitError
			if !errors.As(err, &exit) || exit.ExitCode() != 73 {
				t.Fatalf("wrong child outcome: %v %s", err, output)
			}
			reopened, err := Open(dir, nil)
			if mode == "staging" {
				if err == nil {
					reopened.Close()
					t.Fatal("orphan staging adopted")
				}
				if _, err = os.Stat(filepath.Join(dir, "pending.json")); err != nil {
					t.Fatal("orphan evidence deleted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			defer reopened.Close()
			cursor, err := reopened.LookupRecovery(request(24))
			if err != nil {
				t.Fatal(err)
			}
			if cursor.Fresh {
				t.Fatal("crash reset authority")
			}
			if mode == "completion" {
				if cursor.Resume != 22 {
					t.Fatal("completion lost")
				}
				if err = reopened.ReopenCompletion(completionRequest(22)); err != nil {
					t.Fatal(err)
				}
				if _, err = reopened.Replay(completionRequest(23)); err != nil {
					t.Fatal(err)
				}
			} else {
				if cursor.Resume != 17 {
					t.Fatal("unsafe effect resume")
				}
				if err = reopened.BeforeSpawn(request(2)); !errors.Is(err, ErrRefused) {
					t.Fatal("spawn redrive")
				}
				if mode == "teardown" {
					if err = reopened.BeforeTeardown(request(16)); !errors.Is(err, ErrRefused) {
						t.Fatal("signal redrive")
					}
				}
			}
		})
	}
}
