package gatea

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"unicode/utf8"

	jose "github.com/go-jose/go-jose/v4"
	strictjson "github.com/go-jose/go-jose/v4/json"
	"github.com/gowebpki/jcs"
)

const maxSafeInteger = int64(9007199254740991)

type ProtectedHeader struct {
	Algorithm   string `json:"alg"`
	ContentType string `json:"cty"`
	KeyID       string `json:"kid"`
	Type        string `json:"typ"`
	Version     int    `json:"v"`
}

type ApprovalGrant struct {
	AttemptNonce  string `json:"attemptNonce"`
	Audience      string `json:"audience"`
	EpochDigest   string `json:"epochDigest"`
	EpochNumber   string `json:"epochNumber"`
	ExpiresAt     string `json:"expiresAt"`
	Installation  string `json:"installationId"`
	IssuedAt      string `json:"issuedAt"`
	ObjectType    string `json:"objectType"`
	ObjectVersion int    `json:"objectVersion"`
	PlanDigest    string `json:"planDigest"`
	Purpose       string `json:"purpose"`
	Registration  string `json:"registrationId"`
	Supervisor    string `json:"supervisorId"`
}

type flattenedJWS struct {
	Payload   string          `json:"payload"`
	Protected string          `json:"protected"`
	Signature string          `json:"signature"`
	Header    json.RawMessage `json:"header,omitempty"`
}

func Canonicalize(raw []byte) ([]byte, error) {
	if !utf8.Valid(raw) {
		return nil, errors.New("input is not strict UTF-8")
	}
	canonical, err := jcs.Transform(raw)
	if err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	if err := rejectUnsafeIntegers(value); err != nil {
		return nil, err
	}
	return canonical, nil
}

func VerifyCanonicalWire(raw []byte) error {
	canonical, err := Canonicalize(raw)
	if err != nil {
		return err
	}
	if !bytes.Equal(raw, canonical) {
		return errors.New("payload is not canonical on wire")
	}
	return nil
}

func rejectUnsafeIntegers(value any) error {
	switch typed := value.(type) {
	case map[string]any:
		for _, child := range typed {
			if err := rejectUnsafeIntegers(child); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range typed {
			if err := rejectUnsafeIntegers(child); err != nil {
				return err
			}
		}
	case json.Number:
		text := typed.String()
		if strings.ContainsAny(text, ".eE") {
			value, err := strconv.ParseFloat(text, 64)
			if err != nil {
				return fmt.Errorf("number outside interoperable IEEE 754 range: %s", text)
			}
			mantissa := strings.FieldsFunc(text, func(r rune) bool { return r == 'e' || r == 'E' })[0]
			if value == 0 && strings.ContainsAny(mantissa, "123456789") {
				return fmt.Errorf("number underflows IEEE 754 double precision: %s", text)
			}
			return nil
		}
		integer, ok := new(big.Int).SetString(text, 10)
		if !ok {
			return fmt.Errorf("invalid integer %q", text)
		}
		limit := big.NewInt(maxSafeInteger)
		if new(big.Int).Abs(integer).Cmp(limit) > 0 {
			return fmt.Errorf("integer outside Capsule safe range: %s", text)
		}
	}
	return nil
}

func VerifyApproval(envelope []byte, publicKey *ecdsa.PublicKey) error {
	if err := requireExactKeys(envelope, "payload", "protected", "signature"); err != nil {
		return fmt.Errorf("envelope profile: %w", err)
	}
	var wire flattenedJWS
	if err := strictjson.Unmarshal(envelope, &wire); err != nil {
		return fmt.Errorf("strict envelope decode: %w", err)
	}
	if len(wire.Header) != 0 {
		return errors.New("unprotected header is forbidden")
	}
	if wire.Payload == "" || wire.Protected == "" || wire.Signature == "" {
		return errors.New("flattened JWS requires payload, protected, and signature")
	}

	protectedBytes, err := base64.RawURLEncoding.DecodeString(wire.Protected)
	if err != nil {
		return fmt.Errorf("protected base64url: %w", err)
	}
	if err := VerifyCanonicalWire(protectedBytes); err != nil {
		return fmt.Errorf("protected header: %w", err)
	}
	if err := requireExactKeys(protectedBytes, "alg", "cty", "kid", "typ", "v"); err != nil {
		return fmt.Errorf("protected header allowlist: %w", err)
	}
	var header ProtectedHeader
	if err := strictjson.Unmarshal(protectedBytes, &header); err != nil {
		return fmt.Errorf("protected header profile: %w", err)
	}
	if header != (ProtectedHeader{
		Algorithm:   "ES256",
		ContentType: "application/capsule.approval-grant+jcs",
		KeyID:       "approval-test-key",
		Type:        "capsule.signed-object+jws",
		Version:     1,
	}) {
		return fmt.Errorf("protected header is outside the exact allowlist/profile: %+v", header)
	}

	signature, err := base64.RawURLEncoding.DecodeString(wire.Signature)
	if err != nil {
		return fmt.Errorf("signature base64url: %w", err)
	}
	if len(signature) != 64 {
		return fmt.Errorf("ES256 signature must be raw 64-byte R || S, got %d", len(signature))
	}

	parsed, err := jose.ParseSigned(string(envelope), []jose.SignatureAlgorithm{jose.ES256})
	if err != nil {
		return fmt.Errorf("JWS parse: %w", err)
	}
	payload, err := parsed.Verify(publicKey)
	if err != nil {
		return fmt.Errorf("JWS verification: %w", err)
	}
	if err := VerifyCanonicalWire(payload); err != nil {
		return fmt.Errorf("payload canonical form: %w", err)
	}
	if err := requireExactKeys(
		payload,
		"attemptNonce", "audience", "epochDigest", "epochNumber", "expiresAt", "installationId",
		"issuedAt", "objectType", "objectVersion", "planDigest", "purpose", "registrationId", "supervisorId",
	); err != nil {
		return fmt.Errorf("approval object fields: %w", err)
	}

	var grant ApprovalGrant
	if err := strictjson.Unmarshal(payload, &grant); err != nil {
		return fmt.Errorf("approval schema: %w", err)
	}
	if grant.ObjectType != "capsule.approval-grant" ||
		grant.ObjectVersion != 1 ||
		grant.Purpose != "capsule.plan.approve" ||
		grant.Audience != "capsule.execution-supervisor" ||
		grant.Installation != "installation_01" ||
		grant.EpochNumber != "7" ||
		grant.EpochDigest != "sha256:epoch_07" ||
		grant.Registration != "registration_01" ||
		grant.AttemptNonce != "nonce_01" ||
		grant.Supervisor != "supervisor_01" {
		return errors.New("approval object binding/profile mismatch")
	}
	return nil
}

func requireExactKeys(raw []byte, expected ...string) error {
	var object map[string]any
	if err := strictjson.Unmarshal(raw, &object); err != nil {
		return err
	}
	if len(object) != len(expected) {
		return fmt.Errorf("expected %d fields, got %d", len(expected), len(object))
	}
	for _, name := range expected {
		if _, ok := object[name]; !ok {
			return fmt.Errorf("missing field %q", name)
		}
	}
	return nil
}

func PrivateKeyFromJWK(x, y, d string) (*ecdsa.PrivateKey, error) {
	decode := func(value string) (*big.Int, error) {
		bytes, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil {
			return nil, err
		}
		return new(big.Int).SetBytes(bytes), nil
	}
	xInt, err := decode(x)
	if err != nil {
		return nil, err
	}
	yInt, err := decode(y)
	if err != nil {
		return nil, err
	}
	dInt, err := decode(d)
	if err != nil {
		return nil, err
	}
	return &ecdsa.PrivateKey{
		PublicKey: ecdsa.PublicKey{Curve: elliptic.P256(), X: xInt, Y: yInt},
		D:         dInt,
	}, nil
}
