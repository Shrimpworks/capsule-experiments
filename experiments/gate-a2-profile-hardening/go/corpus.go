package hardening

import (
	"bytes"
	"crypto/elliptic"
	"encoding/json"
	"errors"

	"github.com/fxamacker/cbor/v2"
)

type Corpus struct {
	FormatVersion int    `json:"formatVersion"`
	Seed          string `json:"seed"`
	Cases         []Case `json:"cases"`
}

type Case struct {
	Name        string `json:"name"`
	Category    string `json:"category"`
	Profile     Kind   `json:"profile"`
	Expectation string `json:"expectation"`
	Wire        string `json:"wire"`
}

func (c Corpus) JSON() ([]byte, error) { return json.MarshalIndent(c, "", "  ") }

func (p *Profile) Corpus() (Corpus, error) {
	var cases []Case
	add := func(name, category string, kind Kind, expectation string, wire []byte) {
		cases = append(cases, Case{Name: name, Category: category, Profile: kind, Expectation: expectation, Wire: EncodeBase64URL(wire)})
	}
	addReject := func(name, category string, kind Kind, wire []byte) {
		add(name, category, kind, "reject", wire)
	}

	approvalPayload, err := p.Payload(ApprovalGrantKind)
	if err != nil {
		return Corpus{}, err
	}
	approvalProtected, err := p.Protected(ApprovalGrantKind)
	if err != nil {
		return Corpus{}, err
	}
	transcriptProtected, err := p.Protected(EnforcementTranscriptKind)
	if err != nil {
		return Corpus{}, err
	}
	approval, err := p.Sign(ApprovalGrantKind)
	if err != nil {
		return Corpus{}, err
	}
	transcript, err := p.Sign(EnforcementTranscriptKind)
	if err != nil {
		return Corpus{}, err
	}
	approvalComplement, err := p.ComplementSignature(approval)
	if err != nil {
		return Corpus{}, err
	}
	transcriptComplement, err := p.ComplementSignature(transcript)
	if err != nil {
		return Corpus{}, err
	}
	add("approval-valid", "positive", ApprovalGrantKind, "accept", approval)
	add("approval-valid-complementary-s", "positive", ApprovalGrantKind, "accept", approvalComplement)
	add("transcript-valid", "positive", EnforcementTranscriptKind, "accept", transcript)
	add("transcript-valid-complementary-s", "positive", EnforcementTranscriptKind, "accept", transcriptComplement)

	// Mutually exclusive object wrappers must reject an otherwise valid envelope.
	addReject("approval-as-transcript", "cross-object", EnforcementTranscriptKind, approval)
	addReject("transcript-as-approval", "cross-object", ApprovalGrantKind, transcript)

	// Envelope syntax, alternate representation, trailing-data, allocation, and depth hazards.
	addReject("empty", "envelope", ApprovalGrantKind, []byte{})
	for _, cut := range []int{1, 2, 3, 8, 31, len(approval) - 1} {
		addReject("truncated-"+itoa(cut), "envelope", ApprovalGrantKind, append([]byte(nil), approval[:cut]...))
	}
	addReject("missing-tag", "tag", ApprovalGrantKind, append([]byte(nil), approval[1:]...))
	nonpreferredTag := append([]byte{0xd8, 0x12}, approval[1:]...)
	addReject("nonpreferred-tag-18", "tag", ApprovalGrantKind, nonpreferredTag)
	wrongTag := append([]byte(nil), approval...)
	wrongTag[0] = 0xd3
	addReject("wrong-tag-19", "tag", ApprovalGrantKind, wrongTag)
	nestedTag := append([]byte{0xc0}, approval...)
	addReject("arbitrary-outer-tag", "tag", ApprovalGrantKind, nestedTag)
	addReject("trailing-zero", "trailing", ApprovalGrantKind, append(append([]byte(nil), approval...), 0x00))
	addReject("trailing-second-object", "trailing", ApprovalGrantKind, append(append([]byte(nil), approval...), 0xa0))
	indefiniteOuter := append([]byte(nil), approval...)
	if len(indefiniteOuter) < 2 || indefiniteOuter[1] != 0x84 {
		return Corpus{}, errors.New("unexpected envelope layout")
	}
	indefiniteOuter[1] = 0x9f
	indefiniteOuter = append(indefiniteOuter, 0xff)
	addReject("indefinite-outer-array", "alternate-encoding", ApprovalGrantKind, indefiniteOuter)
	wrongCount := append([]byte(nil), approval...)
	wrongCount[1] = 0x83
	addReject("three-item-body", "envelope", ApprovalGrantKind, wrongCount)
	for _, malformedBody := range []struct {
		name string
		body []any
	}{
		{"five-item-body", []any{approvalProtected, map[int64]any{}, approvalPayload, repeated(0, 64), uint64(0)}},
		{"protected-not-bytes", []any{"protected", map[int64]any{}, approvalPayload, repeated(0, 64)}},
		{"detached-null-payload", []any{approvalProtected, map[int64]any{}, nil, repeated(0, 64)}},
		{"payload-not-bytes", []any{approvalProtected, map[int64]any{}, "payload", repeated(0, 64)}},
		{"signature-not-bytes", []any{approvalProtected, map[int64]any{}, approvalPayload, "signature"}},
	} {
		wire, marshalErr := p.Marshal(cbor.Tag{Number: COSESign1Tag, Content: malformedBody.body})
		if marshalErr != nil {
			return Corpus{}, marshalErr
		}
		addReject(malformedBody.name, "envelope", ApprovalGrantKind, wire)
	}
	hugeDeclared := []byte{0xd2, 0x84, 0x5b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}
	addReject("huge-declared-protected-length", "resource", ApprovalGrantKind, hugeDeclared)
	deep := []byte{0xd2}
	deep = append(deep, bytes.Repeat([]byte{0x81}, 24)...)
	deep = append(deep, 0x00)
	addReject("nesting-over-limit", "resource", ApprovalGrantKind, deep)
	overRaw := append([]byte(nil), approval...)
	overRaw = append(overRaw, bytes.Repeat([]byte{0}, MaxEnvelopeBytes-len(overRaw)+1)...)
	addReject("raw-envelope-over-limit", "resource", ApprovalGrantKind, overRaw)

	// Protected-header confusion. Every case below is correctly signed unless its
	// purpose is specifically signature corruption.
	protectedMutations := []struct {
		name string
		raw  []byte
	}{
		{"protected-indefinite-map", indefiniteMap(approvalProtected)},
		{"protected-duplicate-alg", duplicateMapPair(approvalProtected, []byte{0x01, 0x26})},
		{"protected-nonpreferred-alg", replaceOnce(approvalProtected, []byte{0x01, 0x26}, []byte{0x01, 0x38, 0x06})},
		{"protected-out-of-order", protectedOutOfOrder(approvalProtected)},
		{"protected-arbitrary-tag", append([]byte{0xc0}, approvalProtected...)},
		{"protected-trailing-data", append(append([]byte(nil), approvalProtected...), 0x00)},
		{"protected-invalid-utf8", replaceTextFirstByte(approvalProtected, "application/capsule.approval-grant+cbor;v=0", 0xff)},
	}
	for _, mutation := range protectedMutations {
		wire, signErr := p.SignRaw(mutation.raw, approvalPayload, map[int64]any{}, nil)
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject(mutation.name, "protected", ApprovalGrantKind, wire)
	}
	for name, headers := range map[string]map[int64]any{
		"protected-wrong-algorithm":    {1: int64(-8), 3: "application/capsule.approval-grant+cbor;v=0", 4: []byte("approval-test-key")},
		"protected-wrong-content-type": {1: ES256, 3: "application/capsule.enforcement-transcript+cbor;v=0", 4: []byte("approval-test-key")},
		"protected-wrong-kid":          {1: ES256, 3: "application/capsule.approval-grant+cbor;v=0", 4: []byte("supervisor-test-key")},
		"protected-text-kid":           {1: ES256, 3: "application/capsule.approval-grant+cbor;v=0", 4: "approval-test-key"},
		"protected-empty-kid":          {1: ES256, 3: "application/capsule.approval-grant+cbor;v=0", 4: []byte{}},
		"protected-oversize-kid":       {1: ES256, 3: "application/capsule.approval-grant+cbor;v=0", 4: repeated(0xaa, 65)},
		"protected-unknown-header":     {1: ES256, 3: "application/capsule.approval-grant+cbor;v=0", 4: []byte("approval-test-key"), 33: "https://attacker.invalid/key"},
	} {
		raw, marshalErr := p.Marshal(headers)
		if marshalErr != nil {
			return Corpus{}, marshalErr
		}
		wire, signErr := p.SignRaw(raw, approvalPayload, map[int64]any{}, nil)
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject(name, "protected", ApprovalGrantKind, wire)
	}
	unprotected, err := p.SignRaw(approvalProtected, approvalPayload, map[int64]any{4: []byte("attacker")}, nil)
	if err != nil {
		return Corpus{}, err
	}
	addReject("nonempty-unprotected", "unprotected", ApprovalGrantKind, unprotected)

	// Payload alternate encodings, malformed types, tags, and resource bounds.
	payloadMutations := []struct {
		name, category string
		raw            []byte
	}{
		{"payload-indefinite-map", "alternate-encoding", indefiniteMap(approvalPayload)},
		{"payload-duplicate-version", "duplicate", duplicateMapPair(approvalPayload, []byte{0x02, 0x00})},
		{"payload-nonpreferred-map-length", "alternate-encoding", nonpreferredMapLength(approvalPayload)},
		{"payload-nonpreferred-key", "alternate-encoding", replaceOnce(approvalPayload, []byte{0x01}, []byte{0x18, 0x01})},
		{"payload-nonpreferred-zero", "alternate-encoding", replaceOnce(approvalPayload, []byte{0x02, 0x00, 0x03}, []byte{0x02, 0x18, 0x00, 0x03})},
		{"payload-nonpreferred-bstr-length", "alternate-encoding", replaceOnce(approvalPayload, []byte{0x03, 0x50}, []byte{0x03, 0x58, 0x10})},
		{"payload-out-of-order", "alternate-encoding", approvalOutOfOrder(approvalPayload)},
		{"payload-arbitrary-root-tag", "tag", append([]byte{0xc0}, approvalPayload...)},
		{"payload-trailing-data", "trailing", append(append([]byte(nil), approvalPayload...), 0x00)},
		{"payload-invalid-utf8", "utf8", replaceTextFirstByte(approvalPayload, "capsule.plan.approve", 0xff)},
		{"payload-deep-nesting", "resource", append(bytes.Repeat([]byte{0x81}, 24), 0x00)},
		{"payload-huge-declared-map", "resource", []byte{0xbb, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}},
		{"payload-huge-declared-string", "resource", []byte{0xa1, 0x01, 0x7b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff}},
	}
	for _, mutation := range payloadMutations {
		wire, signErr := p.SignRaw(approvalProtected, mutation.raw, map[int64]any{}, nil)
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject(mutation.name, mutation.category, ApprovalGrantKind, wire)
	}

	approvalMap := expectedApprovalMap()
	semantic := []struct {
		name, category string
		key            uint64
		value          any
	}{
		{"payload-wrong-object-type", "type-confusion", 1, "capsule.enforcement-transcript"},
		{"payload-wrong-version", "version-confusion", 2, uint64(1)},
		{"payload-wrong-installation", "binding", 3, repeated(0x99, 16)},
		{"payload-wrong-epoch", "binding", 4, repeated(0x99, 32)},
		{"payload-wrong-registration", "binding", 5, repeated(0x99, 16)},
		{"payload-wrong-plan", "binding", 6, repeated(0x99, 32)},
		{"payload-wrong-supervisor", "binding", 7, repeated(0x99, 16)},
		{"payload-wrong-attempt", "binding", 8, repeated(0x99, 16)},
		{"payload-wrong-purpose", "purpose-confusion", 9, "capsule.execution.attest"},
		{"payload-wrong-audience", "audience-confusion", 10, "capsule.receipt-composer"},
		{"payload-negative-issued-at", "numeric", 11, int64(-1)},
		{"payload-float-issued-at", "numeric", 11, 1.5},
		{"payload-unsafe-issued-at", "numeric", 11, uint64(9_007_199_254_740_992)},
		{"payload-expires-before-issued", "time", 12, uint64(1_785_455_999)},
		{"payload-short-installation", "resource", 3, repeated(0x11, 15)},
		{"payload-long-digest", "resource", 4, repeated(0x22, 33)},
		{"payload-array-for-id", "type-confusion", 3, []any{uint64(1)}},
		{"payload-tag-for-id", "tag", 3, cborTag(0, repeated(0x11, 16))},
	}
	for _, mutation := range semantic {
		candidate := cloneMap(approvalMap)
		candidate[mutation.key] = mutation.value
		raw, marshalErr := p.Marshal(candidate)
		if marshalErr != nil {
			return Corpus{}, marshalErr
		}
		wire, signErr := p.SignRaw(approvalProtected, raw, map[int64]any{}, nil)
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject(mutation.name, mutation.category, ApprovalGrantKind, wire)
	}
	unknown := cloneMap(approvalMap)
	unknown[99] = uint64(1)
	unknownRaw, _ := p.Marshal(unknown)
	unknownWire, _ := p.SignRaw(approvalProtected, unknownRaw, map[int64]any{}, nil)
	addReject("payload-unknown-field", "unknown-field", ApprovalGrantKind, unknownWire)

	// Transcript-specific semantic confusion ensures the second wrapper is not a
	// content-type-only facade.
	transcriptMap := expectedTranscriptMap()
	for _, mutation := range []struct {
		name  string
		key   uint64
		value any
	}{
		{"transcript-wrong-attempt", 6, repeated(0x99, 16)},
		{"transcript-wrong-purpose", 9, "capsule.plan.approve"},
		{"transcript-wrong-audience", 10, "capsule.execution-supervisor"},
		{"transcript-nonterminal", 11, "running"},
		{"transcript-unresolved-teardown", 12, "unknown"},
	} {
		candidate := cloneMap(transcriptMap)
		candidate[mutation.key] = mutation.value
		raw, _ := p.Marshal(candidate)
		wire, _ := p.SignRaw(transcriptProtected, raw, map[int64]any{}, nil)
		addReject(mutation.name, "transcript-semantics", EnforcementTranscriptKind, wire)
	}

	// Signature representation and scalar failures.
	tampered := append([]byte(nil), approval...)
	tampered[len(tampered)-1] ^= 1
	addReject("signature-tampered", "signature", ApprovalGrantKind, tampered)
	for _, size := range []int{0, 63, 65} {
		wire, signErr := p.SignRaw(approvalProtected, approvalPayload, map[int64]any{}, repeated(0, size))
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject("signature-length-"+itoa(size), "signature", ApprovalGrantKind, wire)
	}
	derShaped := []byte{0x30, 0x44, 0x02, 0x20}
	derShaped = append(derShaped, repeated(0x01, 32)...)
	derShaped = append(derShaped, 0x02, 0x20)
	derShaped = append(derShaped, repeated(0x01, 32)...)
	derWire, signErr := p.SignRaw(approvalProtected, approvalPayload, map[int64]any{}, derShaped)
	if signErr != nil {
		return Corpus{}, signErr
	}
	addReject("signature-der-shaped", "signature", ApprovalGrantKind, derWire)
	zeroR := make([]byte, 64)
	zeroR[63] = 1
	zeroS := make([]byte, 64)
	zeroS[31] = 1
	nScalar := make([]byte, 64)
	elliptic.P256().Params().N.FillBytes(nScalar[:32])
	nScalar[63] = 1
	nS := make([]byte, 64)
	nS[31] = 1
	elliptic.P256().Params().N.FillBytes(nS[32:])
	for name, signature := range map[string][]byte{"signature-r-zero": zeroR, "signature-s-zero": zeroS, "signature-r-equals-n": nScalar, "signature-s-equals-n": nS} {
		wire, signErr := p.SignRaw(approvalProtected, approvalPayload, map[int64]any{}, signature)
		if signErr != nil {
			return Corpus{}, signErr
		}
		addReject(name, "signature", ApprovalGrantKind, wire)
	}

	return Corpus{FormatVersion: 1, Seed: "capsule-gate-a2-hardening-v1", Cases: cases}, nil
}

func expectedApprovalMap() map[uint64]any {
	g := ExpectedApproval()
	return map[uint64]any{1: g.ObjectType, 2: g.ObjectVersion, 3: g.Installation, 4: g.EpochDigest, 5: g.Registration, 6: g.PlanDigest, 7: g.Supervisor, 8: g.AttemptNonce, 9: g.Purpose, 10: g.Audience, 11: g.IssuedAt, 12: g.ExpiresAt}
}

func expectedTranscriptMap() map[uint64]any {
	t := ExpectedTranscript()
	return map[uint64]any{1: t.ObjectType, 2: t.ObjectVersion, 3: t.Installation, 4: t.EpochDigest, 5: t.Registration, 6: t.AttemptID, 7: t.PlanDigest, 8: t.EventRoot, 9: t.Purpose, 10: t.Audience, 11: t.TerminalState, 12: t.TeardownState, 13: t.FinishedAt}
}

func cloneMap(source map[uint64]any) map[uint64]any {
	out := make(map[uint64]any, len(source))
	for key, value := range source {
		out[key] = value
	}
	return out
}

func duplicateMapPair(raw, pair []byte) []byte {
	out := append([]byte(nil), raw...)
	if len(out) == 0 || out[0] < 0xa0 || out[0] > 0xb7 {
		return []byte{0xff}
	}
	out[0]++
	return append(out, pair...)
}

func indefiniteMap(raw []byte) []byte {
	if len(raw) == 0 || raw[0] < 0xa0 || raw[0] > 0xb7 {
		return []byte{0xff}
	}
	out := append([]byte{0xbf}, raw[1:]...)
	return append(out, 0xff)
}

func nonpreferredMapLength(raw []byte) []byte {
	if len(raw) == 0 || raw[0] < 0xa0 || raw[0] > 0xb7 {
		return []byte{0xff}
	}
	return append([]byte{0xb8, raw[0] - 0xa0}, raw[1:]...)
}

func replaceOnce(source, old, replacement []byte) []byte {
	out := bytes.Replace(source, old, replacement, 1)
	if bytes.Equal(out, source) {
		return []byte{0xff}
	}
	return out
}

func replaceTextFirstByte(source []byte, text string, value byte) []byte {
	out := append([]byte(nil), source...)
	index := bytes.Index(out, []byte(text))
	if index < 0 {
		return []byte{0xff}
	}
	out[index] = value
	return out
}

func approvalOutOfOrder(raw []byte) []byte {
	// The canonical fixture starts with pair 1 (a 22-byte text value), then
	// pair 2 (zero). Swap those two exact encoded pairs without changing value.
	const firstPairEnd = 25
	const secondPairEnd = 27
	if len(raw) < secondPairEnd || raw[0] != 0xac || raw[1] != 0x01 || raw[firstPairEnd] != 0x02 {
		return []byte{0xff}
	}
	out := []byte{raw[0]}
	out = append(out, raw[firstPairEnd:secondPairEnd]...)
	out = append(out, raw[1:firstPairEnd]...)
	return append(out, raw[secondPairEnd:]...)
}

func protectedOutOfOrder(raw []byte) []byte {
	// Protected headers start with pairs 1 and 3; key 4 locates the end of the
	// second pair. Swap the first two exact encoded pairs.
	key4 := bytes.Index(raw, []byte{0x04, 0x51})
	if len(raw) < 4 || raw[0] != 0xa3 || raw[1] != 0x01 || key4 <= 3 {
		return []byte{0xff}
	}
	out := []byte{raw[0]}
	out = append(out, raw[3:key4]...)
	out = append(out, raw[1:3]...)
	return append(out, raw[key4:]...)
}

func cborTag(number uint64, value any) any { return cbor.Tag{Number: number, Content: value} }

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	negative := value < 0
	if negative {
		value = -value
	}
	var buf [20]byte
	index := len(buf)
	for value > 0 {
		index--
		buf[index] = byte('0' + value%10)
		value /= 10
	}
	if negative {
		index--
		buf[index] = '-'
	}
	return string(buf[index:])
}
