package oracle

import (
	"bytes"
	"encoding/hex"
	"testing"
)

// This is the packet's literal 57-byte cancellation vector, not an encoder
// round trip. It deliberately gives each identity a different byte value.
const cancellationVector = "4335434e01010039" +
	"01010101010101010101010101010101" +
	"02020202020202020202020202020202" +
	"03030303030303030303030303030303" + "01"

func cancellationFixture(t *testing.T) ([]byte, cancelBindings) {
	t.Helper()
	frame, err := hex.DecodeString(cancellationVector)
	if err != nil {
		t.Fatal(err)
	}
	return frame, cancelBindings{
		Attempt:      [16]byte(bytes.Repeat([]byte{1}, 16)),
		Approval:     [16]byte(bytes.Repeat([]byte{2}, 16)),
		Registration: [16]byte(bytes.Repeat([]byte{3}, 16)),
	}
}

func TestCancellationKnownAnswer(t *testing.T) {
	frame, binding := cancellationFixture(t)
	if len(frame) != 57 {
		t.Fatalf("vector length = %d, want 57", len(frame))
	}
	if err := validateCancellationFrame(frame, binding); err != nil {
		t.Fatalf("valid packet refused: %v", err)
	}
}

func TestCancellationRejectsMutations(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func([]byte)
	}{
		{"magic", func(b []byte) { b[0] ^= 1 }},
		{"version", func(b []byte) { b[4]++ }},
		{"role", func(b []byte) { b[5]++ }},
		{"length", func(b []byte) { b[7]-- }},
		{"attempt", func(b []byte) { b[8] ^= 1 }},
		{"approval", func(b []byte) { b[24] ^= 1 }},
		{"registration", func(b []byte) { b[40] ^= 1 }},
		{"kind", func(b []byte) { b[56]++ }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := bytes.Clone(frame)
			tc.change(changed)
			if err := validateCancellationFrame(changed, binding); err == nil {
				t.Fatal("mutated packet accepted")
			}
		})
	}
	for _, tc := range []struct {
		name  string
		frame []byte
	}{
		{"short", frame[:56]},
		{"trailing", append(bytes.Clone(frame), 0)},
		{"empty", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateCancellationFrame(tc.frame, binding); err == nil {
				t.Fatal("invalid packet accepted")
			}
		})
	}
}

func TestCancellationAcceptsEachChangedValidFrozenBinding(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func(*cancelBindings)
	}{
		{"attempt", func(b *cancelBindings) { b.Attempt = [16]byte(bytes.Repeat([]byte{4}, 16)) }},
		{"approval", func(b *cancelBindings) { b.Approval = [16]byte(bytes.Repeat([]byte{5}, 16)) }},
		{"registration", func(b *cancelBindings) { b.Registration = [16]byte(bytes.Repeat([]byte{6}, 16)) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := binding
			tc.change(&changed)
			matchingFrame := bytes.Clone(frame)
			copy(matchingFrame[8:24], changed.Attempt[:])
			copy(matchingFrame[24:40], changed.Approval[:])
			copy(matchingFrame[40:56], changed.Registration[:])
			if err := validateCancellationFrame(matchingFrame, changed); err != nil {
				t.Fatalf("valid changed binding refused: %v", err)
			}
			if err := validateCancellationFrame(frame, changed); err == nil {
				t.Fatal("stale original frame accepted for changed binding")
			}
		})
	}
}

func TestCancellationRejectsInvalidFrozenBindings(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func(*cancelBindings)
	}{
		{"zero attempt", func(b *cancelBindings) { b.Attempt = [16]byte{} }},
		{"zero approval", func(b *cancelBindings) { b.Approval = [16]byte{} }},
		{"zero registration", func(b *cancelBindings) { b.Registration = [16]byte{} }},
		{"attempt equals approval", func(b *cancelBindings) { b.Attempt = b.Approval }},
		{"attempt equals registration", func(b *cancelBindings) { b.Attempt = b.Registration }},
		{"approval equals registration", func(b *cancelBindings) { b.Approval = b.Registration }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := binding
			tc.change(&changed)
			matchingFrame := bytes.Clone(frame)
			copy(matchingFrame[8:24], changed.Attempt[:])
			copy(matchingFrame[24:40], changed.Approval[:])
			copy(matchingFrame[40:56], changed.Registration[:])
			if err := validateCancellationFrame(matchingFrame, changed); err == nil {
				t.Fatal("invalid frozen binding accepted")
			}
		})
	}
}
