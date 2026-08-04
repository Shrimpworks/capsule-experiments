package profile

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"

	"capsule.local/capsule/internal/protocol/v0candidate"
	"github.com/fxamacker/cbor/v2"
	cose "github.com/veraison/go-cose"
)

type executionPlanFixture struct {
	InstallationIDHex                  string   `json:"installationIdHex"`
	EpochDigestHex                     string   `json:"epochDigestHex"`
	SourceManifestDigestHex            string   `json:"sourceManifestDigestHex"`
	InlineInputDigestHex               string   `json:"inlineInputDigestHex"`
	RuntimeBundleManifestDigestHex     string   `json:"runtimeBundleManifestDigestHex"`
	ProfileReviewAttestationDigestsHex []string `json:"profileReviewAttestationDigestsHex"`
	ProfileRegistryEntryDigestHex      string   `json:"profileRegistryEntryDigestHex"`
	BackendValidationRecordDigestHex   string   `json:"backendValidationRecordDigestHex"`
	BackendConfigurationDigestHex      string   `json:"backendConfigurationDigestHex"`
	TrustSnapshotDigestHex             string   `json:"trustSnapshotDigestHex"`
	PolicyDecisionDigestHex            string   `json:"policyDecisionDigestHex"`
	PayloadHex                         string   `json:"payloadHex"`
}

type planRegistrationFixture struct {
	RegistrationIDHex string `json:"registrationIdHex"`
	PlanDigestHex     string `json:"planDigestHex"`
	InstallationIDHex string `json:"installationIdHex"`
	EpochDigestHex    string `json:"epochDigestHex"`
	SupervisorIDHex   string `json:"supervisorIdHex"`
	PayloadHex        string `json:"payloadHex"`
}

type approvalFixture struct {
	ObjectType        string `json:"objectType"`
	ObjectVersion     uint64 `json:"objectVersion"`
	InstallationIDHex string `json:"installationIdHex"`
	EpochDigestHex    string `json:"epochDigestHex"`
	RegistrationIDHex string `json:"registrationIdHex"`
	PlanDigestHex     string `json:"planDigestHex"`
	SupervisorIDHex   string `json:"supervisorIdHex"`
	AttemptNonceHex   string `json:"attemptNonceHex"`
	Purpose           string `json:"purpose"`
	Audience          string `json:"audience"`
	IssuedAt          uint64 `json:"issuedAt"`
	ExpiresAt         uint64 `json:"expiresAt"`
	PayloadHex        string `json:"payloadHex"`
	ProtectedHex      string `json:"protectedHex"`
	Protected         struct {
		KeyIDHex string `json:"keyIdHex"`
	} `json:"protected"`
}

func TestFxamackerObjectWrappersMatchHandwrittenOracleAndKnownAnswers(t *testing.T) {
	p := mustProfile(t)
	planFixture := loadJSON[executionPlanFixture](t, repoPath("schemas/fixtures/execution-plan-v0.json"))
	planBytes := mustHex(t, planFixture.PayloadHex)
	planBindings := executionBindings(t, planFixture)

	gotPlan, err := p.DecodeExecutionPlan(planBytes, planBindings)
	if err != nil {
		t.Fatalf("candidate plan decode: %v", err)
	}
	oraclePlan, err := v0candidate.DecodeExecutionPlan(planBytes, planBindings)
	if err != nil {
		t.Fatalf("handwritten plan oracle: %v", err)
	}
	if !bytes.Equal(gotPlan.Authoritative, oraclePlan.AuthoritativeBytes()) || gotPlan.Digest != [32]byte(oraclePlan.Digest()) {
		t.Fatal("candidate and handwritten plan oracle disagree on authoritative bytes or digest")
	}
	reencodedPlan, err := p.EncodeExecutionPlan(gotPlan.Wire)
	if err != nil || !bytes.Equal(reencodedPlan, planBytes) {
		t.Fatalf("candidate plan known answer mismatch: err=%v", err)
	}

	registrationFixture := loadJSON[planRegistrationFixture](t, repoPath("schemas/fixtures/plan-registration-v0.json"))
	registrationBytes := mustHex(t, registrationFixture.PayloadHex)
	registrationBindings := registrationBindings(t, registrationFixture)
	gotRegistration, err := p.DecodePlanRegistration(registrationBytes, registrationBindings)
	if err != nil {
		t.Fatalf("candidate registration decode: %v", err)
	}
	oracleRegistration, err := v0candidate.DecodePlanRegistration(registrationBytes, registrationBindings)
	if err != nil {
		t.Fatalf("handwritten registration oracle: %v", err)
	}
	if !bytes.Equal(gotRegistration.Authoritative, oracleRegistration.AuthoritativeBytes()) {
		t.Fatal("candidate and handwritten registration oracle disagree on authoritative bytes")
	}
	reencodedRegistration, err := p.EncodePlanRegistration(gotRegistration.Wire)
	if err != nil || !bytes.Equal(reencodedRegistration, registrationBytes) {
		t.Fatalf("candidate registration known answer mismatch: err=%v", err)
	}

	planBytes[0] ^= 0xff
	if bytes.Equal(gotPlan.Authoritative, planBytes) {
		t.Fatal("candidate retained caller-owned plan bytes")
	}
	registrationBytes[0] ^= 0xff
	if bytes.Equal(gotRegistration.Authoritative, registrationBytes) {
		t.Fatal("candidate retained caller-owned registration bytes")
	}
}

func TestRetainedCBORPredecodeCorpus(t *testing.T) {
	type manifest struct {
		Cases []struct {
			ID         string `json:"id"`
			Object     string `json:"object"`
			WireFormat string `json:"wireFormat"`
			Fixture    struct {
				Path string `json:"path"`
			} `json:"fixture"`
			Expected struct {
				Decision string `json:"decision"`
			} `json:"expected"`
		} `json:"cases"`
	}
	m := loadJSON[manifest](t, repoPath("schemas/conformance/v0/manifest.json"))
	matched := 0
	for _, tc := range m.Cases {
		if tc.WireFormat != "cbor" || !strings.Contains(tc.ID, ".cbor.") || (tc.Object != "ExecutionPlan" && tc.Object != "PlanRegistration") {
			continue
		}
		matched++
		t.Run(tc.ID, func(t *testing.T) {
			wire := mustRead(t, repoPath(filepath.Join("schemas/conformance/v0", tc.Fixture.Path)))
			var err error
			if tc.Object == "ExecutionPlan" {
				err = v0candidate.PredecodeExecutionPlanCBOR(wire)
			} else {
				err = v0candidate.PredecodePlanRegistrationCBOR(wire)
			}
			if (err == nil) != (tc.Expected.Decision == "accept") {
				t.Fatalf("retained predecoder decision mismatch: err=%v", err)
			}
		})
	}
	if matched != 40 {
		t.Fatalf("replayed %d CBOR predecode cases, want 40", matched)
	}
}

func TestFxamackerSourceManifestWrapperReplaysRetainedCorpus(t *testing.T) {
	type manifest struct {
		Cases []struct {
			ID         string `json:"id"`
			Object     string `json:"object"`
			WireFormat string `json:"wireFormat"`
			Fixture    struct {
				Path string `json:"path"`
			} `json:"fixture"`
			Context struct {
				Source struct {
					Path string `json:"path"`
				} `json:"source"`
			} `json:"context"`
			Expected struct {
				Decision string `json:"decision"`
			} `json:"expected"`
		} `json:"cases"`
	}
	p := mustProfile(t)
	m := loadJSON[manifest](t, repoPath("schemas/conformance/v0/manifest.json"))
	matched := 0
	accepted := 0
	for _, tc := range m.Cases {
		if tc.Object != "SourceManifest" || tc.WireFormat != "cbor" {
			continue
		}
		matched++
		t.Run(tc.ID, func(t *testing.T) {
			wire := mustRead(t, repoPath(filepath.Join("schemas/conformance/v0", tc.Fixture.Path)))
			source := mustRead(t, repoPath(filepath.Join("schemas/conformance/v0", tc.Context.Source.Path)))
			got, err := p.DecodeSourceManifest(wire, source)
			wantAccept := tc.Expected.Decision == "accept"
			if (err == nil) != wantAccept {
				t.Fatalf("candidate decision mismatch: err=%v", err)
			}
			_, oracleErr := v0candidate.DecodeSourceManifest(wire, v0candidate.SourceManifestMediaType, source)
			if (oracleErr == nil) != wantAccept {
				t.Fatalf("handwritten oracle decision mismatch: err=%v", oracleErr)
			}
			if !wantAccept {
				return
			}
			accepted++
			reencoded, encodeErr := p.EncodeSourceManifest(got.Wire)
			if encodeErr != nil || !bytes.Equal(reencoded, wire) {
				t.Fatalf("candidate known answer mismatch: err=%v", encodeErr)
			}
		})
	}
	if matched != 17 || accepted != 4 {
		t.Fatalf("replayed %d SourceManifest cases with %d accepts, want 17 and 4", matched, accepted)
	}
}

func TestFxamackerRoleWrappersReplayApplicableDomainCorpus(t *testing.T) {
	type manifest struct {
		Cases []struct {
			ID      string `json:"id"`
			Object  string `json:"object"`
			Fixture struct {
				Path string `json:"path"`
			} `json:"fixture"`
			Expected struct {
				Decision string `json:"decision"`
			} `json:"expected"`
		} `json:"cases"`
	}
	p := mustProfile(t)
	planFixture := loadJSON[executionPlanFixture](t, repoPath("schemas/fixtures/execution-plan-v0.json"))
	planBindings := conformanceExecutionBindings(t)
	registrationBindings := conformanceRegistrationBindings(t)
	m := loadJSON[manifest](t, repoPath("schemas/conformance/v0/manifest.json"))
	matched := 0
	for _, tc := range m.Cases {
		applicable := strings.HasPrefix(tc.ID, "execution-plan.registration.") ||
			strings.HasPrefix(tc.ID, "execution-plan.domain.") ||
			strings.HasPrefix(tc.ID, "plan-registration.domain.") ||
			tc.ID == "plan-registration.binding.plan-a-registration-b"
		if !applicable {
			continue
		}
		matched++
		t.Run(tc.ID, func(t *testing.T) {
			wire := mustRead(t, repoPath(filepath.Join("schemas/conformance/v0", tc.Fixture.Path)))
			var err error
			if tc.Object == "ExecutionPlan" {
				_, err = p.DecodeExecutionPlan(wire, planBindings)
			} else {
				_, err = p.DecodePlanRegistration(wire, registrationBindings)
			}
			if (err == nil) != (tc.Expected.Decision == "accept") {
				t.Fatalf("candidate decision mismatch: err=%v", err)
			}
		})
	}
	if matched != 23 {
		t.Fatalf("replayed %d applicable role/domain cases, want 23", matched)
	}

	ordinary, err := p.DecodeExecutionPlan(mustHex(t, planFixture.PayloadHex), executionBindings(t, planFixture))
	if err != nil {
		t.Fatal(err)
	}
	wrongVersion := cloneExecutionPlan(ordinary.Wire)
	wrongVersion.ObjectVersion = 1
	wire, err := p.enc.Marshal(wrongVersion)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := p.DecodeExecutionPlan(wire, executionBindings(t, planFixture)); err == nil {
		t.Fatal("closed object wrapper accepted a wrong object version")
	}
}

func TestFxamackerRequiresCapsulePredecodeAndClosedWrappers(t *testing.T) {
	shared := repoPath("schemas/conformance/v0/shared")
	relaxed, err := (cbor.DecOptions{UTF8: cbor.UTF8DecodeInvalid}).DecMode()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		file   string
		wire   []byte
		accept func([]byte) error
	}{
		{"indefinite-length", "cbor-profile-indefinite-container.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"float", "cbor-profile-float.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"simple-value", "", []byte{0xf4}, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"arbitrary-tag", "", []byte{0xd8, 0x64, 0x00}, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"duplicate-key", "cbor-profile-duplicate-key.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"nonpreferred-integer", "cbor-profile-nonpreferred-integer.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"map-order", "cbor-profile-map-order.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"invalid-utf8", "cbor-profile-invalid-utf8.bin", nil, func(b []byte) error { var v any; return relaxed.Unmarshal(b, &v) }},
		{"trailing-data", "cbor-profile-trailing-data.bin", nil, func(b []byte) error { var v any; _, err := cbor.UnmarshalFirst(b, &v); return err }},
		{"depth-cap-plus-one", "cbor-execution-plan-depth-over.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"map-cap-plus-one", "cbor-execution-plan-map-entries-over.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"array-cap-plus-one", "cbor-execution-plan-array-elements-over.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
		{"raw-cap-plus-one", "cbor-execution-plan-raw-bytes-over.bin", nil, func(b []byte) error { var v any; return cbor.Unmarshal(b, &v) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			wire := tc.wire
			if tc.file != "" {
				wire = mustRead(t, filepath.Join(shared, tc.file))
			}
			if err := tc.accept(wire); err != nil {
				t.Fatalf("relaxed generic feature did not accept restoration probe: %v", err)
			}
			if err := v0candidate.PredecodeExecutionPlanCBOR(wire); err == nil {
				t.Fatal("Capsule predecoder failed to detect restored generic feature")
			}
		})
	}

	p := mustProfile(t)
	fixture := loadJSON[executionPlanFixture](t, repoPath("schemas/fixtures/execution-plan-v0.json"))
	want := mustHex(t, fixture.PayloadHex)
	unknown := append([]byte(nil), want...)
	if len(unknown) < 2 || unknown[0] != 0xb8 || unknown[1] != 24 {
		t.Fatalf("unexpected plan known-answer prefix %x", unknown[:2])
	}
	unknown[1] = 25
	unknown = append(unknown, 0x18, 0x19, 0x00)
	if _, err := p.DecodeExecutionPlan(unknown, executionBindings(t, fixture)); err == nil {
		t.Fatal("closed object wrapper accepted unknown field")
	}
	relaxedTyped, err := (cbor.DecOptions{DupMapKey: cbor.DupMapKeyEnforcedAPF}).DecMode()
	if err != nil {
		t.Fatal(err)
	}
	var decoded executionPlanWire
	if err := relaxedTyped.Unmarshal(unknown, &decoded); err != nil {
		t.Fatalf("generic typed decoder did not demonstrate ignored unknown field: %v", err)
	}
}

func TestGoCOSEApprovalProfileReplaysRetainedCorpus(t *testing.T) {
	p := mustProfile(t)
	bindings := approvalBindings(t)

	type corpus struct {
		Cases []struct {
			Name        string `json:"name"`
			Profile     string `json:"profile"`
			Expectation string `json:"expectation"`
			Wire        string `json:"wire"`
		} `json:"cases"`
	}
	c := loadJSON[corpus](t, repoPath("experiments/gate-a2-profile-hardening/fixtures/corpus.json"))
	matched := 0
	for _, tc := range c.Cases {
		if tc.Profile != "approval-grant" {
			continue
		}
		matched++
		t.Run(tc.Name, func(t *testing.T) {
			wire, err := base64.RawURLEncoding.DecodeString(tc.Wire)
			if err != nil {
				t.Fatal(err)
			}
			_, err = p.VerifyApproval(wire, bindings)
			if (err == nil) != (tc.Expectation == "accept") {
				t.Fatalf("decision mismatch: err=%v", err)
			}
		})
	}
	if matched != 82 {
		t.Fatalf("replayed %d retained ApprovalGrant cases, want 82", matched)
	}
}

func TestGoCOSEKnownAnswerSigStructureEquivalentSignaturesAndReplayIdentity(t *testing.T) {
	p := mustProfile(t)
	bindings := approvalBindings(t)
	type vectors struct {
		Valid               string `json:"valid"`
		ValidComplementaryS string `json:"validComplementaryS"`
		PayloadHex          string `json:"payloadHex"`
		ProtectedHex        string `json:"protectedHex"`
	}
	v := loadJSON[vectors](t, repoPath("experiments/gate-a2-cbor-cose/fixtures/go-vectors.json"))
	ordinary, err := base64.RawURLEncoding.DecodeString(v.Valid)
	if err != nil {
		t.Fatal(err)
	}
	highS, err := base64.RawURLEncoding.DecodeString(v.ValidComplementaryS)
	if err != nil {
		t.Fatal(err)
	}
	one, err := p.VerifyApproval(ordinary, bindings)
	if err != nil {
		t.Fatalf("ordinary signature: %v", err)
	}
	two, err := p.VerifyApproval(highS, bindings)
	if err != nil {
		t.Fatalf("complementary-S signature: %v", err)
	}
	if one.PayloadIdentity != two.PayloadIdentity || one.EnvelopeEvidence == two.EnvelopeEvidence {
		t.Fatal("equivalent signatures did not preserve payload replay identity and distinct envelope evidence")
	}

	captured, err := p.CaptureSigStructure(ordinary)
	if err != nil {
		t.Fatal(err)
	}
	want, err := p.enc.Marshal([]any{"Signature1", mustHex(t, v.ProtectedHex), []byte{}, mustHex(t, v.PayloadHex)})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(captured, want) {
		t.Fatalf("go-cose Sig_structure mismatch\n got %x\nwant %x", captured, want)
	}
}

func TestApprovalRequiresTrustedRoleAndKeyAuthorization(t *testing.T) {
	p := mustProfile(t)
	wire := mustRead(t, repoPath("schemas/conformance/v0/approval-grant/ordinary.cose"))
	base := approvalBindings(t)
	mutations := []struct {
		name   string
		mutate func(*ApprovalBindings)
	}{
		{"installation", func(b *ApprovalBindings) { b.Expected.Installation[0] ^= 1 }},
		{"epoch", func(b *ApprovalBindings) { b.Expected.EpochDigest[0] ^= 1 }},
		{"registration", func(b *ApprovalBindings) { b.Expected.Registration[0] ^= 1 }},
		{"plan", func(b *ApprovalBindings) { b.Expected.PlanDigest[0] ^= 1 }},
		{"supervisor", func(b *ApprovalBindings) { b.Expected.Supervisor[0] ^= 1 }},
		{"nonce", func(b *ApprovalBindings) { b.Expected.AttemptNonce[0] ^= 1 }},
		{"purpose", func(b *ApprovalBindings) { b.Expected.Purpose = "capsule.execution.attest" }},
		{"audience", func(b *ApprovalBindings) { b.Expected.Audience = "capsule.receipt-composer" }},
		{"key-id", func(b *ApprovalBindings) { b.AuthorizedKeyID = []byte("other-key") }},
		{"missing-key-authorization", func(b *ApprovalBindings) { b.AuthorizedPublicKey = nil }},
		{"wrong-authorized-key", func(b *ApprovalBindings) {
			x, y := elliptic.P256().ScalarBaseMult([]byte{2})
			b.AuthorizedPublicKey = &ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}
		}},
	}
	for _, tc := range mutations {
		t.Run(tc.name, func(t *testing.T) {
			b := cloneApprovalBindings(base)
			tc.mutate(&b)
			if _, err := p.VerifyApproval(wire, b); err == nil {
				t.Fatal("profile accepted absent or wrong trusted role/key authorization")
			}
		})
	}
}

func TestGoCOSEGenericFeaturesRemainOutsideTheProfile(t *testing.T) {
	p := mustProfile(t)
	bindings := approvalBindings(t)
	cases := hardeningCasesByName(t)
	names := []string{
		"protected-unknown-header", "protected-out-of-order", "nonempty-unprotected",
		"payload-unknown-field", "payload-nonpreferred-zero", "detached-null-payload",
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			wire := cases[name]
			var raw cose.Sign1Message
			if err := raw.UnmarshalCBOR(wire); err != nil {
				t.Fatalf("generic go-cose did not expose the restoration probe: %v", err)
			}
			if _, err := p.VerifyApproval(wire, bindings); err == nil {
				t.Fatal("Capsule wrapper accepted restored generic go-cose feature")
			}
		})
	}

	for _, name := range []string{"missing-tag", "protected-arbitrary-tag", "protected-wrong-algorithm", "protected-wrong-content-type", "protected-wrong-kid", "signature-der-shaped"} {
		t.Run("refusal-"+name, func(t *testing.T) {
			if _, err := p.VerifyApproval(cases[name], bindings); err == nil {
				t.Fatal("Capsule wrapper accepted forbidden envelope feature")
			}
		})
	}
}

func TestHeaderFamiliesExternalAADAndDetachedPayloadRefuse(t *testing.T) {
	p := mustProfile(t)
	bindings := approvalBindings(t)
	fixture := loadJSON[approvalFixture](t, repoPath("schemas/fixtures/approval-grant-v0.json"))
	payload := mustHex(t, fixture.PayloadHex)
	baseProtected := map[int64]any{1: int64(-7), 3: approvalContentType, 4: mustHex(t, fixture.Protected.KeyIDHex)}
	probes := []struct {
		name        string
		protected   map[int64]any
		unprotected map[int64]any
		external    []byte
	}{
		{"critical", mergeHeader(baseProtected, int64(2), []any{int64(1000)}, int64(1000), "understood-by-generic"), map[int64]any{}, nil},
		{"x5u-url", mergeHeader(baseProtected, cose.HeaderLabelX5U, "https://invalid.example/cert"), map[int64]any{}, nil},
		{"x5bag", mergeHeader(baseProtected, cose.HeaderLabelX5Bag, []any{[]byte{1, 2, 3}}), map[int64]any{}, nil},
		{"x5chain", mergeHeader(baseProtected, cose.HeaderLabelX5Chain, []any{[]byte{1, 2, 3}}), map[int64]any{}, nil},
		{"x5t", mergeHeader(baseProtected, cose.HeaderLabelX5T, []any{int64(-16), []byte{1, 2, 3}}), map[int64]any{}, nil},
		{"embedded-key", mergeHeader(baseProtected, int64(1001), map[int64]any{1: int64(2)}), map[int64]any{}, nil},
		{"counter-signature", baseProtected, map[int64]any{cose.HeaderLabelCounterSignature: []byte{1}}, nil},
		{"external-aad", baseProtected, map[int64]any{}, []byte("forbidden-external-aad")},
	}
	for _, tc := range probes {
		t.Run(tc.name, func(t *testing.T) {
			wire := signFixtureEnvelope(t, tc.protected, tc.unprotected, payload, tc.external)
			if _, err := p.VerifyApproval(wire, bindings); err == nil {
				t.Fatal("Capsule wrapper accepted forbidden COSE feature")
			}
		})
	}
	if _, err := p.VerifyApproval(hardeningCasesByName(t)["detached-null-payload"], bindings); err == nil {
		t.Fatal("Capsule wrapper accepted detached payload")
	}
}

func TestExactAndCapPlusOneAllocationBehavior(t *testing.T) {
	p := mustProfile(t)
	fixture := loadJSON[executionPlanFixture](t, repoPath("schemas/fixtures/execution-plan-v0.json"))
	plan := mustHex(t, fixture.PayloadHex)
	bindings := executionBindings(t, fixture)
	exactAllocs := testing.AllocsPerRun(1000, func() {
		if _, err := p.DecodeExecutionPlan(plan, bindings); err != nil {
			panic(err)
		}
	})
	over := mustRead(t, repoPath("schemas/conformance/v0/shared/cbor-execution-plan-raw-bytes-over.bin"))
	overAllocs := testing.AllocsPerRun(1000, func() {
		if _, err := p.DecodeExecutionPlan(over, bindings); err == nil {
			panic("cap-plus-one accepted")
		}
	})
	if overAllocs > 8 {
		t.Fatalf("cap-plus-one rejection allocated too much: %.2f allocations", overAllocs)
	}
	t.Logf("execution-plan exact allocations/run=%.2f cap+1 allocations/run=%.2f", exactAllocs, overAllocs)

	approval := mustRead(t, repoPath("schemas/conformance/v0/approval-grant/ordinary.cose"))
	approvalBindings := approvalBindings(t)
	approvalAllocs := testing.AllocsPerRun(1000, func() {
		if _, err := p.VerifyApproval(approval, approvalBindings); err != nil {
			panic(err)
		}
	})
	envelopeOver := mustRead(t, repoPath("schemas/conformance/v0/approval-grant/envelope-cap-plus-one.cose"))
	envelopeOverAllocs := testing.AllocsPerRun(1000, func() {
		if _, err := p.VerifyApproval(envelopeOver, approvalBindings); err == nil {
			panic("cap-plus-one accepted")
		}
	})
	if envelopeOverAllocs > 8 {
		t.Fatalf("approval cap-plus-one rejection allocated too much: %.2f allocations", envelopeOverAllocs)
	}
	t.Logf("approval exact allocations/run=%.2f cap+1 allocations/run=%.2f", approvalAllocs, envelopeOverAllocs)
	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		t.Fatalf("read process resource usage: %v", err)
	}
	t.Logf("process peak RSS raw=%d (bytes on darwin, KiB on linux) goos=%s", usage.Maxrss, runtime.GOOS)
}

func mustProfile(t testing.TB) *Profile {
	t.Helper()
	p, err := New()
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func repoPath(relative string) string { return filepath.Join("..", "..", relative) }

func loadJSON[T any](t testing.TB, path string) T {
	t.Helper()
	data := mustRead(t, path)
	var value T
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	return value
}

func mustRead(t testing.TB, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return data
}

func mustHex(t testing.TB, value string) []byte {
	t.Helper()
	decoded, err := hex.DecodeString(value)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}

func executionBindings(t testing.TB, fixture executionPlanFixture) v0candidate.ExecutionPlanRoleBindings {
	t.Helper()
	reviews := make([]v0candidate.ProfileReviewAttestationDigest, len(fixture.ProfileReviewAttestationDigestsHex))
	for i, value := range fixture.ProfileReviewAttestationDigestsHex {
		reviews[i] = mustDigest(t, value, v0candidate.NewProfileReviewAttestationDigest)
	}
	return v0candidate.ExecutionPlanRoleBindings{
		InstallationID:                  mustDigest(t, fixture.InstallationIDHex, v0candidate.NewInstallationID),
		EpochDigest:                     mustDigest(t, fixture.EpochDigestHex, v0candidate.NewTrustEpochDigest),
		SourceManifestDigest:            mustDigest(t, fixture.SourceManifestDigestHex, v0candidate.NewSourceManifestDigest),
		InlineInputDigest:               mustDigest(t, fixture.InlineInputDigestHex, v0candidate.NewInlineInputDigest),
		RuntimeBundleManifestDigest:     mustDigest(t, fixture.RuntimeBundleManifestDigestHex, v0candidate.NewRuntimeBundleManifestDigest),
		ProfileReviewAttestationDigests: reviews,
		ProfileRegistryEntryDigest:      mustDigest(t, fixture.ProfileRegistryEntryDigestHex, v0candidate.NewProfileRegistryEntryDigest),
		BackendValidationRecordDigest:   mustDigest(t, fixture.BackendValidationRecordDigestHex, v0candidate.NewBackendValidationRecordDigest),
		BackendConfigurationDigest:      mustDigest(t, fixture.BackendConfigurationDigestHex, v0candidate.NewBackendConfigurationDigest),
		TrustSnapshotDigest:             mustDigest(t, fixture.TrustSnapshotDigestHex, v0candidate.NewTrustSnapshotDigest),
		PolicyDecisionDigest:            mustDigest(t, fixture.PolicyDecisionDigestHex, v0candidate.NewPolicyDecisionDigest),
	}
}

func registrationBindings(t testing.TB, fixture planRegistrationFixture) v0candidate.PlanRegistrationRoleBindings {
	t.Helper()
	return v0candidate.PlanRegistrationRoleBindings{
		RegistrationID: mustDigest(t, fixture.RegistrationIDHex, v0candidate.NewRegistrationID),
		PlanDigest:     mustDigest(t, fixture.PlanDigestHex, v0candidate.NewExecutionPlanDigest),
		InstallationID: mustDigest(t, fixture.InstallationIDHex, v0candidate.NewInstallationID),
		EpochDigest:    mustDigest(t, fixture.EpochDigestHex, v0candidate.NewTrustEpochDigest),
		SupervisorID:   mustDigest(t, fixture.SupervisorIDHex, v0candidate.NewSupervisorID),
	}
}

func conformanceExecutionBindings(t testing.TB) v0candidate.ExecutionPlanRoleBindings {
	t.Helper()
	return v0candidate.ExecutionPlanRoleBindings{
		InstallationID:                  repeated16[v0candidate.InstallationID](0x11),
		EpochDigest:                     repeated32[v0candidate.TrustEpochDigest](0x22),
		SourceManifestDigest:            mustDigest(t, "e5e09b2435baedf897526a89c698c0b0531437a69472372ae426f62d801fc171", v0candidate.NewSourceManifestDigest),
		InlineInputDigest:               mustDigest(t, "bd9968c72c34a6779dfe3259937a1d9a9e558036c7cd4895ef634fbf76181e72", v0candidate.NewInlineInputDigest),
		RuntimeBundleManifestDigest:     repeated32[v0candidate.RuntimeBundleManifestDigest](0x55),
		ProfileReviewAttestationDigests: []v0candidate.ProfileReviewAttestationDigest{repeated32[v0candidate.ProfileReviewAttestationDigest](0x66), repeated32[v0candidate.ProfileReviewAttestationDigest](0x67)},
		ProfileRegistryEntryDigest:      repeated32[v0candidate.ProfileRegistryEntryDigest](0x77),
		BackendValidationRecordDigest:   repeated32[v0candidate.BackendValidationRecordDigest](0x88),
		BackendConfigurationDigest:      repeated32[v0candidate.BackendConfigurationDigest](0x99),
		TrustSnapshotDigest:             repeated32[v0candidate.TrustSnapshotDigest](0xaa),
		PolicyDecisionDigest:            repeated32[v0candidate.PolicyDecisionDigest](0xbb),
	}
}

func conformanceRegistrationBindings(t testing.TB) v0candidate.PlanRegistrationRoleBindings {
	t.Helper()
	return v0candidate.PlanRegistrationRoleBindings{
		RegistrationID: repeated16[v0candidate.RegistrationID](0x77),
		PlanDigest:     mustDigest(t, "627f9524479000dab6f3cee1d70c0428c63285bcadbc2cb3c6e8018b2dea008c", v0candidate.NewExecutionPlanDigest),
		InstallationID: repeated16[v0candidate.InstallationID](0x11),
		EpochDigest:    repeated32[v0candidate.TrustEpochDigest](0x22),
		SupervisorID:   repeated16[v0candidate.SupervisorID](0x55),
	}
}

func repeated16[T ~[16]byte](value byte) T {
	var result T
	for i := range result {
		result[i] = value
	}
	return result
}

func repeated32[T ~[32]byte](value byte) T {
	var result T
	for i := range result {
		result[i] = value
	}
	return result
}

func mustDigest[T any](t testing.TB, encoded string, constructor func([]byte) (T, error)) T {
	t.Helper()
	value, err := constructor(mustHex(t, encoded))
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func approvalBindings(t testing.TB) ApprovalBindings {
	t.Helper()
	f := loadJSON[approvalFixture](t, repoPath("schemas/fixtures/approval-grant-v0.json"))
	return ApprovalBindings{
		Expected: approvalGrantWire{
			ObjectType: f.ObjectType, ObjectVersion: f.ObjectVersion,
			Installation: mustHex(t, f.InstallationIDHex), EpochDigest: mustHex(t, f.EpochDigestHex),
			Registration: mustHex(t, f.RegistrationIDHex), PlanDigest: mustHex(t, f.PlanDigestHex),
			Supervisor: mustHex(t, f.SupervisorIDHex), AttemptNonce: mustHex(t, f.AttemptNonceHex),
			Purpose: f.Purpose, Audience: f.Audience, IssuedAt: f.IssuedAt, ExpiresAt: f.ExpiresAt,
		},
		AuthorizedKeyID: mustHex(t, f.Protected.KeyIDHex), AuthorizedPublicKey: fixturePrivateKey().Public().(*ecdsa.PublicKey),
	}
}

func cloneApprovalBindings(value ApprovalBindings) ApprovalBindings {
	value.Expected = cloneApproval(value.Expected)
	value.AuthorizedKeyID = bytes.Clone(value.AuthorizedKeyID)
	return value
}

func fixturePrivateKey() *ecdsa.PrivateKey {
	d, ok := new(big.Int).SetString("8E9B109E719098BF980487DF1F5D77E9CB29606EBED2263B5F57C213DF84F4B2", 16)
	if !ok {
		panic("invalid public fixture key")
	}
	x, y := elliptic.P256().ScalarBaseMult(d.Bytes())
	return &ecdsa.PrivateKey{PublicKey: ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, D: d}
}

func hardeningCasesByName(t testing.TB) map[string][]byte {
	t.Helper()
	type corpus struct {
		Cases []struct{ Name, Wire string } `json:"cases"`
	}
	c := loadJSON[corpus](t, repoPath("experiments/gate-a2-profile-hardening/fixtures/corpus.json"))
	result := make(map[string][]byte, len(c.Cases))
	for _, tc := range c.Cases {
		wire, err := base64.RawURLEncoding.DecodeString(tc.Wire)
		if err != nil {
			t.Fatal(err)
		}
		result[tc.Name] = wire
	}
	return result
}

func mergeHeader(base map[int64]any, additions ...any) map[int64]any {
	result := make(map[int64]any, len(base)+len(additions)/2)
	for key, value := range base {
		result[key] = value
	}
	for i := 0; i < len(additions); i += 2 {
		key, ok := additions[i].(int64)
		if !ok {
			panic(fmt.Sprintf("header key %T is not int64", additions[i]))
		}
		result[key] = additions[i+1]
	}
	return result
}

func signFixtureEnvelope(t testing.TB, protected, unprotected map[int64]any, payload, external []byte) []byte {
	t.Helper()
	enc, err := cbor.CanonicalEncOptions().EncMode()
	if err != nil {
		t.Fatal(err)
	}
	protectedBytes, err := enc.Marshal(protected)
	if err != nil {
		t.Fatal(err)
	}
	message := cose.NewSign1Message()
	message.Headers.Protected = make(cose.ProtectedHeader, len(protected))
	for key, value := range protected {
		message.Headers.Protected[key] = value
	}
	message.Headers.Unprotected = make(cose.UnprotectedHeader, len(unprotected))
	for key, value := range unprotected {
		message.Headers.Unprotected[key] = value
	}
	message.Headers.RawProtected, err = enc.Marshal(protectedBytes)
	if err != nil {
		t.Fatal(err)
	}
	message.Headers.RawUnprotected, err = enc.Marshal(unprotected)
	if err != nil {
		t.Fatal(err)
	}
	message.Payload = bytes.Clone(payload)
	signer, err := cose.NewSigner(cose.AlgorithmES256, fixturePrivateKey())
	if err != nil {
		t.Fatal(err)
	}
	if err := message.Sign(strings.NewReader(strings.Repeat("fixture-entropy", 16)), external, signer); err != nil {
		t.Fatal(err)
	}
	wire, err := message.MarshalCBOR()
	if err != nil {
		t.Fatal(err)
	}
	return wire
}
