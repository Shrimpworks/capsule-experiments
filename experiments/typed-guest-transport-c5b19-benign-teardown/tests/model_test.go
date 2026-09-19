package oracle

import (
	"bytes"
	"encoding/hex"
	"testing"
)

// Digest calculated independently from the exact domain-separated preimage:
// attempt=01*16, pid=42, sequence=7, creation tick=9, fixture SHA-256=04*32.
const processIdentityVector = "13eb9ba7e76fa3cb9142e197cd570d1dd9d1abe297cc40dff2410fde7700b29c"

func TestProcessIdentityKnownAnswer(t *testing.T) {
	attempt := [16]byte(bytes.Repeat([]byte{1}, 16))
	fixtureDigest := [32]byte(bytes.Repeat([]byte{4}, 32))
	got, err := deriveProcessIdentity(attempt, 42, 7, 9, fixtureDigest)
	if err != nil {
		t.Fatal(err)
	}
	want, err := hex.DecodeString(processIdentityVector)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got[:], want) {
		t.Fatalf("identity = %x, want %x", got, want)
	}
	for _, tc := range []struct {
		name     string
		attempt  [16]byte
		pid      uint32
		sequence uint64
		tick     uint64
		digest   [32]byte
	}{
		{"changed attempt", [16]byte(bytes.Repeat([]byte{2}, 16)), 42, 7, 9, fixtureDigest},
		{"changed pid", attempt, 43, 7, 9, fixtureDigest},
		{"changed sequence", attempt, 42, 8, 9, fixtureDigest},
		{"changed tick", attempt, 42, 7, 10, fixtureDigest},
		{"changed fixture", attempt, 42, 7, 9, [32]byte(bytes.Repeat([]byte{5}, 32))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed, err := deriveProcessIdentity(tc.attempt, tc.pid, tc.sequence, tc.tick, tc.digest)
			if err != nil || bytes.Equal(changed[:], want) {
				t.Fatalf("changed observation did not change identity: %x, %v", changed, err)
			}
		})
	}
}

func TestProcessIdentityRejectsInvalidObservations(t *testing.T) {
	attempt := [16]byte(bytes.Repeat([]byte{1}, 16))
	fixtureDigest := [32]byte(bytes.Repeat([]byte{4}, 32))
	for _, tc := range []struct {
		name     string
		attempt  [16]byte
		pid      uint32
		sequence uint64
		tick     uint64
		digest   [32]byte
	}{
		{"zero attempt", [16]byte{}, 42, 7, 9, fixtureDigest},
		{"zero pid", attempt, 0, 7, 9, fixtureDigest},
		{"pid overflow", attempt, 1 << 31, 7, 9, fixtureDigest},
		{"zero sequence", attempt, 42, 0, 9, fixtureDigest},
		{"zero tick", attempt, 42, 7, 0, fixtureDigest},
		{"zero fixture digest", attempt, 42, 7, 9, [32]byte{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := deriveProcessIdentity(tc.attempt, tc.pid, tc.sequence, tc.tick, tc.digest); err == nil {
				t.Fatal("invalid observation accepted")
			}
		})
	}
}
