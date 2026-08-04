package gatea2

import "testing"

func TestOwnEnvelopeAndNegativeVectors(t *testing.T) {
	profile, err := NewProfile()
	if err != nil {
		t.Fatal(err)
	}
	wire, err := profile.Sign()
	if err != nil {
		t.Fatal(err)
	}
	if err := profile.Verify(wire); err != nil {
		t.Fatalf("valid envelope rejected: %v", err)
	}
	complement, err := profile.ComplementSignature(wire)
	if err != nil {
		t.Fatal(err)
	}
	if err := profile.Verify(complement); err != nil {
		t.Fatalf("mathematically equivalent complementary-S signature rejected: %v", err)
	}
	negative, err := profile.NegativeVectors()
	if err != nil {
		t.Fatal(err)
	}
	for name, candidate := range negative {
		t.Run(name, func(t *testing.T) {
			if err := profile.Verify(candidate); err == nil {
				t.Fatal("negative vector was accepted")
			}
		})
	}
}
