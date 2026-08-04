package gatea

import (
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"

	jose "github.com/go-jose/go-jose/v4"
)

type canonicalFixtures struct {
	Valid []struct {
		ID        string `json:"id"`
		Input     string `json:"input"`
		Canonical string `json:"canonical"`
	} `json:"valid"`
	Reject []struct {
		ID    string `json:"id"`
		Input string `json:"input"`
	} `json:"reject"`
	NonCanonicalWire []struct {
		ID    string `json:"id"`
		Input string `json:"input"`
	} `json:"nonCanonicalWire"`
}

type jwsFixtures struct {
	TestKey struct {
		PrivateJWK struct {
			X string `json:"x"`
			Y string `json:"y"`
			D string `json:"d"`
		} `json:"privateJwk"`
	} `json:"testKey"`
	Profile struct {
		ProtectedJSON   string            `json:"protectedJson"`
		PayloadJSON     string            `json:"payloadJson"`
		ProducerSamples map[string]string `json:"producerSamples"`
		FlattenedJWS    json.RawMessage   `json:"flattenedJws"`
	} `json:"profile"`
}

func fixturePath(name string) string {
	return filepath.Join("..", "fixtures", name)
}

func loadJSON[T any](t *testing.T, name string) T {
	t.Helper()
	bytes, err := os.ReadFile(fixturePath(name))
	if err != nil {
		t.Fatal(err)
	}
	var value T
	if err := json.Unmarshal(bytes, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func loadJWS(t *testing.T) (jwsFixtures, *ecdsa.PrivateKey) {
	t.Helper()
	fixtures := loadJSON[jwsFixtures](t, "jws.json")
	key, err := PrivateKeyFromJWK(
		fixtures.TestKey.PrivateJWK.X,
		fixtures.TestKey.PrivateJWK.Y,
		fixtures.TestKey.PrivateJWK.D,
	)
	if err != nil {
		t.Fatal(err)
	}
	return fixtures, key
}

func TestCanonicalizationVectors(t *testing.T) {
	fixtures := loadJSON[canonicalFixtures](t, "canonicalization.json")
	for _, fixture := range fixtures.Valid {
		t.Run(fixture.ID, func(t *testing.T) {
			actual, err := Canonicalize([]byte(fixture.Input))
			if err != nil {
				t.Fatal(err)
			}
			if string(actual) != fixture.Canonical {
				t.Fatalf("canonical mismatch\nwant: %s\n got: %s", fixture.Canonical, actual)
			}
		})
	}
	for _, fixture := range fixtures.Reject {
		t.Run(fixture.ID, func(t *testing.T) {
			if _, err := Canonicalize([]byte(fixture.Input)); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
	for _, fixture := range fixtures.NonCanonicalWire {
		t.Run(fixture.ID, func(t *testing.T) {
			if err := VerifyCanonicalWire([]byte(fixture.Input)); err == nil {
				t.Fatal("expected canonical-on-wire rejection")
			}
		})
	}
	invalidUTF8 := []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}
	if _, err := Canonicalize(invalidUTF8); err == nil {
		t.Fatal("expected invalid UTF-8 rejection")
	}
}

func TestRFC7515ES256KnownAnswer(t *testing.T) {
	_, key := loadJWS(t)
	compact := strings.Join([]string{
		"eyJhbGciOiJFUzI1NiJ9",
		"eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ",
		"DtEhU3ljbEg8L38VWAfUAqOyKAM6-Xx-F4GawxaepmXFCgfTjDxw5djxLa8ISlSApmWQxfKTUJqPP3-Kg6NU1Q",
	}, ".")
	parsed, err := jose.ParseSigned(compact, []jose.SignatureAlgorithm{jose.ES256})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := parsed.Verify(&key.PublicKey); err != nil {
		t.Fatal(err)
	}
	signature, err := base64.RawURLEncoding.DecodeString(strings.Split(compact, ".")[2])
	if err != nil || len(signature) != 64 {
		t.Fatalf("RFC signature is not fixed-width raw ES256: len=%d err=%v", len(signature), err)
	}
}

func TestGenerateProfileFixture(t *testing.T) {
	fixtures, key := loadJWS(t)
	options := (&jose.SignerOptions{}).
		WithType("capsule.signed-object+jws").
		WithHeader("cty", "application/capsule.approval-grant+jcs").
		WithHeader("kid", "approval-test-key").
		WithHeader("v", 1)
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.ES256, Key: key}, options)
	if err != nil {
		t.Fatal(err)
	}
	object, err := signer.Sign([]byte(fixtures.Profile.PayloadJSON))
	if err != nil {
		t.Fatal(err)
	}
	compact, err := object.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(compact, ".")
	if len(parts) != 3 {
		t.Fatal("unexpected compact serialization")
	}
	protected, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		t.Fatal(err)
	}
	if string(protected) != fixtures.Profile.ProtectedJSON {
		t.Fatalf("protected header changed\nwant: %s\n got: %s", fixtures.Profile.ProtectedJSON, protected)
	}
	flattened, err := json.Marshal(flattenedJWS{Payload: parts[1], Protected: parts[0], Signature: parts[2]})
	if err != nil {
		t.Fatal(err)
	}
	if string(fixtures.Profile.FlattenedJWS) == "null" {
		t.Logf("PROFILE_FIXTURE=%s", flattened)
		return
	}
	if string(flattened) != string(fixtures.Profile.FlattenedJWS) {
		t.Logf("producer emitted a different valid nondeterministic ECDSA signature: %s", flattened)
	}
}

func TestProfileAndAdversarialJWS(t *testing.T) {
	fixtures, key := loadJWS(t)
	if string(fixtures.Profile.FlattenedJWS) == "null" {
		t.Skip("generate and retain flattenedJws first")
	}
	if err := VerifyApproval(fixtures.Profile.FlattenedJWS, &key.PublicKey); err != nil {
		t.Fatal(err)
	}
	for producer, signature := range fixtures.Profile.ProducerSamples {
		t.Run("producer-"+producer, func(t *testing.T) {
			candidate := flattenedJWS{
				Payload:   base64.RawURLEncoding.EncodeToString([]byte(fixtures.Profile.PayloadJSON)),
				Protected: base64.RawURLEncoding.EncodeToString([]byte(fixtures.Profile.ProtectedJSON)),
				Signature: signature,
			}
			encoded, err := json.Marshal(candidate)
			if err != nil {
				t.Fatal(err)
			}
			if err := VerifyApproval(encoded, &key.PublicKey); err != nil {
				t.Fatalf("rejected %s-produced signature: %v", producer, err)
			}
		})
	}

	var original flattenedJWS
	if err := json.Unmarshal(fixtures.Profile.FlattenedJWS, &original); err != nil {
		t.Fatal(err)
	}

	mutations := map[string]func(*flattenedJWS){
		"algorithm-none": func(value *flattenedJWS) {
			value.Protected = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","cty":"application/capsule.approval-grant+jcs","kid":"approval-test-key","typ":"capsule.signed-object+jws","v":1}`))
		},
		"algorithm-unknown": func(value *flattenedJWS) {
			value.Protected = base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"ES999","cty":"application/capsule.approval-grant+jcs","kid":"approval-test-key","typ":"capsule.signed-object+jws","v":1}`))
		},
		"tampered-payload": func(value *flattenedJWS) {
			value.Payload = base64.RawURLEncoding.EncodeToString([]byte(`{"objectType":"capsule.approval-grant"}`))
		},
		"tampered-signature": func(value *flattenedJWS) {
			signature, _ := base64.RawURLEncoding.DecodeString(value.Signature)
			signature[0] ^= 1
			value.Signature = base64.RawURLEncoding.EncodeToString(signature)
		},
		"short-raw-signature": func(value *flattenedJWS) {
			signature, _ := base64.RawURLEncoding.DecodeString(value.Signature)
			value.Signature = base64.RawURLEncoding.EncodeToString(signature[:63])
		},
		"unprotected-header": func(value *flattenedJWS) { value.Header = json.RawMessage(`{"kid":"attacker"}`) },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			candidate := original
			mutate(&candidate)
			encoded, err := json.Marshal(candidate)
			if err != nil {
				t.Fatal(err)
			}
			if err := VerifyApproval(encoded, &key.PublicKey); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}

	t.Run("der-is-not-jws-raw", func(t *testing.T) {
		protected := original.Protected
		payload := original.Payload
		digest := sha256.Sum256([]byte(protected + "." + payload))
		der, err := ecdsa.SignASN1(rand.Reader, key, digest[:])
		if err != nil {
			t.Fatal(err)
		}
		candidate := original
		candidate.Signature = base64.RawURLEncoding.EncodeToString(der)
		encoded, _ := json.Marshal(candidate)
		if err := VerifyApproval(encoded, &key.PublicKey); err == nil {
			t.Fatal("profile accepted DER signature")
		}
	})

	t.Run("duplicate-envelope-key", func(t *testing.T) {
		duplicate := strings.Replace(string(fixtures.Profile.FlattenedJWS), `"payload":`, `"payload":"ignored","payload":`, 1)
		if err := VerifyApproval([]byte(duplicate), &key.PublicKey); err == nil {
			t.Fatal("profile accepted duplicate envelope key")
		}
	})

	t.Run("high-and-low-s-policy-accepts-both", func(t *testing.T) {
		candidate := original
		signature, _ := base64.RawURLEncoding.DecodeString(candidate.Signature)
		s := new(big.Int).SetBytes(signature[32:])
		complement := new(big.Int).Sub(key.Curve.Params().N, s).Bytes()
		for index := range signature[32:] {
			signature[32+index] = 0
		}
		copy(signature[64-len(complement):], complement)
		candidate.Signature = base64.RawURLEncoding.EncodeToString(signature)
		encoded, _ := json.Marshal(candidate)
		if err := VerifyApproval(encoded, &key.PublicKey); err != nil {
			t.Fatalf("selected accept-both high-S policy was not interoperable: %v", err)
		}
	})

	t.Run("valid-signature-wrong-object-bindings", func(t *testing.T) {
		bindings := map[string]any{
			"objectType":     "capsule.enforcement-transcript",
			"purpose":        "capsule.execution.attest",
			"audience":       "capsule.receipt-verifier",
			"installationId": "installation_02",
			"epochNumber":    "8",
			"epochDigest":    "sha256:epoch_08",
			"registrationId": "registration_02",
			"attemptNonce":   "nonce_02",
		}
		for field, replacement := range bindings {
			t.Run(field, func(t *testing.T) {
				var payload map[string]any
				if err := json.Unmarshal([]byte(fixtures.Profile.PayloadJSON), &payload); err != nil {
					t.Fatal(err)
				}
				payload[field] = replacement
				serialized, _ := json.Marshal(payload)
				canonical, err := Canonicalize(serialized)
				if err != nil {
					t.Fatal(err)
				}
				candidate := signFlattened(t, canonical, key)
				if err := VerifyApproval(candidate, &key.PublicKey); err == nil {
					t.Fatalf("profile accepted wrong %s binding with a valid signature", field)
				}
			})
		}
	})

	t.Run("valid-signature-forbidden-protected-headers", func(t *testing.T) {
		for _, field := range []string{"crit", "jwk", "jku", "x5u", "unknown"} {
			t.Run(field, func(t *testing.T) {
				options := (&jose.SignerOptions{}).
					WithType("capsule.signed-object+jws").
					WithHeader("cty", "application/capsule.approval-grant+jcs").
					WithHeader("kid", "approval-test-key").
					WithHeader("v", 1)
				if field == "crit" {
					options.WithHeader(jose.HeaderKey(field), []string{"unknown"}).WithHeader("unknown", true)
				} else if field == "jwk" {
					options.WithHeader(jose.HeaderKey(field), map[string]any{"kty": "EC"})
				} else {
					options.WithHeader(jose.HeaderKey(field), "https://attacker.invalid/key")
				}
				signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.ES256, Key: key}, options)
				if err != nil {
					t.Fatal(err)
				}
				object, err := signer.Sign([]byte(fixtures.Profile.PayloadJSON))
				if err != nil {
					t.Fatal(err)
				}
				compact, _ := object.CompactSerialize()
				parts := strings.Split(compact, ".")
				candidate, _ := json.Marshal(flattenedJWS{Payload: parts[1], Protected: parts[0], Signature: parts[2]})
				if err := VerifyApproval(candidate, &key.PublicKey); err == nil {
					t.Fatalf("profile accepted forbidden protected header %s", field)
				}
			})
		}
	})
}

func signFlattened(t *testing.T, payload []byte, key *ecdsa.PrivateKey) []byte {
	t.Helper()
	options := (&jose.SignerOptions{}).
		WithType("capsule.signed-object+jws").
		WithHeader("cty", "application/capsule.approval-grant+jcs").
		WithHeader("kid", "approval-test-key").
		WithHeader("v", 1)
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.ES256, Key: key}, options)
	if err != nil {
		t.Fatal(err)
	}
	object, err := signer.Sign(payload)
	if err != nil {
		t.Fatal(err)
	}
	compact, err := object.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(compact, ".")
	encoded, err := json.Marshal(flattenedJWS{Payload: parts[1], Protected: parts[0], Signature: parts[2]})
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
