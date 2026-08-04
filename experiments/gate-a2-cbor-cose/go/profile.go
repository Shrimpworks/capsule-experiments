package gatea2

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"

	"github.com/fxamacker/cbor/v2"
)

const (
	COSESign1Tag = uint64(18)
	ES256        = int64(-7)
	ContentType  = "application/capsule.approval-grant+cbor;v=0"
)

var testKeyID = []byte("approval-test-key")

// ApprovalGrant is the deliberately narrow Gate A2 payload. Integer labels,
// exact types, and the absence of optional fields eliminate representational
// choices that are unnecessary for this interoperability decision.
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

func ExpectedGrant() ApprovalGrant {
	return ApprovalGrant{
		ObjectType:    "capsule.approval-grant",
		ObjectVersion: 0,
		Installation:  repeated(0x11, 16),
		EpochDigest:   repeated(0x22, 32),
		Registration:  repeated(0x33, 16),
		PlanDigest:    repeated(0x44, 32),
		Supervisor:    repeated(0x55, 16),
		AttemptNonce:  repeated(0x66, 16),
		Purpose:       "capsule.plan.approve",
		Audience:      "capsule.execution-supervisor",
		IssuedAt:      1_785_456_000,
		ExpiresAt:     1_785_456_300,
	}
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
		MaxNestedLevels:   16,
		MaxArrayElements:  32,
		MaxMapPairs:       32,
		ExtraReturnErrors: cbor.ExtraDecErrorUnknownField,
	}).DecMode()
	if err != nil {
		return nil, err
	}
	return &Profile{enc: enc, dec: dec}, nil
}

func (p *Profile) Payload() ([]byte, error) {
	return p.enc.Marshal(ExpectedGrant())
}

func (p *Profile) Protected() ([]byte, error) {
	return p.enc.Marshal(map[int64]any{
		1: ES256,
		3: ContentType,
		4: testKeyID,
	})
}

func (p *Profile) Sign() ([]byte, error) {
	payload, err := p.Payload()
	if err != nil {
		return nil, err
	}
	protected, err := p.Protected()
	if err != nil {
		return nil, err
	}
	return p.signParts(protected, map[int64]any{}, payload, false)
}

func (p *Profile) signParts(protected []byte, unprotected map[int64]any, payload []byte, der bool) ([]byte, error) {
	signatureInput, err := p.enc.Marshal([]any{"Signature1", protected, []byte{}, payload})
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(signatureInput)
	r, s, err := ecdsa.Sign(rand.Reader, RFCPrivateKey(), digest[:])
	if err != nil {
		return nil, err
	}
	var signature []byte
	if der {
		signature, err = encodeDER(r, s)
		if err != nil {
			return nil, err
		}
	} else {
		signature = make([]byte, 64)
		r.FillBytes(signature[:32])
		s.FillBytes(signature[32:])
	}
	return p.enc.Marshal(cbor.Tag{
		Number: COSESign1Tag,
		Content: []any{
			protected,
			unprotected,
			payload,
			signature,
		},
	})
}

func (p *Profile) Verify(wire []byte) error {
	var tagged cbor.Tag
	if err := p.dec.Unmarshal(wire, &tagged); err != nil {
		return fmt.Errorf("decode COSE_Sign1: %w", err)
	}
	if tagged.Number != COSESign1Tag {
		return fmt.Errorf("COSE tag: got %d, want %d", tagged.Number, COSESign1Tag)
	}
	canonical, err := p.enc.Marshal(tagged)
	if err != nil {
		return fmt.Errorf("re-encode COSE_Sign1: %w", err)
	}
	if !bytes.Equal(canonical, wire) {
		return errors.New("COSE_Sign1 is not canonical on wire")
	}
	items, ok := tagged.Content.([]any)
	if !ok || len(items) != 4 {
		return errors.New("COSE_Sign1 content must be a four-item array")
	}
	protected, ok := items[0].([]byte)
	if !ok {
		return errors.New("protected header must be a byte string")
	}
	wantProtected, err := p.Protected()
	if err != nil {
		return err
	}
	if !bytes.Equal(protected, wantProtected) {
		return errors.New("protected header is outside the exact Capsule profile")
	}
	unprotected, ok := items[1].(map[any]any)
	if !ok || len(unprotected) != 0 {
		return errors.New("unprotected headers are forbidden")
	}
	payload, ok := items[2].([]byte)
	if !ok {
		return errors.New("embedded payload must be a byte string")
	}
	wantPayload, err := p.Payload()
	if err != nil {
		return err
	}
	if !bytes.Equal(payload, wantPayload) {
		return errors.New("payload is non-canonical or outside the exact ApprovalGrant profile")
	}
	var grant ApprovalGrant
	if err := p.dec.Unmarshal(payload, &grant); err != nil {
		return fmt.Errorf("decode ApprovalGrant: %w", err)
	}
	reencoded, err := p.enc.Marshal(grant)
	if err != nil || !bytes.Equal(reencoded, payload) {
		return errors.New("ApprovalGrant did not round-trip canonically")
	}
	signature, ok := items[3].([]byte)
	if !ok || len(signature) != 64 {
		return errors.New("ES256 signature must be exactly 64-byte raw R || S")
	}
	signatureInput, err := p.enc.Marshal([]any{"Signature1", protected, []byte{}, payload})
	if err != nil {
		return err
	}
	digest := sha256.Sum256(signatureInput)
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])
	if !ecdsa.Verify(RFCPrivateKey().Public().(*ecdsa.PublicKey), digest[:], r, s) {
		return errors.New("ES256 signature verification failed")
	}
	return nil
}

// ComplementSignature returns the mathematically equivalent P-256 signature
// with S replaced by n-S. Capsule's selected profile accepts both forms but
// never uses signature bytes as an object or replay identity.
func (p *Profile) ComplementSignature(wire []byte) ([]byte, error) {
	var tagged cbor.Tag
	if err := p.dec.Unmarshal(wire, &tagged); err != nil {
		return nil, err
	}
	items, ok := tagged.Content.([]any)
	if !ok || tagged.Number != COSESign1Tag || len(items) != 4 {
		return nil, errors.New("not a Gate A2 COSE_Sign1 envelope")
	}
	signature, ok := items[3].([]byte)
	if !ok || len(signature) != 64 {
		return nil, errors.New("not a 64-byte raw ES256 signature")
	}
	complement := append([]byte(nil), signature...)
	s := new(big.Int).SetBytes(signature[32:])
	if s.Sign() == 0 || s.Cmp(elliptic.P256().Params().N) >= 0 {
		return nil, errors.New("invalid ECDSA S scalar")
	}
	new(big.Int).Sub(elliptic.P256().Params().N, s).FillBytes(complement[32:])
	items[3] = complement
	return p.enc.Marshal(tagged)
}

func (p *Profile) NegativeVectors() (map[string][]byte, error) {
	valid, err := p.Sign()
	if err != nil {
		return nil, err
	}
	payload, _ := p.Payload()
	protected, _ := p.Protected()

	tampered := append([]byte(nil), valid...)
	tampered[len(tampered)-1] ^= 0x01

	wrongGrant := ExpectedGrant()
	wrongGrant.Purpose = "capsule.execution.attest"
	wrongPayload, _ := p.enc.Marshal(wrongGrant)
	wrongPurpose, err := p.signParts(protected, map[int64]any{}, wrongPayload, false)
	if err != nil {
		return nil, err
	}

	unknownProtected, _ := p.enc.Marshal(map[int64]any{
		1:    ES256,
		3:    ContentType,
		4:    testKeyID,
		1000: uint64(1),
	})
	unknownHeader, err := p.signParts(unknownProtected, map[int64]any{}, payload, false)
	if err != nil {
		return nil, err
	}

	wrongAlgorithmProtected, _ := p.enc.Marshal(map[int64]any{
		1: int64(-8),
		3: ContentType,
		4: testKeyID,
	})
	wrongAlgorithm, err := p.signParts(wrongAlgorithmProtected, map[int64]any{}, payload, false)
	if err != nil {
		return nil, err
	}

	unprotected, err := p.signParts(protected, map[int64]any{4: []byte("attacker")}, payload, false)
	if err != nil {
		return nil, err
	}
	derSignature, err := p.signParts(protected, map[int64]any{}, payload, true)
	if err != nil {
		return nil, err
	}

	// These payloads carry valid signatures over deliberately non-canonical
	// encodings. They exercise parser-differential hazards rather than merely
	// corrupting the signed bytes after the fact.
	nonpreferredIntegerPayload := bytes.Replace(
		payload,
		[]byte{0x02, 0x00, 0x03},
		[]byte{0x02, 0x18, 0x00, 0x03},
		1,
	)
	if bytes.Equal(nonpreferredIntegerPayload, payload) {
		return nil, errors.New("fixture payload layout changed before non-preferred integer mutation")
	}
	nonpreferredInteger, err := p.signParts(
		protected,
		map[int64]any{},
		nonpreferredIntegerPayload,
		false,
	)
	if err != nil {
		return nil, err
	}

	duplicatePayload := append([]byte(nil), payload...)
	if len(duplicatePayload) == 0 || duplicatePayload[0] != 0xac {
		return nil, errors.New("fixture payload is not the expected twelve-pair map")
	}
	duplicatePayload[0] = 0xad
	duplicatePayload = append(duplicatePayload, 0x02, 0x00)
	duplicateKey, err := p.signParts(protected, map[int64]any{}, duplicatePayload, false)
	if err != nil {
		return nil, err
	}

	indefinitePayload := append([]byte{0xbf}, payload[1:]...)
	indefinitePayload = append(indefinitePayload, 0xff)
	indefiniteMap, err := p.signParts(protected, map[int64]any{}, indefinitePayload, false)
	if err != nil {
		return nil, err
	}

	untagged, _ := p.enc.Marshal([]any{protected, map[int64]any{}, payload, repeated(0, 64)})
	nonpreferredTag := append([]byte{0xd8, 0x12}, valid[1:]...)
	trailing := append(append([]byte(nil), valid...), 0x00)

	return map[string][]byte{
		"tampered-signature":       tampered,
		"wrong-purpose-signed":     wrongPurpose,
		"unknown-protected-header": unknownHeader,
		"wrong-algorithm-signed":   wrongAlgorithm,
		"unprotected-header":       unprotected,
		"der-signature":            derSignature,
		"missing-tag":              untagged,
		"nonpreferred-tag":         nonpreferredTag,
		"nonpreferred-payload-int": nonpreferredInteger,
		"duplicate-payload-key":    duplicateKey,
		"indefinite-payload-map":   indefiniteMap,
		"trailing-data":            trailing,
	}, nil
}

func EncodeBase64URL(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func DecodeBase64URL(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(value)
}

func Hex(data []byte) string { return hex.EncodeToString(data) }

func RFCPrivateKey() *ecdsa.PrivateKey {
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

func encodeDER(r, s *big.Int) ([]byte, error) {
	// ECDSA is still implemented by crypto/ecdsa. This tiny fixture-only DER
	// encoder exists solely to prove that the Capsule wire profile rejects DER.
	encodeInteger := func(value *big.Int) []byte {
		encoded := value.Bytes()
		if len(encoded) == 0 {
			encoded = []byte{0}
		}
		if encoded[0]&0x80 != 0 {
			encoded = append([]byte{0}, encoded...)
		}
		return append([]byte{0x02, byte(len(encoded))}, encoded...)
	}
	rPart := encodeInteger(r)
	sPart := encodeInteger(s)
	if len(rPart)+len(sPart) > 127 {
		return nil, errors.New("unexpected fixture DER length")
	}
	return append([]byte{0x30, byte(len(rPart) + len(sPart))}, append(rPart, sPart...)...), nil
}
