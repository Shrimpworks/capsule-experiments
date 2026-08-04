package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const recordedIdentity = `pid=42
ppid=10
startSec=100
startUsec=200
uid=501
gid=20
status=2
name=capsule-krun-console-runner
path=/trusted/runner
codeIdentifier=com.capsulecorp.spike.libkrun-runner
teamIdentifier=3DDR84M4JS
cdhash=abcdef
codeRequirement=valid
`

func TestSameImmutableIdentityAllowsReparentAndStatusChange(t *testing.T) {
	live := strings.ReplaceAll(recordedIdentity, "ppid=10", "ppid=1")
	live = strings.ReplaceAll(live, "status=2", "status=3")
	if !sameImmutableIdentity(recordedIdentity, live) {
		t.Fatal("mutable reparent/status fields must not invalidate exact immutable identity")
	}
}

func TestSameImmutableIdentityRejectsStartOrCodeChange(t *testing.T) {
	for name, live := range map[string]string{
		"start": strings.ReplaceAll(recordedIdentity, "startUsec=200", "startUsec=201"),
		"code":  strings.ReplaceAll(recordedIdentity, "cdhash=abcdef", "cdhash=012345"),
	} {
		t.Run(name, func(t *testing.T) {
			if sameImmutableIdentity(recordedIdentity, live) {
				t.Fatal("changed immutable identity was accepted")
			}
		})
	}
}

func TestDrainBoundedRetainsPrefixAndMarker(t *testing.T) {
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	go func() {
		_, _ = writer.Write([]byte("abcdefgh"))
		_ = writer.Close()
	}()

	path := filepath.Join(t.TempDir(), "attempt.stdout.capture")
	summary := drainBounded(reader, "drain", 4, path)
	if summary.ObservedBytes != 8 || summary.RetainedBytes != 4 || !summary.Truncated {
		t.Fatalf("unexpected summary: %+v", summary)
	}
	if summary.CapturePath != "attempt.stdout.capture" {
		t.Fatalf("capture path leaked more than basename: %q", summary.CapturePath)
	}
	bytes, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(bytes)
	if !strings.HasPrefix(text, "abcd\n[CAPSULE_TRUNCATED ") ||
		!strings.Contains(text, "limit_bytes=4 observed_bytes=8") {
		t.Fatalf("unexpected bounded capture: %q", text)
	}
}
