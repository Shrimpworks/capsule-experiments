package store

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestInitializeAndExclusiveReopen(t *testing.T) {
	dir := fixtureDir(t)
	s, err := Initialize(dir)
	if err != nil {
		t.Fatal(err)
	}
	if other, err := Open(dir, nil); err == nil {
		other.Close()
		t.Fatal("second owner admitted")
	}
	if _, err := Initialize(dir); err == nil {
		t.Fatal("reinitialized existing state")
	}
	if err = s.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(dir, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if reopened.current.Generation != 1 || reopened.current.SpawnIntent {
		t.Fatal("unexpected initial state")
	}
}
func TestPublicationBoundaries(t *testing.T) {
	for _, edge := range []Edge{BeforePublish, AfterPublish, AfterDirectorySync} {
		t.Run(string(edge), func(t *testing.T) {
			dir := fixtureDir(t)
			s, err := Initialize(dir)
			if err != nil {
				t.Fatal(err)
			}
			s.Close()
			s, err = Open(dir, func(at Edge) error {
				if at == edge {
					return errors.New("injected")
				}
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}
			next := s.current
			next.Generation++
			next.SpawnIntent = true
			err = s.publish(next, false)
			want := ErrIndeterminate
			if edge == BeforePublish {
				want = ErrAborted
			}
			if !errors.Is(err, want) {
				t.Fatalf("got %v want %v", err, want)
			}
			s.Close()
			s, err = Open(dir, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer s.Close()
			if s.current.SpawnIntent != (edge != BeforePublish) {
				t.Fatal("wrong retained state")
			}
		})
	}
}
func TestCorruptMissingAndExtraRefuse(t *testing.T) {
	for _, kind := range []string{"missing", "corrupt", "extra", "symlink"} {
		t.Run(kind, func(t *testing.T) {
			dir := fixtureDir(t)
			s, err := Initialize(dir)
			if err != nil {
				t.Fatal(err)
			}
			s.Close()
			live := filepath.Join(dir, "attempt.json")
			switch kind {
			case "missing":
				err = os.Remove(live)
			case "corrupt":
				err = os.WriteFile(live, []byte("{}\n"), 0600)
			case "extra":
				err = os.WriteFile(filepath.Join(dir, "pending.json"), []byte("partial"), 0600)
			case "symlink":
				if err = os.Rename(live, filepath.Join(dir, "other")); err == nil {
					err = os.Symlink("other", live)
				}
			}
			if err != nil {
				t.Fatal(err)
			}
			if reopened, err := Open(dir, nil); err == nil {
				reopened.Close()
				t.Fatal("invalid world admitted")
			}
		})
	}
}

func fixtureDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	return dir
}
