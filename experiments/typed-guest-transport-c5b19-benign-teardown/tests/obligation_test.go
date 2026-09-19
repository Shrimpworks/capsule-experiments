package oracle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

// Generated independently from the Gate-2 field order, ten distinct fill
// bytes, record version 1, clock policy 1000/1000/1200 and trigger mask 0x07.
const obligationDigestVector = "9f28abcde4fc821a42bd006e8064734094508cf6d8c326feb0b152399f0b6a45"

func obligationFixture() obligationBindings {
	return obligationBindings{
		Installation: [16]byte(bytes.Repeat([]byte{1}, 16)),
		TrustEpoch:   [32]byte(bytes.Repeat([]byte{2}, 32)),
		Supervisor:   [32]byte(bytes.Repeat([]byte{3}, 32)),
		Attempt:      [16]byte(bytes.Repeat([]byte{4}, 16)),
		Approval:     [16]byte(bytes.Repeat([]byte{5}, 16)),
		Registration: [16]byte(bytes.Repeat([]byte{6}, 16)),
		Plan:         [32]byte(bytes.Repeat([]byte{7}, 32)),
		Profile:      [32]byte(bytes.Repeat([]byte{8}, 32)),
		Runner:       [32]byte(bytes.Repeat([]byte{9}, 32)),
		Preparation:  [16]byte(bytes.Repeat([]byte{10}, 16)),
	}
}

func TestObligationPreimageKnownAnswer(t *testing.T) {
	preimage, err := encodeObligationPreimage(obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	if len(preimage) != 295 {
		t.Fatalf("preimage length = %d, want 295", len(preimage))
	}
	want, err := hex.DecodeString(obligationDigestVector)
	if err != nil {
		t.Fatal(err)
	}
	got := sha256.Sum256(preimage)
	if !bytes.Equal(got[:], want) {
		t.Fatalf("obligation digest = %x, want %x", got, want)
	}
}

func TestObligationEveryValidBindingChangesExactBytes(t *testing.T) {
	base, err := encodeObligationPreimage(obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name   string
		from   int
		to     int
		change func(*obligationBindings)
	}{
		{"installation", 30, 46, func(b *obligationBindings) { b.Installation = [16]byte(bytes.Repeat([]byte{11}, 16)) }},
		{"trust epoch", 46, 78, func(b *obligationBindings) { b.TrustEpoch = [32]byte(bytes.Repeat([]byte{11}, 32)) }},
		{"supervisor", 78, 110, func(b *obligationBindings) { b.Supervisor = [32]byte(bytes.Repeat([]byte{11}, 32)) }},
		{"attempt", 110, 126, func(b *obligationBindings) { b.Attempt = [16]byte(bytes.Repeat([]byte{11}, 16)) }},
		{"approval", 126, 142, func(b *obligationBindings) { b.Approval = [16]byte(bytes.Repeat([]byte{11}, 16)) }},
		{"registration", 142, 158, func(b *obligationBindings) { b.Registration = [16]byte(bytes.Repeat([]byte{11}, 16)) }},
		{"plan", 158, 190, func(b *obligationBindings) { b.Plan = [32]byte(bytes.Repeat([]byte{11}, 32)) }},
		{"profile", 190, 222, func(b *obligationBindings) { b.Profile = [32]byte(bytes.Repeat([]byte{11}, 32)) }},
		{"runner", 222, 254, func(b *obligationBindings) { b.Runner = [32]byte(bytes.Repeat([]byte{11}, 32)) }},
		{"preparation", 254, 270, func(b *obligationBindings) { b.Preparation = [16]byte(bytes.Repeat([]byte{11}, 16)) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := obligationFixture()
			tc.change(&changed)
			got, err := encodeObligationPreimage(changed)
			if err != nil {
				t.Fatal(err)
			}
			want := bytes.Clone(base)
			for i := tc.from; i < tc.to; i++ {
				want[i] = 11
			}
			if !bytes.Equal(got, want) {
				t.Fatalf("changed %s binding produced wrong exact preimage", tc.name)
			}
		})
	}
}

func TestObligationRejectsZeroOrDuplicateBindings(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*obligationBindings)
	}{
		{"zero installation", func(b *obligationBindings) { b.Installation = [16]byte{} }},
		{"zero trust epoch", func(b *obligationBindings) { b.TrustEpoch = [32]byte{} }},
		{"zero supervisor", func(b *obligationBindings) { b.Supervisor = [32]byte{} }},
		{"zero attempt", func(b *obligationBindings) { b.Attempt = [16]byte{} }},
		{"zero approval", func(b *obligationBindings) { b.Approval = [16]byte{} }},
		{"zero registration", func(b *obligationBindings) { b.Registration = [16]byte{} }},
		{"zero plan", func(b *obligationBindings) { b.Plan = [32]byte{} }},
		{"zero profile", func(b *obligationBindings) { b.Profile = [32]byte{} }},
		{"zero runner", func(b *obligationBindings) { b.Runner = [32]byte{} }},
		{"zero preparation", func(b *obligationBindings) { b.Preparation = [16]byte{} }},
		{"duplicate ID", func(b *obligationBindings) { b.Preparation = b.Attempt }},
		{"duplicate digest", func(b *obligationBindings) { b.Runner = b.Profile }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			bindings := obligationFixture()
			tc.change(&bindings)
			if _, err := encodeObligationPreimage(bindings); err == nil {
				t.Fatal("invalid obligation binding accepted")
			}
		})
	}
}
