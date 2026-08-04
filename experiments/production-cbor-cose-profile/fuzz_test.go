package profile

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"math/rand"
	"testing"
)

func FuzzExecutionPlanProfile(f *testing.F) {
	fixture := loadJSON[executionPlanFixture](f, repoPath("schemas/fixtures/execution-plan-v0.json"))
	bindings := executionBindings(f, fixture)
	f.Add(mustHex(f, fixture.PayloadHex))
	for _, name := range []string{
		"cbor-profile-duplicate-key.bin", "cbor-profile-indefinite-container.bin",
		"cbor-profile-map-order.bin", "cbor-profile-nonpreferred-integer.bin",
		"cbor-profile-invalid-utf8.bin", "cbor-execution-plan-depth-over.bin",
	} {
		f.Add(mustRead(f, repoPath("schemas/conformance/v0/shared/"+name)))
	}
	p := mustProfile(f)
	f.Fuzz(func(t *testing.T, wire []byte) {
		decoded, err := p.DecodeExecutionPlan(wire, bindings)
		if err != nil {
			return
		}
		if !bytes.Equal(decoded.Authoritative, wire) {
			t.Fatal("accepted plan lost authoritative bytes")
		}
		reencoded, err := p.EncodeExecutionPlan(decoded.Wire)
		if err != nil || !bytes.Equal(reencoded, wire) {
			t.Fatalf("accepted plan failed canonical round trip: %v", err)
		}
	})
}

func FuzzApprovalProfile(f *testing.F) {
	bindings := approvalBindings(f)
	for _, wire := range hardeningCasesByName(f) {
		f.Add(wire)
	}
	type vectors struct {
		Valid               string `json:"valid"`
		ValidComplementaryS string `json:"validComplementaryS"`
	}
	v := loadJSON[vectors](f, repoPath("experiments/gate-a2-cbor-cose/fixtures/go-vectors.json"))
	for _, encoded := range []string{v.Valid, v.ValidComplementaryS} {
		wire, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(wire)
	}
	p := mustProfile(f)
	f.Fuzz(func(t *testing.T, wire []byte) {
		verified, err := p.VerifyApproval(wire, bindings)
		if err != nil {
			return
		}
		if !bytes.Equal(verified.Envelope, wire) || verified.PayloadIdentity != sha256Bytes(verified.Payload) {
			t.Fatal("accepted approval lost authoritative or replay-identity bytes")
		}
		verifiedAgain, err := p.VerifyApproval(bytes.Clone(wire), bindings)
		if err != nil || verifiedAgain.PayloadIdentity != verified.PayloadIdentity {
			t.Fatalf("accepted approval was not stable: %v", err)
		}
	})
}

func TestDeterministicPlanRoundTripProperty(t *testing.T) {
	p := mustProfile(t)
	fixture := loadJSON[executionPlanFixture](t, repoPath("schemas/fixtures/execution-plan-v0.json"))
	bindings := executionBindings(t, fixture)
	decoded, err := p.DecodeExecutionPlan(mustHex(t, fixture.PayloadHex), bindings)
	if err != nil {
		t.Fatal(err)
	}
	random := rand.New(rand.NewSource(0x43415053554c45))
	for i := 0; i < 10_000; i++ {
		wire := cloneExecutionPlan(decoded.Wire)
		wire.SourceByteLength = uint64(random.Int63n(1_048_577))
		wire.InlineInputByteLength = uint64(random.Int63n(262_145))
		wire.WallTimeMS = uint64(random.Int63n(300_000)) + 1
		wire.OutputMaxJSONBytes = uint64(random.Int63n(262_144)) + 1
		wire.ExpiresAt = uint64(random.Int63n(9_007_199_254_740_991))
		encoded, err := p.EncodeExecutionPlan(wire)
		if err != nil {
			t.Fatalf("iteration %d encode: %v", i, err)
		}
		again, err := p.DecodeExecutionPlan(encoded, bindings)
		if err != nil {
			t.Fatalf("iteration %d decode: %v", i, err)
		}
		second, err := p.EncodeExecutionPlan(again.Wire)
		if err != nil || !bytes.Equal(encoded, second) {
			t.Fatalf("iteration %d deterministic round trip: %v", i, err)
		}
	}
}

func sha256Bytes(value []byte) [32]byte {
	return sha256.Sum256(value)
}
