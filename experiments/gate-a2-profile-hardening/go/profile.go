package hardening

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"math/big"

	"github.com/fxamacker/cbor/v2"
)

const (
	COSESign1Tag      = uint64(18)
	ES256             = int64(-7)
	MaxEnvelopeBytes  = 4096
	MaxProtectedBytes = 256
	MaxPayloadBytes   = 2048
	MaxKeyIDBytes     = 64
	MaxTextBytes      = 96
)

type Kind string

const (
	ApprovalGrantKind         Kind = "approval-grant"
	EnforcementTranscriptKind Kind = "enforcement-transcript"
)

type ApprovalGrant struct {
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

// EnforcementTranscript is a second, deliberately bounded candidate used to
// exercise mutually exclusive signed-object rules. It is spike-only and not a
// proposal for the final product contract.
type EnforcementTranscript struct {
	ObjectType    string `cbor:"1,keyasint"`
	ObjectVersion uint64 `cbor:"2,keyasint"`
	Installation  []byte `cbor:"3,keyasint"`
	EpochDigest   []byte `cbor:"4,keyasint"`
	Registration  []byte `cbor:"5,keyasint"`
	AttemptID     []byte `cbor:"6,keyasint"`
	PlanDigest    []byte `cbor:"7,keyasint"`
	EventRoot     []byte `cbor:"8,keyasint"`
	Purpose       string `cbor:"9,keyasint"`
	Audience      string `cbor:"10,keyasint"`
	TerminalState string `cbor:"11,keyasint"`
	TeardownState string `cbor:"12,keyasint"`
	FinishedAt    uint64 `cbor:"13,keyasint"`
}

type protectedHeaders struct {
	Algorithm   int64  `cbor:"1,keyasint"`
	ContentType string `cbor:"3,keyasint"`
	KeyID       []byte `cbor:"4,keyasint"`
}

type Profile struct {
	enc cbor.EncMode
	dec cbor.DecMode
}

func NewProfile() (*Profile, error) {
	enc, err := cbor.CoreDetEncOptions().EncMode()
	if err != nil {
		return nil, err
	}
	dec, err := (cbor.DecOptions{
		DupMapKey:         cbor.DupMapKeyEnforcedAPF,
		IndefLength:       cbor.IndefLengthForbidden,
		TagsMd:            cbor.TagsAllowed,
		UTF8:              cbor.UTF8RejectInvalid,
		MaxNestedLevels:   12,
		MaxArrayElements:  16,
		MaxMapPairs:       16,
		ExtraReturnErrors: cbor.ExtraDecErrorUnknownField,
	}).DecMode()
	if err != nil {
		return nil, err
	}
	return &Profile{enc: enc, dec: dec}, nil
}

func ExpectedApproval() ApprovalGrant {
	return ApprovalGrant{
		ObjectType: "capsule.approval-grant", ObjectVersion: 0,
		Installation: repeated(0x11, 16), EpochDigest: repeated(0x22, 32),
		Registration: repeated(0x33, 16), PlanDigest: repeated(0x44, 32),
		Supervisor: repeated(0x55, 16), AttemptNonce: repeated(0x66, 16),
		Purpose: "capsule.plan.approve", Audience: "capsule.execution-supervisor",
		IssuedAt: 1_785_456_000, ExpiresAt: 1_785_456_300,
	}
}

func ExpectedTranscript() EnforcementTranscript {
	return EnforcementTranscript{
		ObjectType: "capsule.enforcement-transcript", ObjectVersion: 0,
		Installation: repeated(0x11, 16), EpochDigest: repeated(0x22, 32),
		Registration: repeated(0x33, 16), AttemptID: repeated(0x77, 16),
		PlanDigest: repeated(0x44, 32), EventRoot: repeated(0x88, 32),
		Purpose: "capsule.execution.attest", Audience: "capsule.receipt-composer",
		TerminalState: "completed", TeardownState: "destroyed", FinishedAt: 1_785_456_360,
	}
}

func contentType(kind Kind) (string, error) {
	switch kind {
	case ApprovalGrantKind:
		return "application/capsule.approval-grant+cbor;v=0", nil
	case EnforcementTranscriptKind:
		return "application/capsule.enforcement-transcript+cbor;v=0", nil
	default:
		return "", fmt.Errorf("unknown profile kind %q", kind)
	}
}

func keyID(kind Kind) []byte {
	if kind == ApprovalGrantKind {
		return []byte("approval-test-key")
	}
	return []byte("supervisor-test-key")
}

func (p *Profile) Payload(kind Kind) ([]byte, error) {
	switch kind {
	case ApprovalGrantKind:
		return p.enc.Marshal(ExpectedApproval())
	case EnforcementTranscriptKind:
		return p.enc.Marshal(ExpectedTranscript())
	default:
		return nil, fmt.Errorf("unknown profile kind %q", kind)
	}
}

func (p *Profile) Protected(kind Kind) ([]byte, error) {
	ct, err := contentType(kind)
	if err != nil {
		return nil, err
	}
	return p.enc.Marshal(protectedHeaders{Algorithm: ES256, ContentType: ct, KeyID: keyID(kind)})
}

func (p *Profile) Sign(kind Kind) ([]byte, error) {
	payload, err := p.Payload(kind)
	if err != nil {
		return nil, err
	}
	protected, err := p.Protected(kind)
	if err != nil {
		return nil, err
	}
	return p.signParts(protected, map[int64]any{}, payload, nil)
}

func (p *Profile) Verify(kind Kind, wire []byte) error {
	if len(wire) == 0 || len(wire) > MaxEnvelopeBytes {
		return fmt.Errorf("envelope byte length %d outside 1..%d", len(wire), MaxEnvelopeBytes)
	}
	var tagged cbor.Tag
	if err := p.dec.Unmarshal(wire, &tagged); err != nil {
		return fmt.Errorf("decode COSE_Sign1: %w", err)
	}
	if tagged.Number != COSESign1Tag {
		return fmt.Errorf("COSE tag: got %d, want %d", tagged.Number, COSESign1Tag)
	}
	canonical, err := p.enc.Marshal(tagged)
	if err != nil || !bytes.Equal(canonical, wire) {
		return errors.New("COSE_Sign1 is not canonical on wire")
	}
	items, ok := tagged.Content.([]any)
	if !ok || len(items) != 4 {
		return errors.New("COSE_Sign1 content must be a four-item array")
	}
	protected, ok := items[0].([]byte)
	if !ok || len(protected) == 0 || len(protected) > MaxProtectedBytes {
		return errors.New("protected header must be a bounded nonempty byte string")
	}
	if unprotected, ok := items[1].(map[any]any); !ok || len(unprotected) != 0 {
		return errors.New("unprotected headers are forbidden")
	}
	payload, ok := items[2].([]byte)
	if !ok || len(payload) == 0 || len(payload) > MaxPayloadBytes {
		return errors.New("embedded payload must be a bounded nonempty byte string")
	}
	signature, ok := items[3].([]byte)
	if !ok || len(signature) != 64 {
		return errors.New("ES256 signature must be exactly 64-byte raw R || S")
	}
	if err := p.validateProtected(kind, protected); err != nil {
		return err
	}
	if err := p.validatePayload(kind, payload); err != nil {
		return err
	}
	signatureInput, err := p.enc.Marshal([]any{"Signature1", protected, []byte{}, payload})
	if err != nil {
		return err
	}
	digest := sha256.Sum256(signatureInput)
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])
	if !validScalar(r) || !validScalar(s) || !ecdsa.Verify(testPrivateKey().Public().(*ecdsa.PublicKey), digest[:], r, s) {
		return errors.New("ES256 signature verification failed")
	}
	return nil
}

func (p *Profile) validateProtected(kind Kind, raw []byte) error {
	var headers protectedHeaders
	if err := p.dec.Unmarshal(raw, &headers); err != nil {
		return fmt.Errorf("decode protected headers: %w", err)
	}
	reencoded, err := p.enc.Marshal(headers)
	if err != nil || !bytes.Equal(reencoded, raw) {
		return errors.New("protected headers are not canonical or contain unsupported structure")
	}
	wantType, err := contentType(kind)
	if err != nil {
		return err
	}
	if headers.Algorithm != ES256 || headers.ContentType != wantType || !bytes.Equal(headers.KeyID, keyID(kind)) {
		return errors.New("protected headers are outside the exact object profile")
	}
	if len(headers.ContentType) > MaxTextBytes || len(headers.KeyID) == 0 || len(headers.KeyID) > MaxKeyIDBytes {
		return errors.New("protected header resource bound exceeded")
	}
	return nil
}

func (p *Profile) validatePayload(kind Kind, raw []byte) error {
	switch kind {
	case ApprovalGrantKind:
		var got ApprovalGrant
		if err := p.dec.Unmarshal(raw, &got); err != nil {
			return fmt.Errorf("decode ApprovalGrant: %w", err)
		}
		reencoded, err := p.enc.Marshal(got)
		if err != nil || !bytes.Equal(reencoded, raw) {
			return errors.New("ApprovalGrant is not canonical or contains unsupported structure")
		}
		if err := validateApprovalShape(got); err != nil {
			return err
		}
		if !approvalEqual(got, ExpectedApproval()) {
			return errors.New("ApprovalGrant does not match the expected registration bindings")
		}
	case EnforcementTranscriptKind:
		var got EnforcementTranscript
		if err := p.dec.Unmarshal(raw, &got); err != nil {
			return fmt.Errorf("decode EnforcementTranscript: %w", err)
		}
		reencoded, err := p.enc.Marshal(got)
		if err != nil || !bytes.Equal(reencoded, raw) {
			return errors.New("EnforcementTranscript is not canonical or contains unsupported structure")
		}
		if err := validateTranscriptShape(got); err != nil {
			return err
		}
		if !transcriptEqual(got, ExpectedTranscript()) {
			return errors.New("EnforcementTranscript does not match the expected attempt bindings")
		}
	default:
		return fmt.Errorf("unknown profile kind %q", kind)
	}
	return nil
}

func validateApprovalShape(g ApprovalGrant) error {
	if g.ObjectType != "capsule.approval-grant" || g.ObjectVersion != 0 || g.Purpose != "capsule.plan.approve" || g.Audience != "capsule.execution-supervisor" {
		return errors.New("ApprovalGrant type/version/purpose/audience confusion")
	}
	if len(g.Installation) != 16 || len(g.EpochDigest) != 32 || len(g.Registration) != 16 || len(g.PlanDigest) != 32 || len(g.Supervisor) != 16 || len(g.AttemptNonce) != 16 {
		return errors.New("ApprovalGrant identifier/digest length mismatch")
	}
	if len(g.ObjectType) > MaxTextBytes || len(g.Purpose) > MaxTextBytes || len(g.Audience) > MaxTextBytes || g.IssuedAt > 9_007_199_254_740_991 || g.ExpiresAt > 9_007_199_254_740_991 || g.ExpiresAt <= g.IssuedAt {
		return errors.New("ApprovalGrant resource or time bound mismatch")
	}
	return nil
}

func validateTranscriptShape(t EnforcementTranscript) error {
	if t.ObjectType != "capsule.enforcement-transcript" || t.ObjectVersion != 0 || t.Purpose != "capsule.execution.attest" || t.Audience != "capsule.receipt-composer" {
		return errors.New("EnforcementTranscript type/version/purpose/audience confusion")
	}
	if len(t.Installation) != 16 || len(t.EpochDigest) != 32 || len(t.Registration) != 16 || len(t.AttemptID) != 16 || len(t.PlanDigest) != 32 || len(t.EventRoot) != 32 {
		return errors.New("EnforcementTranscript identifier/digest length mismatch")
	}
	if t.TerminalState != "completed" || t.TeardownState != "destroyed" || t.FinishedAt > 9_007_199_254_740_991 {
		return errors.New("EnforcementTranscript state or time mismatch")
	}
	return nil
}

func (p *Profile) signParts(protected []byte, unprotected map[int64]any, payload []byte, signatureOverride []byte) ([]byte, error) {
	signatureInput, err := p.enc.Marshal([]any{"Signature1", protected, []byte{}, payload})
	if err != nil {
		return nil, err
	}
	signature := signatureOverride
	if signature == nil {
		digest := sha256.Sum256(signatureInput)
		r, s, err := ecdsa.Sign(rand.Reader, testPrivateKey(), digest[:])
		if err != nil {
			return nil, err
		}
		signature = make([]byte, 64)
		r.FillBytes(signature[:32])
		s.FillBytes(signature[32:])
	}
	return p.enc.Marshal(cbor.Tag{Number: COSESign1Tag, Content: []any{protected, unprotected, payload, signature}})
}

func (p *Profile) ComplementSignature(wire []byte) ([]byte, error) {
	var tagged cbor.Tag
	if err := p.dec.Unmarshal(wire, &tagged); err != nil {
		return nil, err
	}
	items, ok := tagged.Content.([]any)
	if !ok || len(items) != 4 {
		return nil, errors.New("not a COSE_Sign1 body")
	}
	sig, ok := items[3].([]byte)
	if !ok || len(sig) != 64 {
		return nil, errors.New("not a raw ES256 signature")
	}
	s := new(big.Int).SetBytes(sig[32:])
	if !validScalar(s) {
		return nil, errors.New("invalid S scalar")
	}
	out := append([]byte(nil), sig...)
	new(big.Int).Sub(elliptic.P256().Params().N, s).FillBytes(out[32:])
	items[3] = out
	return p.enc.Marshal(tagged)
}

func EncodeBase64URL(data []byte) string { return base64.RawURLEncoding.EncodeToString(data) }

func DecodeBase64URL(value string) ([]byte, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil || EncodeBase64URL(decoded) != value {
		return nil, errors.New("not canonical unpadded base64url")
	}
	return decoded, nil
}

func (p *Profile) Marshal(value any) ([]byte, error) { return p.enc.Marshal(value) }

func (p *Profile) SignRaw(protected, payload []byte, unprotected map[int64]any, signature []byte) ([]byte, error) {
	return p.signParts(protected, unprotected, payload, signature)
}

func validScalar(value *big.Int) bool {
	return value.Sign() > 0 && value.Cmp(elliptic.P256().Params().N) < 0
}

func testPrivateKey() *ecdsa.PrivateKey {
	d, ok := new(big.Int).SetString("8E9B109E719098BF980487DF1F5D77E9CB29606EBED2263B5F57C213DF84F4B2", 16)
	if !ok {
		panic("invalid fixture private key")
	}
	x, y := elliptic.P256().ScalarBaseMult(d.Bytes())
	return &ecdsa.PrivateKey{PublicKey: ecdsa.PublicKey{Curve: elliptic.P256(), X: x, Y: y}, D: d}
}

func repeated(value byte, count int) []byte {
	out := make([]byte, count)
	for i := range out {
		out[i] = value
	}
	return out
}

func approvalEqual(a, b ApprovalGrant) bool {
	return a.ObjectType == b.ObjectType && a.ObjectVersion == b.ObjectVersion &&
		bytes.Equal(a.Installation, b.Installation) && bytes.Equal(a.EpochDigest, b.EpochDigest) &&
		bytes.Equal(a.Registration, b.Registration) && bytes.Equal(a.PlanDigest, b.PlanDigest) &&
		bytes.Equal(a.Supervisor, b.Supervisor) && bytes.Equal(a.AttemptNonce, b.AttemptNonce) &&
		a.Purpose == b.Purpose && a.Audience == b.Audience && a.IssuedAt == b.IssuedAt && a.ExpiresAt == b.ExpiresAt
}

func transcriptEqual(a, b EnforcementTranscript) bool {
	return a.ObjectType == b.ObjectType && a.ObjectVersion == b.ObjectVersion &&
		bytes.Equal(a.Installation, b.Installation) && bytes.Equal(a.EpochDigest, b.EpochDigest) &&
		bytes.Equal(a.Registration, b.Registration) && bytes.Equal(a.AttemptID, b.AttemptID) &&
		bytes.Equal(a.PlanDigest, b.PlanDigest) && bytes.Equal(a.EventRoot, b.EventRoot) &&
		a.Purpose == b.Purpose && a.Audience == b.Audience && a.TerminalState == b.TerminalState &&
		a.TeardownState == b.TeardownState && a.FinishedAt == b.FinishedAt
}
