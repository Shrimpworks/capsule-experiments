package oracle

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"testing"
)

// This is the packet's literal 57-byte cancellation vector, not an encoder
// round trip. It deliberately gives each identity a different byte value.
const cancellationVector = "4335434e01010039" +
	"01010101010101010101010101010101" +
	"02020202020202020202020202020202" +
	"03030303030303030303030303030303" + "01"

func cancellationFixture(t *testing.T) ([]byte, cancelBindings) {
	t.Helper()
	frame, err := hex.DecodeString(cancellationVector)
	if err != nil {
		t.Fatal(err)
	}
	return frame, cancelBindings{
		Attempt:      [16]byte(bytes.Repeat([]byte{1}, 16)),
		Approval:     [16]byte(bytes.Repeat([]byte{2}, 16)),
		Registration: [16]byte(bytes.Repeat([]byte{3}, 16)),
	}
}

func TestCancellationKnownAnswer(t *testing.T) {
	frame, binding := cancellationFixture(t)
	if len(frame) != 57 {
		t.Fatalf("vector length = %d, want 57", len(frame))
	}
	if err := validateCancellationFrame(frame, binding); err != nil {
		t.Fatalf("valid packet refused: %v", err)
	}
}

func TestCancellationRejectsMutations(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func([]byte)
	}{
		{"magic", func(b []byte) { b[0] ^= 1 }},
		{"version", func(b []byte) { b[4]++ }},
		{"role", func(b []byte) { b[5]++ }},
		{"length", func(b []byte) { b[7]-- }},
		{"attempt", func(b []byte) { b[8] ^= 1 }},
		{"approval", func(b []byte) { b[24] ^= 1 }},
		{"registration", func(b []byte) { b[40] ^= 1 }},
		{"kind", func(b []byte) { b[56]++ }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := bytes.Clone(frame)
			tc.change(changed)
			if err := validateCancellationFrame(changed, binding); err == nil {
				t.Fatal("mutated packet accepted")
			}
		})
	}
	for _, tc := range []struct {
		name  string
		frame []byte
	}{
		{"short", frame[:56]},
		{"trailing", append(bytes.Clone(frame), 0)},
		{"empty", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := validateCancellationFrame(tc.frame, binding); err == nil {
				t.Fatal("invalid packet accepted")
			}
		})
	}
}

func TestCancellationAcceptsEachChangedValidFrozenBinding(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func(*cancelBindings)
	}{
		{"attempt", func(b *cancelBindings) { b.Attempt = [16]byte(bytes.Repeat([]byte{4}, 16)) }},
		{"approval", func(b *cancelBindings) { b.Approval = [16]byte(bytes.Repeat([]byte{5}, 16)) }},
		{"registration", func(b *cancelBindings) { b.Registration = [16]byte(bytes.Repeat([]byte{6}, 16)) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := binding
			tc.change(&changed)
			matchingFrame := bytes.Clone(frame)
			copy(matchingFrame[8:24], changed.Attempt[:])
			copy(matchingFrame[24:40], changed.Approval[:])
			copy(matchingFrame[40:56], changed.Registration[:])
			if err := validateCancellationFrame(matchingFrame, changed); err != nil {
				t.Fatalf("valid changed binding refused: %v", err)
			}
			if err := validateCancellationFrame(frame, changed); err == nil {
				t.Fatal("stale original frame accepted for changed binding")
			}
		})
	}
}

func TestCancellationRejectsInvalidFrozenBindings(t *testing.T) {
	frame, binding := cancellationFixture(t)
	for _, tc := range []struct {
		name   string
		change func(*cancelBindings)
	}{
		{"zero attempt", func(b *cancelBindings) { b.Attempt = [16]byte{} }},
		{"zero approval", func(b *cancelBindings) { b.Approval = [16]byte{} }},
		{"zero registration", func(b *cancelBindings) { b.Registration = [16]byte{} }},
		{"attempt equals approval", func(b *cancelBindings) { b.Attempt = b.Approval }},
		{"attempt equals registration", func(b *cancelBindings) { b.Attempt = b.Registration }},
		{"approval equals registration", func(b *cancelBindings) { b.Approval = b.Registration }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed := binding
			tc.change(&changed)
			matchingFrame := bytes.Clone(frame)
			copy(matchingFrame[8:24], changed.Attempt[:])
			copy(matchingFrame[24:40], changed.Approval[:])
			copy(matchingFrame[40:56], changed.Registration[:])
			if err := validateCancellationFrame(matchingFrame, changed); err == nil {
				t.Fatal("invalid frozen binding accepted")
			}
		})
	}
}

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

// Literal vectors independently assembled with Python struct big-endian fields
// and hashlib, not the Go decoder or record correspondence implementation.
const requestVector = "433531390101018d01010101010101010101010101010101020202020202020202020202020202020202020202020202020202020202020203030303030303030303030303030303030303030303030303030303030303030404040404040404040404040404040405050505050505050505050505050505060606060606060606060606060606060707070707070707070707070707070707070707070707070707070707070707080808080808080808080808080808080808080808080808080808080808080809090909090909090909090909090909090909090909090909090909090909090a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a9f28abcde4fc821a42bd006e8064734094508cf6d8c326feb0b152399f0b6a450a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a000000000000000101010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003e800000000000003e800000000000004b0"
const recordVector = "43355231000101010101010101010101010101010101020202020202020202020202020202020202020202020202020202020202020203030303030303030303030303030303030303030303030303030303030303030404040404040404040404040404040405050505050505050505050505050505060606060606060606060606060606060707070707070707070707070707070707070707070707070707070707070707080808080808080808080808080808080808080808080808080808080808080809090909090909090909090909090909090909090909090909090909090909090a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a9f28abcde4fc821a42bd006e8064734094508cf6d8c326feb0b152399f0b6a4500000000000003e800000000000003e800000000000004b000000000000000010a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a010100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
const replyVector = "43353139010200620a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a00000000000000010115c9d541589fdb529529c50d8f34c3c91742105c3e23d460398e4e9d082641a201e0e2e74aa9a0d7c147e24d38e57d787b5b53a88fac6257547336831b653cd1be"
const requestBodyDigestVector = "15c9d541589fdb529529c50d8f34c3c91742105c3e23d460398e4e9d082641a2"
const recordDigestVector = "e0e2e74aa9a0d7c147e24d38e57d787b5b53a88fac6257547336831b653cd1be"

func wireBytes(t *testing.T, literal string) []byte {
	t.Helper()
	b, err := hex.DecodeString(literal)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func TestWireKnownAnswersAndOwnership(t *testing.T) {
	request, record, reply := wireBytes(t, requestVector), wireBytes(t, recordVector), wireBytes(t, replyVector)
	req, err := decodeRequest(request, obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	rec, err := decodeRecord(record, obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	if req != rec {
		t.Fatal("request and record decoded differently")
	}
	if req.Generation != 1 || req.Kind != 1 || req.Operation != obligationFixture().Preparation || req.Candidate != [68]byte{1} {
		t.Fatal("wrong decoded fields")
	}
	if fmt.Sprintf("%x", sha256.Sum256(request[8:])) != requestBodyDigestVector || fmt.Sprintf("%x", sha256.Sum256(record)) != recordDigestVector {
		t.Fatal("independent vector hashes differ")
	}
	if err := validateRecordForRequest(record, request, obligationFixture()); err != nil {
		t.Fatal(err)
	}
	if outcome, err := validateReply(reply, request, obligationFixture()); err != nil || outcome != 1 {
		t.Fatalf("reply: %d %v", outcome, err)
	}
	request[280] ^= 1
	record[327] ^= 1
	if req != rec || req.Operation != obligationFixture().Preparation || req.Candidate != [68]byte{1} {
		t.Fatal("decoded values alias caller bytes")
	}
	req.Candidate[0] = 0
	if rec.Candidate[0] != 1 {
		t.Fatal("decoded candidates alias one another")
	}
}

// These helpers independently express the packet's offsets, not production encoders.
func recordFromRequest(request []byte) []byte {
	record := []byte{'C', '5', 'R', '1', 0, 1}
	record = append(record, request[8:280]...)
	record = append(record, request[373:397]...)
	record = append(record, request[296:304]...)
	record = append(record, request[280:296]...)
	return append(record, request[304:373]...)
}
func replyFromRequest(request []byte, outcome byte) []byte {
	reply := []byte{'C', '5', '1', '9', 1, 2, 0, 98}
	reply = append(reply, request[280:305]...)
	h := sha256.Sum256(request[8:])
	reply = append(reply, h[:]...)
	reply = append(reply, outcome)
	d := [32]byte{}
	if outcome == 1 {
		d = sha256.Sum256(recordFromRequest(request))
	}
	return append(reply, d[:]...)
}
func setWireObligation(request []byte) {
	preimage := append([]byte("capsule.c5b19.obligation/v1\x00\x00\x01"), request[8:248]...)
	preimage = append(preimage, request[373:397]...)
	preimage = append(preimage, 7)
	d := sha256.Sum256(preimage)
	copy(request[248:280], d[:])
}
func operationRequest(t *testing.T, kind byte, runner bool, disposition byte) []byte {
	t.Helper()
	r := wireBytes(t, requestVector)
	r[304] = kind
	if kind != 1 {
		copy(r[280:296], bytes.Repeat([]byte{11}, 16))
		binary.BigEndian.PutUint64(r[296:304], 2)
	}
	if runner {
		r[306] = 1
		copy(r[307:339], bytes.Repeat([]byte{12}, 32))
	}
	if kind == 3 {
		copy(r[339:371], bytes.Repeat([]byte{12}, 32))
		r[371] = 1
		r[372] = disposition
	}
	return r
}
func TestWireCandidateKindsAndUncertainOutcomes(t *testing.T) {
	for _, tc := range []struct {
		kind        byte
		runner      bool
		disposition byte
	}{{1, false, 0}, {2, true, 0}, {3, true, 1}, {3, false, 1}, {3, true, 2}, {3, false, 2}} {
		t.Run(fmt.Sprint(tc), func(t *testing.T) {
			r := operationRequest(t, tc.kind, tc.runner, tc.disposition)
			if _, err := decodeRequest(r, obligationFixture()); err != nil {
				t.Fatal(err)
			}
			if err := validateRecordForRequest(recordFromRequest(r), r, obligationFixture()); err != nil {
				t.Fatal(err)
			}
			for _, outcome := range []byte{1, 2, 3} {
				reply := replyFromRequest(r, outcome)
				got, err := validateReply(reply, r, obligationFixture())
				if err != nil || got != outcome {
					t.Fatalf("%d: %d %v", outcome, got, err)
				}
				if outcome != 1 {
					reply[66] = 1
					if _, err := validateReply(reply, r, obligationFixture()); err == nil {
						t.Fatal("uncertain reply accepted record digest")
					}
				}
			}
		})
	}
}
func TestWireEveryByteSubstitutionAndLengths(t *testing.T) {
	request, record, reply := wireBytes(t, requestVector), wireBytes(t, recordVector), wireBytes(t, replyVector)
	for i := range request {
		t.Run(fmt.Sprintf("request-%d", i), func(t *testing.T) {
			changed := bytes.Clone(request)
			changed[i] ^= 0x80
			if _, err := validateReply(reply, changed, obligationFixture()); err == nil {
				t.Fatal("substituted request matched reply")
			}
			if err := validateRecordForRequest(record, changed, obligationFixture()); err == nil {
				t.Fatal("substituted request matched record")
			}
		})
	}
	for i := range record {
		t.Run(fmt.Sprintf("record-%d", i), func(t *testing.T) {
			changed := bytes.Clone(record)
			changed[i] ^= 0x80
			if err := validateRecordForRequest(changed, request, obligationFixture()); err == nil {
				t.Fatal("substituted record accepted")
			}
		})
	}
	for i := range reply {
		t.Run(fmt.Sprintf("reply-%d", i), func(t *testing.T) {
			changed := bytes.Clone(reply)
			changed[i] ^= 0x80
			if _, err := validateReply(changed, request, obligationFixture()); err == nil {
				t.Fatal("substituted reply accepted")
			}
		})
	}
	for n := 0; n < len(request); n++ {
		if _, err := decodeRequest(request[:n], obligationFixture()); err == nil {
			t.Fatalf("short request %d accepted", n)
		}
	}
	for n := 0; n < len(record); n++ {
		if _, err := decodeRecord(record[:n], obligationFixture()); err == nil {
			t.Fatalf("short record %d accepted", n)
		}
	}
	for n := 0; n < len(reply); n++ {
		if _, err := validateReply(reply[:n], request, obligationFixture()); err == nil {
			t.Fatalf("short reply %d accepted", n)
		}
	}
	if _, err := decodeRequest(append(bytes.Clone(request), 0), obligationFixture()); err == nil {
		t.Fatal("trailing request accepted")
	}
	if _, err := decodeRecord(append(bytes.Clone(record), 0), obligationFixture()); err == nil {
		t.Fatal("trailing record accepted")
	}
	if _, err := validateReply(append(bytes.Clone(reply), 0), request, obligationFixture()); err == nil {
		t.Fatal("trailing reply accepted")
	}
}
func TestWireRejectsStructuralCandidatesEvenWithMatchingHashes(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func([]byte)
	}{
		{"zero operation", func(r []byte) { clear(r[280:296]) }},
		{"wrong preparation operation", func(r []byte) { r[280] = 13 }},
		{"zero generation", func(r []byte) { clear(r[296:304]) }},
		{"overflow generation", func(r []byte) { binary.BigEndian.PutUint64(r[296:304], 1<<53) }},
		{"zero kind", func(r []byte) { r[304] = 0 }}, {"unknown kind", func(r []byte) { r[304] = 4 }},
		{"unprepared", func(r []byte) { r[305] = 0 }}, {"bad prepared boolean", func(r []byte) { r[305] = 2 }},
		{"bad runner boolean", func(r []byte) { r[306] = 2 }}, {"bad terminal boolean", func(r []byte) { r[371] = 2 }},
		{"unknown disposition", func(r []byte) { r[372] = 3 }},
		{"preparation with runner", func(r []byte) { r[306] = 1; r[307] = 1 }},
		{"unconfirmed runner identity", func(r []byte) { r[307] = 1 }},
		{"nonterminal absence", func(r []byte) { r[339] = 1 }},
		{"nonterminal disposition", func(r []byte) { r[372] = 1 }},
		{"unconfirmed terminal", func(r []byte) { r[372] = 1; r[339] = 1 }},
		{"runner missing identity", func(r []byte) { r[304] = 2; r[280] = 11; r[306] = 1 }},
		{"runner reuses preparation", func(r []byte) { r[304] = 2; r[306] = 1; r[307] = 1 }},
		{"terminal missing absence", func(r []byte) { r[304] = 3; r[280] = 11; r[371] = 1; r[372] = 1 }},
		{"terminal missing disposition", func(r []byte) { r[304] = 3; r[280] = 11; r[371] = 1; r[339] = 1 }},
		{"terminal mismatched identities", func(r []byte) {
			r[304] = 3
			r[280] = 11
			r[306] = 1
			r[307] = 1
			r[339] = 2
			r[371] = 1
			r[372] = 1
		}},
		{"changed policy first", func(r []byte) { r[380] ^= 1; setWireObligation(r) }},
		{"changed policy second", func(r []byte) { r[388] ^= 1; setWireObligation(r) }},
		{"changed policy third", func(r []byte) { r[396] ^= 1; setWireObligation(r) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := wireBytes(t, requestVector)
			tc.change(r)
			if _, err := decodeRequest(r, obligationFixture()); err == nil {
				t.Fatal("invalid request accepted")
			}
			if _, err := decodeRecord(recordFromRequest(r), obligationFixture()); err == nil {
				t.Fatal("invalid record accepted")
			}
			if _, err := validateReply(replyFromRequest(r, 1), r, obligationFixture()); err == nil {
				t.Fatal("matching hashes launder invalid request")
			}
		})
	}
}
func TestWireAcceptsVariedOperationsAndFrozenBindings(t *testing.T) {
	for _, tc := range []struct {
		offset int
		change func(*obligationBindings)
	}{
		{8, func(b *obligationBindings) { b.Installation[0] = 13 }}, {24, func(b *obligationBindings) { b.TrustEpoch[0] = 13 }},
		{56, func(b *obligationBindings) { b.Supervisor[0] = 13 }}, {88, func(b *obligationBindings) { b.Attempt[0] = 13 }},
		{104, func(b *obligationBindings) { b.Approval[0] = 13 }}, {120, func(b *obligationBindings) { b.Registration[0] = 13 }},
		{136, func(b *obligationBindings) { b.Plan[0] = 13 }}, {168, func(b *obligationBindings) { b.Profile[0] = 13 }},
		{200, func(b *obligationBindings) { b.Runner[0] = 13 }}, {232, func(b *obligationBindings) { b.Preparation[0] = 13 }},
	} {
		t.Run(fmt.Sprint(tc.offset), func(t *testing.T) {
			r := wireBytes(t, requestVector)
			r[tc.offset] = 13
			b := obligationFixture()
			tc.change(&b)
			if tc.offset == 232 {
				r[280] = 13
			}
			setWireObligation(r)
			got, err := decodeRequest(r, b)
			if err != nil || got.Bindings != b {
				t.Fatalf("changed valid binding refused: %v", err)
			}
			if err := validateRecordForRequest(recordFromRequest(r), r, b); err != nil {
				t.Fatal(err)
			}
			if _, err := validateReply(replyFromRequest(r, 1), r, b); err != nil {
				t.Fatal(err)
			}
			if _, err := decodeRequest(r, obligationFixture()); err == nil {
				t.Fatal("stale context accepted")
			}
		})
	}
	r := operationRequest(t, 3, true, 2)
	r[280] = 15
	binary.BigEndian.PutUint64(r[296:304], 1<<53-1)
	r[307] = 14
	r[339] = 14
	got, err := decodeRequest(r, obligationFixture())
	if err != nil || got.Generation != 1<<53-1 || got.Operation[0] != 15 || got.Candidate[2] != 14 {
		t.Fatalf("valid varied operation: %+v %v", got, err)
	}
	if _, err := validateReply(replyFromRequest(r, 1), r, obligationFixture()); err != nil {
		t.Fatal(err)
	}
}

func TestWireFailedReplyStillRequiresExactRequestBody(t *testing.T) {
	request := operationRequest(t, 3, false, 1)
	for _, outcome := range []byte{2, 3} {
		reply := replyFromRequest(request, outcome)
		changed := bytes.Clone(request)
		changed[372] = 2
		if _, err := decodeRequest(changed, obligationFixture()); err != nil {
			t.Fatal(err)
		}
		if _, err := validateReply(reply, changed, obligationFixture()); err == nil {
			t.Fatal("uncertain reply matched a different valid request body")
		}
	}
}

// This is deliberately separate from production decoding so matching malformed
// context cannot be refused merely because its raw fields differ from context.
func bindingsFromTestRequest(r []byte) obligationBindings {
	b := obligationBindings{}
	copy(b.Installation[:], r[8:24])
	copy(b.TrustEpoch[:], r[24:56])
	copy(b.Supervisor[:], r[56:88])
	copy(b.Attempt[:], r[88:104])
	copy(b.Approval[:], r[104:120])
	copy(b.Registration[:], r[120:136])
	copy(b.Plan[:], r[136:168])
	copy(b.Profile[:], r[168:200])
	copy(b.Runner[:], r[200:232])
	copy(b.Preparation[:], r[232:248])
	return b
}
func TestWireRejectsMatchingInvalidFrozenBindings(t *testing.T) {
	groups := [][]int{{8, 88, 104, 120, 232}, {24, 56, 136, 168, 200}}
	for gi, offsets := range groups {
		size := 16
		if gi == 1 {
			size = 32
		}
		for i, offset := range offsets {
			for prior := -1; prior < i; prior++ {
				t.Run(fmt.Sprintf("group-%d-field-%d-prior-%d", gi, i, prior), func(t *testing.T) {
					r := wireBytes(t, requestVector)
					if prior < 0 {
						clear(r[offset : offset+size])
					} else {
						copy(r[offset:offset+size], r[offsets[prior]:offsets[prior]+size])
					}
					if offset == 232 {
						copy(r[280:296], r[232:248])
					}
					setWireObligation(r)
					frozen := bindingsFromTestRequest(r)
					if _, err := decodeRequest(r, frozen); err == nil {
						t.Fatal("matching invalid bindings accepted")
					}
					if _, err := decodeRecord(recordFromRequest(r), frozen); err == nil {
						t.Fatal("record matching invalid bindings accepted")
					}
				})
			}
		}
	}
}
