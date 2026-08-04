// Package profile is a development-only comparison harness for Capsule's
// bounded deterministic-CBOR and COSE_Sign1 candidate profile. Product
// packages must not import it.
package profile

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"errors"
	"fmt"

	"capsule.local/capsule/internal/protocol/v0candidate"
	"github.com/fxamacker/cbor/v2"
	cose "github.com/veraison/go-cose"
)

const (
	MaxSafeInteger       = uint64(9_007_199_254_740_991)
	ApprovalEnvelopeMax  = 512
	ApprovalPayloadMax   = 256
	ApprovalProtectedMax = 128
	ApprovalKeyIDMax     = 64
	approvalContentType  = "application/capsule.approval-grant+cbor;v=0"
	approvalPurpose      = "capsule.plan.approve"
	approvalAudience     = "capsule.execution-supervisor"
)

type executionPlanWire struct {
	ObjectType                      string   `cbor:"1,keyasint"`
	ObjectVersion                   uint64   `cbor:"2,keyasint"`
	InstallationID                  []byte   `cbor:"3,keyasint"`
	EpochSequence                   uint64   `cbor:"4,keyasint"`
	EpochDigest                     []byte   `cbor:"5,keyasint"`
	SourceManifestDigest            []byte   `cbor:"6,keyasint"`
	SourceEntrypoint                string   `cbor:"7,keyasint"`
	SourceByteLength                uint64   `cbor:"8,keyasint"`
	InputSlot                       string   `cbor:"9,keyasint"`
	InlineInputDigest               []byte   `cbor:"10,keyasint"`
	InlineInputByteLength           uint64   `cbor:"11,keyasint"`
	RuntimeProfileAlias             string   `cbor:"12,keyasint"`
	RuntimeBundleManifestDigest     []byte   `cbor:"13,keyasint"`
	ProfileReviewAttestationDigests [][]byte `cbor:"14,keyasint"`
	ProfileRegistryEntryDigest      []byte   `cbor:"15,keyasint"`
	BackendValidationRecordDigest   []byte   `cbor:"16,keyasint"`
	BackendConfigurationDigest      []byte   `cbor:"17,keyasint"`
	TrustSnapshotDigest             []byte   `cbor:"18,keyasint"`
	PolicyDecisionDigest            []byte   `cbor:"19,keyasint"`
	WallTimeMS                      uint64   `cbor:"20,keyasint"`
	WallTimeOrigin                  string   `cbor:"21,keyasint"`
	OutputSlot                      string   `cbor:"22,keyasint"`
	OutputMaxJSONBytes              uint64   `cbor:"23,keyasint"`
	ExpiresAt                       uint64   `cbor:"24,keyasint"`
}

type planRegistrationWire struct {
	ObjectType           string `cbor:"1,keyasint"`
	ObjectVersion        uint64 `cbor:"2,keyasint"`
	RegistrationID       []byte `cbor:"3,keyasint"`
	RegistrationSequence uint64 `cbor:"4,keyasint"`
	PlanDigest           []byte `cbor:"5,keyasint"`
	InstallationID       []byte `cbor:"6,keyasint"`
	EpochSequence        uint64 `cbor:"7,keyasint"`
	EpochDigest          []byte `cbor:"8,keyasint"`
	SupervisorID         []byte `cbor:"9,keyasint"`
	ExpiresAt            uint64 `cbor:"10,keyasint"`
}

type approvalGrantWire struct {
	ObjectType    string `cbor:"1,keyasint"`
	ObjectVersion uint64 `cbor:"2,keyasint"`
	Installation  []byte `cbor:"3,keyasint"`
	EpochDigest   []byte `cbor:"4,keyasint"`
	Registration  []byte `cbor:"5,keyasint"`
	PlanDigest    []byte `cbor:"6,keyasint"`
	Supervisor    []byte `cbor:"7,keyasint"`
	AttemptNonce  []byte `cbor:"8,keyasint"`
	Purpose       string `cbor:"9,keyasint"`
	Audience      string `cbor:"10,keyasint"`
	IssuedAt      uint64 `cbor:"11,keyasint"`
	ExpiresAt     uint64 `cbor:"12,keyasint"`
}

type protectedHeaders struct {
	Algorithm   int64  `cbor:"1,keyasint"`
	ContentType string `cbor:"3,keyasint"`
	KeyID       []byte `cbor:"4,keyasint"`
}

type sourceManifestMemberWire struct {
	_          struct{} `cbor:",toarray"`
	Path       string
	Digest     []byte
	ByteLength uint64
}

type sourceManifestWire struct {
	ObjectType          string                     `cbor:"1,keyasint"`
	ObjectVersion       uint64                     `cbor:"2,keyasint"`
	Entrypoint          string                     `cbor:"3,keyasint"`
	Members             []sourceManifestMemberWire `cbor:"4,keyasint"`
	AggregateByteLength uint64                     `cbor:"5,keyasint"`
}

// ApprovalBindings is trusted caller context. KeyID is only a selector that
// must match this separately authorized public key; it never grants authority.
type ApprovalBindings struct {
	Expected            approvalGrantWire
	AuthorizedKeyID     []byte
	AuthorizedPublicKey *ecdsa.PublicKey
}

type DecodedExecutionPlan struct {
	Authoritative []byte
	Digest        [32]byte
	Wire          executionPlanWire
}

type DecodedPlanRegistration struct {
	Authoritative []byte
	Wire          planRegistrationWire
}

type DecodedSourceManifest struct {
	Authoritative []byte
	Digest        [32]byte
	Wire          sourceManifestWire
}

type VerifiedApproval struct {
	Envelope         []byte
	Payload          []byte
	Protected        []byte
	PayloadIdentity  [32]byte
	EnvelopeEvidence [32]byte
	Wire             approvalGrantWire
}

type Profile struct {
	enc               cbor.EncMode
	outerEnc          cbor.EncMode
	planDec           cbor.DecMode
	registrationDec   cbor.DecMode
	sourceManifestDec cbor.DecMode
	approvalOuterDec  cbor.DecMode
	approvalInnerDec  cbor.DecMode
}

func New() (*Profile, error) {
	encOptions := cbor.CanonicalEncOptions()
	encOptions.TagsMd = cbor.TagsForbidden
	enc, err := encOptions.EncMode()
	if err != nil {
		return nil, err
	}
	outerOptions := cbor.CanonicalEncOptions()
	outerOptions.TagsMd = cbor.TagsAllowed
	outerEnc, err := outerOptions.EncMode()
	if err != nil {
		return nil, err
	}
	planDec, err := strictDecMode(8, 16, 64, cbor.TagsForbidden)
	if err != nil {
		return nil, err
	}
	registrationDec, err := strictDecMode(4, 16, 16, cbor.TagsForbidden)
	if err != nil {
		return nil, err
	}
	sourceManifestDec, err := strictDecMode(4, 16, 16, cbor.TagsForbidden)
	if err != nil {
		return nil, err
	}
	approvalOuterDec, err := strictDecMode(4, 16, 16, cbor.TagsAllowed)
	if err != nil {
		return nil, err
	}
	approvalInnerDec, err := strictDecMode(4, 16, 16, cbor.TagsForbidden)
	if err != nil {
		return nil, err
	}
	return &Profile{
		enc: enc, outerEnc: outerEnc, planDec: planDec, registrationDec: registrationDec, sourceManifestDec: sourceManifestDec,
		approvalOuterDec: approvalOuterDec, approvalInnerDec: approvalInnerDec,
	}, nil
}

func (p *Profile) DecodeSourceManifest(received, sourceBytes []byte) (*DecodedSourceManifest, error) {
	if _, err := v0candidate.NewMJSMainSource(sourceBytes); err != nil {
		return nil, fmt.Errorf("trusted exact source bytes: %w", err)
	}
	if err := v0candidate.PredecodeSourceManifestCBOR(received); err != nil {
		return nil, fmt.Errorf("Capsule predecode: %w", err)
	}
	authoritative := bytes.Clone(received)
	var wire sourceManifestWire
	if err := p.sourceManifestDec.Unmarshal(authoritative, &wire); err != nil {
		return nil, fmt.Errorf("fxamacker typed decode: %w", err)
	}
	if err := p.requireCanonical(authoritative, wire); err != nil {
		return nil, err
	}
	if err := validateSourceManifest(wire, sourceBytes); err != nil {
		return nil, err
	}
	return &DecodedSourceManifest{Authoritative: authoritative, Digest: sha256.Sum256(authoritative), Wire: cloneSourceManifest(wire)}, nil
}

func (p *Profile) EncodeSourceManifest(wire sourceManifestWire) ([]byte, error) {
	if err := validateSourceManifestShape(wire); err != nil {
		return nil, err
	}
	return p.enc.Marshal(wire)
}

func strictDecMode(depth, arrays, maps int, tags cbor.TagsMode) (cbor.DecMode, error) {
	return (cbor.DecOptions{
		DupMapKey:         cbor.DupMapKeyEnforcedAPF,
		MaxNestedLevels:   depth,
		MaxArrayElements:  arrays,
		MaxMapPairs:       maps,
		IndefLength:       cbor.IndefLengthForbidden,
		TagsMd:            tags,
		UTF8:              cbor.UTF8RejectInvalid,
		ExtraReturnErrors: cbor.ExtraDecErrorUnknownField,
		BignumTag:         cbor.BignumTagForbidden,
		BinaryUnmarshaler: cbor.BinaryUnmarshalerNone,
		TextUnmarshaler:   cbor.TextUnmarshalerNone,
	}).DecMode()
}

func (p *Profile) DecodeExecutionPlan(received []byte, bindings v0candidate.ExecutionPlanRoleBindings) (*DecodedExecutionPlan, error) {
	if err := v0candidate.PredecodeExecutionPlanCBOR(received); err != nil {
		return nil, fmt.Errorf("Capsule predecode: %w", err)
	}
	authoritative := bytes.Clone(received)
	var wire executionPlanWire
	if err := p.planDec.Unmarshal(authoritative, &wire); err != nil {
		return nil, fmt.Errorf("fxamacker typed decode: %w", err)
	}
	if err := p.requireCanonical(authoritative, wire); err != nil {
		return nil, err
	}
	if err := validateExecutionPlan(wire, bindings); err != nil {
		return nil, err
	}
	return &DecodedExecutionPlan{Authoritative: authoritative, Digest: sha256.Sum256(authoritative), Wire: cloneExecutionPlan(wire)}, nil
}

func (p *Profile) DecodePlanRegistration(received []byte, bindings v0candidate.PlanRegistrationRoleBindings) (*DecodedPlanRegistration, error) {
	if err := v0candidate.PredecodePlanRegistrationCBOR(received); err != nil {
		return nil, fmt.Errorf("Capsule predecode: %w", err)
	}
	authoritative := bytes.Clone(received)
	var wire planRegistrationWire
	if err := p.registrationDec.Unmarshal(authoritative, &wire); err != nil {
		return nil, fmt.Errorf("fxamacker typed decode: %w", err)
	}
	if err := p.requireCanonical(authoritative, wire); err != nil {
		return nil, err
	}
	if err := validatePlanRegistration(wire, bindings); err != nil {
		return nil, err
	}
	return &DecodedPlanRegistration{Authoritative: authoritative, Wire: clonePlanRegistration(wire)}, nil
}

func (p *Profile) EncodeExecutionPlan(wire executionPlanWire) ([]byte, error) {
	if err := validateExecutionPlanShape(wire); err != nil {
		return nil, err
	}
	return p.enc.Marshal(wire)
}

func (p *Profile) EncodePlanRegistration(wire planRegistrationWire) ([]byte, error) {
	if err := validatePlanRegistrationShape(wire); err != nil {
		return nil, err
	}
	return p.enc.Marshal(wire)
}

func (p *Profile) VerifyApproval(received []byte, bindings ApprovalBindings) (*VerifiedApproval, error) {
	if len(received) == 0 || len(received) > ApprovalEnvelopeMax {
		return nil, errors.New("approval envelope raw-byte limit")
	}
	envelope := bytes.Clone(received)
	var tagged cbor.Tag
	if err := p.approvalOuterDec.Unmarshal(envelope, &tagged); err != nil {
		return nil, fmt.Errorf("bounded outer decode: %w", err)
	}
	if tagged.Number != cose.CBORTagSign1Message {
		return nil, errors.New("COSE_Sign1 tag must be exactly 18")
	}
	canonicalOuter, err := p.outerEnc.Marshal(tagged)
	if err != nil || !bytes.Equal(canonicalOuter, envelope) {
		return nil, errors.New("COSE_Sign1 is not canonical on wire")
	}

	var message cose.Sign1Message
	if err := message.UnmarshalCBOR(envelope); err != nil {
		return nil, fmt.Errorf("go-cose Sign1 decode: %w", err)
	}
	if len(message.Headers.Unprotected) != 0 || !bytes.Equal(message.Headers.RawUnprotected, []byte{0xa0}) {
		return nil, errors.New("unprotected headers must be the canonical empty map")
	}
	if len(message.Payload) == 0 || len(message.Payload) > ApprovalPayloadMax {
		return nil, errors.New("embedded approval payload raw-byte limit")
	}
	if len(message.Signature) != 64 {
		return nil, errors.New("ES256 signature must be exactly 64-byte R || S")
	}

	var protected []byte
	if err := p.approvalInnerDec.Unmarshal(message.Headers.RawProtected, &protected); err != nil {
		return nil, fmt.Errorf("protected bstr decode: %w", err)
	}
	if len(protected) == 0 || len(protected) > ApprovalProtectedMax {
		return nil, errors.New("protected header raw-byte limit")
	}
	var headers protectedHeaders
	if err := p.approvalInnerDec.Unmarshal(protected, &headers); err != nil {
		return nil, fmt.Errorf("protected typed decode: %w", err)
	}
	if err := p.requireCanonical(protected, headers); err != nil {
		return nil, fmt.Errorf("protected header: %w", err)
	}
	if headers.Algorithm != int64(cose.AlgorithmES256) || headers.ContentType != approvalContentType {
		return nil, errors.New("protected algorithm or content type outside profile")
	}
	if len(headers.KeyID) == 0 || len(headers.KeyID) > ApprovalKeyIDMax || !bytes.Equal(headers.KeyID, bindings.AuthorizedKeyID) {
		return nil, errors.New("protected key ID does not match trusted authorization")
	}
	if bindings.AuthorizedPublicKey == nil {
		return nil, errors.New("trusted authorized public key is required")
	}

	var wire approvalGrantWire
	if err := p.approvalInnerDec.Unmarshal(message.Payload, &wire); err != nil {
		return nil, fmt.Errorf("approval typed decode: %w", err)
	}
	if err := p.requireCanonical(message.Payload, wire); err != nil {
		return nil, fmt.Errorf("approval payload: %w", err)
	}
	if err := validateApproval(wire, bindings.Expected); err != nil {
		return nil, err
	}
	verifier, err := cose.NewVerifier(cose.AlgorithmES256, bindings.AuthorizedPublicKey)
	if err != nil {
		return nil, fmt.Errorf("trusted verifier construction: %w", err)
	}
	// The profile has no caller-supplied external AAD. go-cose constructs the
	// exact Sig_structure internally and verifies with the separately supplied key.
	if err := message.Verify(nil, verifier); err != nil {
		return nil, fmt.Errorf("go-cose signature verification: %w", err)
	}
	return &VerifiedApproval{
		Envelope: bytes.Clone(envelope), Payload: bytes.Clone(message.Payload), Protected: bytes.Clone(protected),
		PayloadIdentity: sha256.Sum256(message.Payload), EnvelopeEvidence: sha256.Sum256(envelope), Wire: cloneApproval(wire),
	}, nil
}

func (p *Profile) CaptureSigStructure(received []byte) ([]byte, error) {
	var message cose.Sign1Message
	if err := message.UnmarshalCBOR(received); err != nil {
		return nil, err
	}
	capture := &captureVerifier{algorithm: cose.AlgorithmES256}
	if err := message.Verify(nil, capture); err != nil {
		return nil, err
	}
	return bytes.Clone(capture.content), nil
}

type captureVerifier struct {
	algorithm cose.Algorithm
	content   []byte
}

func (v *captureVerifier) Algorithm() cose.Algorithm { return v.algorithm }
func (v *captureVerifier) Verify(content, _ []byte) error {
	v.content = bytes.Clone(content)
	return nil
}

func (p *Profile) requireCanonical(received []byte, value any) error {
	reencoded, err := p.enc.Marshal(value)
	if err != nil {
		return err
	}
	if !bytes.Equal(reencoded, received) {
		return errors.New("received bytes are not the canonical object encoding")
	}
	return nil
}

func validateExecutionPlan(w executionPlanWire, b v0candidate.ExecutionPlanRoleBindings) error {
	if err := validateExecutionPlanShape(w); err != nil {
		return err
	}
	if !bytes.Equal(w.InstallationID, b.InstallationID[:]) || !bytes.Equal(w.EpochDigest, b.EpochDigest[:]) ||
		!bytes.Equal(w.SourceManifestDigest, b.SourceManifestDigest[:]) || !bytes.Equal(w.InlineInputDigest, b.InlineInputDigest[:]) ||
		!bytes.Equal(w.RuntimeBundleManifestDigest, b.RuntimeBundleManifestDigest[:]) ||
		!bytes.Equal(w.ProfileRegistryEntryDigest, b.ProfileRegistryEntryDigest[:]) ||
		!bytes.Equal(w.BackendValidationRecordDigest, b.BackendValidationRecordDigest[:]) ||
		!bytes.Equal(w.BackendConfigurationDigest, b.BackendConfigurationDigest[:]) ||
		!bytes.Equal(w.TrustSnapshotDigest, b.TrustSnapshotDigest[:]) || !bytes.Equal(w.PolicyDecisionDigest, b.PolicyDecisionDigest[:]) {
		return errors.New("ExecutionPlan trusted role binding mismatch")
	}
	if len(w.ProfileReviewAttestationDigests) != len(b.ProfileReviewAttestationDigests) {
		return errors.New("ExecutionPlan review binding count mismatch")
	}
	for i := range w.ProfileReviewAttestationDigests {
		if !bytes.Equal(w.ProfileReviewAttestationDigests[i], b.ProfileReviewAttestationDigests[i][:]) {
			return errors.New("ExecutionPlan review binding mismatch")
		}
	}
	return nil
}

func validateSourceManifest(w sourceManifestWire, sourceBytes []byte) error {
	if err := validateSourceManifestShape(w); err != nil {
		return err
	}
	member := w.Members[0]
	digest := sha256.Sum256(sourceBytes)
	if uint64(len(sourceBytes)) != member.ByteLength || uint64(len(sourceBytes)) != w.AggregateByteLength ||
		!bytes.Equal(member.Digest, digest[:]) {
		return errors.New("SourceManifest trusted source-byte binding mismatch")
	}
	return nil
}

func validateSourceManifestShape(w sourceManifestWire) error {
	if w.ObjectType != "capsule.source-manifest" || w.ObjectVersion != 0 || w.Entrypoint != "main.mjs" {
		return errors.New("SourceManifest object type, version, or entrypoint")
	}
	if len(w.Members) != 1 || w.Members[0].Path != "main.mjs" || !boundedBytes(w.Members[0].Digest, 32) {
		return errors.New("SourceManifest closed member profile")
	}
	if w.Members[0].ByteLength > v0candidate.MJSMainSourceMaxBytes ||
		w.AggregateByteLength > v0candidate.MJSMainSourceMaxBytes ||
		w.Members[0].ByteLength != w.AggregateByteLength {
		return errors.New("SourceManifest byte-length profile")
	}
	return nil
}

func validateExecutionPlanShape(w executionPlanWire) error {
	if w.ObjectType != "capsule.execution-plan" || w.ObjectVersion != 0 {
		return errors.New("ExecutionPlan object type or version")
	}
	if !boundedNonzeroBytes(w.InstallationID, 16) || !boundedBytes(w.EpochDigest, 32) || !boundedBytes(w.SourceManifestDigest, 32) ||
		!boundedBytes(w.InlineInputDigest, 32) || !boundedBytes(w.RuntimeBundleManifestDigest, 32) ||
		!boundedBytes(w.ProfileRegistryEntryDigest, 32) || !boundedBytes(w.BackendValidationRecordDigest, 32) ||
		!boundedBytes(w.BackendConfigurationDigest, 32) || !boundedBytes(w.TrustSnapshotDigest, 32) || !boundedBytes(w.PolicyDecisionDigest, 32) {
		return errors.New("ExecutionPlan identifier or digest width")
	}
	if len(w.ProfileReviewAttestationDigests) < 1 || len(w.ProfileReviewAttestationDigests) > 8 {
		return errors.New("ExecutionPlan review count")
	}
	for _, digest := range w.ProfileReviewAttestationDigests {
		if !boundedBytes(digest, 32) {
			return errors.New("ExecutionPlan review digest width")
		}
	}
	if len(w.SourceEntrypoint) < 1 || len(w.SourceEntrypoint) > 256 || len(w.RuntimeProfileAlias) < 1 || len(w.RuntimeProfileAlias) > 128 ||
		w.InputSlot != "primary-data" || w.OutputSlot != "transformed-json" ||
		(w.WallTimeOrigin != "requested" && w.WallTimeOrigin != "trusted-default") {
		return errors.New("ExecutionPlan closed string or slot profile")
	}
	for _, value := range []uint64{w.EpochSequence, w.SourceByteLength, w.InlineInputByteLength, w.WallTimeMS, w.OutputMaxJSONBytes, w.ExpiresAt} {
		if value > MaxSafeInteger {
			return errors.New("ExecutionPlan UInt53 range")
		}
	}
	if w.WallTimeMS == 0 || w.OutputMaxJSONBytes == 0 {
		return errors.New("ExecutionPlan positive integer")
	}
	return nil
}

func validatePlanRegistration(w planRegistrationWire, b v0candidate.PlanRegistrationRoleBindings) error {
	if err := validatePlanRegistrationShape(w); err != nil {
		return err
	}
	if !bytes.Equal(w.RegistrationID, b.RegistrationID[:]) || !bytes.Equal(w.PlanDigest, b.PlanDigest[:]) ||
		!bytes.Equal(w.InstallationID, b.InstallationID[:]) || !bytes.Equal(w.EpochDigest, b.EpochDigest[:]) ||
		!bytes.Equal(w.SupervisorID, b.SupervisorID[:]) {
		return errors.New("PlanRegistration trusted role binding mismatch")
	}
	return nil
}

func validatePlanRegistrationShape(w planRegistrationWire) error {
	if w.ObjectType != "capsule.plan-registration" || w.ObjectVersion != 0 {
		return errors.New("PlanRegistration object type or version")
	}
	if !boundedNonzeroBytes(w.RegistrationID, 16) || !boundedBytes(w.PlanDigest, 32) || !boundedNonzeroBytes(w.InstallationID, 16) ||
		!boundedBytes(w.EpochDigest, 32) || !boundedNonzeroBytes(w.SupervisorID, 16) {
		return errors.New("PlanRegistration identifier or digest width")
	}
	for _, value := range []uint64{w.RegistrationSequence, w.EpochSequence, w.ExpiresAt} {
		if value > MaxSafeInteger {
			return errors.New("PlanRegistration UInt53 range")
		}
	}
	if w.RegistrationSequence == 0 {
		return errors.New("PlanRegistration positive sequence")
	}
	return nil
}

func validateApproval(got, expected approvalGrantWire) error {
	if got.ObjectType != "capsule.approval-grant" || got.ObjectVersion != 0 || got.Purpose != approvalPurpose || got.Audience != approvalAudience {
		return errors.New("ApprovalGrant type, version, purpose, or audience")
	}
	if !boundedNonzeroBytes(got.Installation, 16) || !boundedBytes(got.EpochDigest, 32) || !boundedNonzeroBytes(got.Registration, 16) ||
		!boundedBytes(got.PlanDigest, 32) || !boundedNonzeroBytes(got.Supervisor, 16) || !boundedNonzeroBytes(got.AttemptNonce, 16) {
		return errors.New("ApprovalGrant identifier or digest width")
	}
	if got.IssuedAt > MaxSafeInteger || got.ExpiresAt > MaxSafeInteger || got.IssuedAt >= got.ExpiresAt {
		return errors.New("ApprovalGrant timestamp profile")
	}
	if !approvalEqual(got, expected) {
		return errors.New("ApprovalGrant trusted purpose/audience/installation/epoch/registration/plan/nonce binding mismatch")
	}
	return nil
}

func boundedBytes(value []byte, length int) bool { return len(value) == length }
func boundedNonzeroBytes(value []byte, length int) bool {
	return len(value) == length && !bytes.Equal(value, make([]byte, length))
}

func cloneExecutionPlan(w executionPlanWire) executionPlanWire {
	w.InstallationID = bytes.Clone(w.InstallationID)
	w.EpochDigest = bytes.Clone(w.EpochDigest)
	w.SourceManifestDigest = bytes.Clone(w.SourceManifestDigest)
	w.InlineInputDigest = bytes.Clone(w.InlineInputDigest)
	w.RuntimeBundleManifestDigest = bytes.Clone(w.RuntimeBundleManifestDigest)
	w.ProfileReviewAttestationDigests = cloneByteSlices(w.ProfileReviewAttestationDigests)
	w.ProfileRegistryEntryDigest = bytes.Clone(w.ProfileRegistryEntryDigest)
	w.BackendValidationRecordDigest = bytes.Clone(w.BackendValidationRecordDigest)
	w.BackendConfigurationDigest = bytes.Clone(w.BackendConfigurationDigest)
	w.TrustSnapshotDigest = bytes.Clone(w.TrustSnapshotDigest)
	w.PolicyDecisionDigest = bytes.Clone(w.PolicyDecisionDigest)
	return w
}

func clonePlanRegistration(w planRegistrationWire) planRegistrationWire {
	w.RegistrationID = bytes.Clone(w.RegistrationID)
	w.PlanDigest = bytes.Clone(w.PlanDigest)
	w.InstallationID = bytes.Clone(w.InstallationID)
	w.EpochDigest = bytes.Clone(w.EpochDigest)
	w.SupervisorID = bytes.Clone(w.SupervisorID)
	return w
}

func cloneSourceManifest(w sourceManifestWire) sourceManifestWire {
	w.Members = append([]sourceManifestMemberWire(nil), w.Members...)
	for i := range w.Members {
		w.Members[i].Digest = bytes.Clone(w.Members[i].Digest)
	}
	return w
}

func cloneApproval(w approvalGrantWire) approvalGrantWire {
	w.Installation = bytes.Clone(w.Installation)
	w.EpochDigest = bytes.Clone(w.EpochDigest)
	w.Registration = bytes.Clone(w.Registration)
	w.PlanDigest = bytes.Clone(w.PlanDigest)
	w.Supervisor = bytes.Clone(w.Supervisor)
	w.AttemptNonce = bytes.Clone(w.AttemptNonce)
	return w
}

func cloneByteSlices(values [][]byte) [][]byte {
	result := make([][]byte, len(values))
	for i := range values {
		result[i] = bytes.Clone(values[i])
	}
	return result
}

func approvalEqual(a, b approvalGrantWire) bool {
	return a.ObjectType == b.ObjectType && a.ObjectVersion == b.ObjectVersion &&
		bytes.Equal(a.Installation, b.Installation) && bytes.Equal(a.EpochDigest, b.EpochDigest) &&
		bytes.Equal(a.Registration, b.Registration) && bytes.Equal(a.PlanDigest, b.PlanDigest) &&
		bytes.Equal(a.Supervisor, b.Supervisor) && bytes.Equal(a.AttemptNonce, b.AttemptNonce) &&
		a.Purpose == b.Purpose && a.Audience == b.Audience && a.IssuedAt == b.IssuedAt && a.ExpiresAt == b.ExpiresAt
}
