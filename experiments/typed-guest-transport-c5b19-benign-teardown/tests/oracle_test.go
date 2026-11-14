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

// Independently assembled with Python struct/hashlib from the Gate-2 field table.
// Payload deliberately has no kind-specific meaning: this is envelope-only evidence.
const eventEnvelopeVector = "433545560101001d0102030405060708fedcba987654321088776655443322110000007d000000037a06ffea981ff10e3292aaf1ac5ea6e6b913648f4e02d965f27da588072009c90b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0bf1e2d3c4b5a697880c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d89abcdeff8a432eb8000000076543210fedcba9803020e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f00000000000000000000"
const eventBindingDigestVector = "7a06ffea981ff10e3292aaf1ac5ea6e6b913648f4e02d965f27da588072009c9"

func TestEventEnvelopeKnownAnswerAndOwnership(t *testing.T) {
	raw := wireBytes(t, eventEnvelopeVector)
	want := eventEnvelope{
		Lane: 1, Kind: 29, Sequence: 0x0102030405060708,
		Tick: 0xfedcba9876543210, AuxiliaryTick: 0x8877665544332211,
		Numerator: 125, Denominator: 3,
		BindingDigest: [32]byte(wireBytes(t, eventBindingDigestVector)),
		Operation:     [16]byte(bytes.Repeat([]byte{11}, 16)), Generation: 0xf1e2d3c4b5a69788,
		RequestDigest:   [32]byte(bytes.Repeat([]byte{12}, 32)),
		ProcessIdentity: [32]byte(bytes.Repeat([]byte{13}, 32)),
		PID:             0x89abcdef, SyscallResult: -123456789, Errno: -2147483648,
		Flags: 0x76543210, WaitStatus: 0xfedcba98, Outcome: 3, ApplicationResult: 2,
		RecordDigest:    [32]byte(bytes.Repeat([]byte{14}, 32)),
		CandidateDigest: [32]byte(bytes.Repeat([]byte{15}, 32)),
	}
	got, err := decodeEventEnvelope(raw, obligationFixture(), 125, 3)
	if err != nil || got != want {
		t.Fatalf("decoded fields = %+v, %v; want %+v", got, err, want)
	}
	before := bytes.Clone(raw)
	got.Operation[0] ^= 1
	got.CandidateDigest[31] ^= 1
	if !bytes.Equal(raw, before) {
		t.Fatal("decoded value aliases input")
	}
	copyOfValue := got
	for i := range raw {
		raw[i] ^= 0xff
	}
	if copyOfValue != got {
		t.Fatal("input mutation altered decoded values")
	}
	// Kind29 on control and non-common payload are decoded, not semantically
	// approved. A later kind/causal oracle must reject this as a case trace.
}

func requireEnvelopeRefused(t *testing.T, raw []byte, frozen obligationBindings, numer, denom uint32) {
	t.Helper()
	got, err := decodeEventEnvelope(raw, frozen, numer, denom)
	if err == nil || got != (eventEnvelope{}) {
		t.Fatalf("invalid envelope returned %+v, %v", got, err)
	}
}

func TestEventEnvelopeRefusesMalformedCommonFields(t *testing.T) {
	raw := wireBytes(t, eventEnvelopeVector)
	for n := 0; n < 256; n++ {
		requireEnvelopeRefused(t, raw[:n], obligationFixture(), 125, 3)
	}
	requireEnvelopeRefused(t, append(bytes.Clone(raw), 0), obligationFixture(), 125, 3)
	for _, offset := range []int{0, 1, 2, 3, 4, 40, 71, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255} {
		t.Run(fmt.Sprintf("byte%d", offset), func(t *testing.T) {
			changed := bytes.Clone(raw)
			changed[offset] ^= 0xff
			requireEnvelopeRefused(t, changed, obligationFixture(), 125, 3)
		})
	}
	for _, tc := range []struct {
		offset int
		values []byte
	}{
		{5, []byte{0, 4, 255}}, {180, []byte{4, 255}}, {181, []byte{3, 255}},
	} {
		for _, value := range tc.values {
			changed := bytes.Clone(raw)
			changed[tc.offset] = value
			requireEnvelopeRefused(t, changed, obligationFixture(), 125, 3)
		}
	}
	for _, kind := range []uint16{0, 30, 256, 65535} {
		changed := bytes.Clone(raw)
		binary.BigEndian.PutUint16(changed[6:8], kind)
		requireEnvelopeRefused(t, changed, obligationFixture(), 125, 3)
	}
	for _, pair := range [][2]uint32{{0, 3}, {125, 0}, {0, 0}, {126, 3}, {125, 4}} {
		requireEnvelopeRefused(t, raw, obligationFixture(), pair[0], pair[1])
		changed := bytes.Clone(raw)
		binary.BigEndian.PutUint32(changed[32:36], pair[0])
		binary.BigEndian.PutUint32(changed[36:40], pair[1])
		requireEnvelopeRefused(t, changed, obligationFixture(), 125, 3)
		if pair[0] == 0 || pair[1] == 0 {
			requireEnvelopeRefused(t, changed, obligationFixture(), pair[0], pair[1])
		}
	}
	preimage, err := encodeObligationPreimage(obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	wrong := sha256.Sum256(preimage)
	copy(raw[40:72], wrong[:])
	requireEnvelopeRefused(t, raw, obligationFixture(), 125, 3)
}

func TestEventEnvelopeClosedCodesAndUnsignedExtremes(t *testing.T) {
	for lane := byte(1); lane <= 3; lane++ {
		for kind := uint16(1); kind <= 29; kind++ {
			for outcome := byte(0); outcome <= 3; outcome++ {
				for application := byte(0); application <= 2; application++ {
					raw := wireBytes(t, eventEnvelopeVector)
					raw[5], raw[180], raw[181] = lane, outcome, application
					binary.BigEndian.PutUint16(raw[6:8], kind)
					got, err := decodeEventEnvelope(raw, obligationFixture(), 125, 3)
					if err != nil || got.Lane != lane || got.Kind != kind || got.Outcome != outcome || got.ApplicationResult != application {
						t.Fatalf("known codes refused or changed: %+v %v", got, err)
					}
				}
			}
		}
	}
	for _, value := range []uint64{0, 1, ^uint64(0)} {
		raw := wireBytes(t, eventEnvelopeVector)
		for _, offset := range []int{8, 16, 24, 88} {
			binary.BigEndian.PutUint64(raw[offset:offset+8], value)
		}
		binary.BigEndian.PutUint32(raw[32:36], ^uint32(0))
		binary.BigEndian.PutUint32(raw[36:40], 1)
		got, err := decodeEventEnvelope(raw, obligationFixture(), ^uint32(0), 1)
		if err != nil || got.Sequence != value || got.Tick != value || got.AuxiliaryTick != value || got.Generation != value {
			t.Fatalf("u64 boundary changed: %+v %v", got, err)
		}
	}
}

func TestEventEnvelopeFrozenBindings(t *testing.T) {
	// Literal request bytes hold all ten binding fields, independently of the new decoder.
	fields := [][2]int{{8, 24}, {24, 56}, {56, 88}, {88, 104}, {104, 120}, {120, 136}, {136, 168}, {168, 200}, {200, 232}, {232, 248}}
	for _, field := range fields {
		for _, fill := range []byte{0, 21} {
			r := wireBytes(t, requestVector)
			copy(r[field[0]:field[1]], bytes.Repeat([]byte{fill}, field[1]-field[0]))
			frozen := bindingsFromTestRequest(r)
			raw := wireBytes(t, eventEnvelopeVector)
			digest := sha256.Sum256(r[8:248])
			copy(raw[40:72], digest[:])
			if fill == 0 {
				requireEnvelopeRefused(t, raw, frozen, 125, 3)
				continue
			}
			if _, err := decodeEventEnvelope(raw, frozen, 125, 3); err != nil {
				t.Fatalf("valid changed binding %v refused: %v", field, err)
			}
			requireEnvelopeRefused(t, wireBytes(t, eventEnvelopeVector), frozen, 125, 3)
		}
	}
	for _, pair := range [][4]int{{8, 24, 88, 104}, {24, 56, 56, 88}} {
		r := wireBytes(t, requestVector)
		copy(r[pair[0]:pair[1]], r[pair[2]:pair[3]])
		raw := wireBytes(t, eventEnvelopeVector)
		digest := sha256.Sum256(r[8:248])
		copy(raw[40:72], digest[:])
		requireEnvelopeRefused(t, raw, bindingsFromTestRequest(r), 125, 3)
	}
}

func laneEnvelopeFixture(t *testing.T, lane byte, count int, first uint64) []byte {
	t.Helper()
	base := wireBytes(t, eventEnvelopeVector)
	base[5] = lane
	raw := make([]byte, count*256)
	for i := 0; i < count; i++ {
		frame := raw[i*256 : (i+1)*256]
		copy(frame, base)
		binary.BigEndian.PutUint64(frame[8:16], first+uint64(i))
		binary.BigEndian.PutUint64(frame[16:24], uint64(i))
	}
	return raw
}

func TestLaneEnvelopeCapsAndFraming(t *testing.T) {
	for _, tc := range []struct {
		lane byte
		cap  int
	}{{1, 32768}, {2, 1024}, {3, 64}} {
		t.Run(fmt.Sprintf("lane%d", tc.lane), func(t *testing.T) {
			for _, first := range []uint64{0, 1, 123456789} {
				raw := laneEnvelopeFixture(t, tc.lane, tc.cap, first)
				before := bytes.Clone(raw)
				if err := validateLaneEnvelope(raw, tc.lane, first, obligationFixture(), 125, 3); err != nil {
					t.Fatalf("exact cap refused: %v", err)
				}
				if !bytes.Equal(raw, before) {
					t.Fatal("lane check modified caller bytes")
				}
				tooMany := laneEnvelopeFixture(t, tc.lane, tc.cap+1, first)
				if err := validateLaneEnvelope(tooMany, tc.lane, first, obligationFixture(), 125, 3); err == nil {
					t.Fatal("cap+1 accepted")
				}
			}
			for _, raw := range [][]byte{nil, {}, make([]byte, 255), laneEnvelopeFixture(t, tc.lane, 2, 0)[:511], append(laneEnvelopeFixture(t, tc.lane, 1, 0), 0)} {
				if err := validateLaneEnvelope(raw, tc.lane, 0, obligationFixture(), 125, 3); err == nil {
					t.Fatal("empty/truncated/trailing lane accepted")
				}
			}
		})
	}
	for _, lane := range []byte{0, 4, 255} {
		if err := validateLaneEnvelope(laneEnvelopeFixture(t, 1, 1, 0), lane, 0, obligationFixture(), 125, 3); err == nil {
			t.Fatal("unknown expected lane accepted")
		}
	}
}

func TestLaneEnvelopeSequencesAndOverflow(t *testing.T) {
	for _, lane := range []byte{1, 2, 3} {
		for _, first := range []uint64{0, 1, ^uint64(0) - 2} {
			raw := laneEnvelopeFixture(t, lane, 3, first)
			if err := validateLaneEnvelope(raw, lane, first, obligationFixture(), 125, 3); err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 3; i++ {
				for _, seq := range []uint64{first + uint64(i) - 1, first + uint64(i) + 1} {
					changed := bytes.Clone(raw)
					binary.BigEndian.PutUint64(changed[i*256+8:i*256+16], seq)
					if err := validateLaneEnvelope(changed, lane, first, obligationFixture(), 125, 3); err == nil {
						t.Fatalf("wrong sequence accepted at %d", i)
					}
				}
				changed := bytes.Clone(raw)
				changed[i*256+5] = lane%3 + 1
				if err := validateLaneEnvelope(changed, lane, first, obligationFixture(), 125, 3); err == nil {
					t.Fatal("mixed lane accepted")
				}
				for _, offset := range []int{0, 40, 246} {
					changed := bytes.Clone(raw)
					changed[i*256+offset] ^= 0xff
					if err := validateLaneEnvelope(changed, lane, first, obligationFixture(), 125, 3); err == nil {
						t.Fatal("malformed nested envelope accepted")
					}
				}
			}
			for i := 0; i < 2; i++ {
				changed := bytes.Clone(raw)
				copy(changed[i*256:(i+1)*256], raw[(i+1)*256:(i+2)*256])
				copy(changed[(i+1)*256:(i+2)*256], raw[i*256:(i+1)*256])
				if err := validateLaneEnvelope(changed, lane, first, obligationFixture(), 125, 3); err == nil {
					t.Fatal("reordered records accepted")
				}
			}
		}
		for _, count := range []int{2, 3} {
			raw := laneEnvelopeFixture(t, lane, count, ^uint64(0))
			if err := validateLaneEnvelope(raw, lane, ^uint64(0), obligationFixture(), 125, 3); err == nil {
				t.Fatal("wrapped sequence accepted")
			}
		}
		if err := validateLaneEnvelope(laneEnvelopeFixture(t, lane, 1, ^uint64(0)), lane, ^uint64(0), obligationFixture(), 125, 3); err != nil {
			t.Fatal("single max sequence refused")
		}
	}
}

func TestLaneEnvelopeControlTickOrderAndIndependence(t *testing.T) {
	for _, lane := range []byte{1, 2, 3} {
		raw := laneEnvelopeFixture(t, lane, 3, 0)
		for i := 0; i < 3; i++ {
			binary.BigEndian.PutUint64(raw[i*256+16:i*256+24], 10)
		}
		if err := validateLaneEnvelope(raw, lane, 0, obligationFixture(), 125, 3); err != nil {
			t.Fatal("equal ticks refused")
		}
		for _, index := range []int{1, 2} {
			changed := bytes.Clone(raw)
			binary.BigEndian.PutUint64(changed[index*256+16:index*256+24], 9)
			err := validateLaneEnvelope(changed, lane, 0, obligationFixture(), 125, 3)
			if lane == 1 && err == nil {
				t.Fatal("control tick regression accepted")
			}
			if lane != 1 && err != nil {
				t.Fatal("independent observation lane imposed control watermark")
			}
		}
	}
	// No call can carry a watermark into another lane or subsequent invocation.
	worker := laneEnvelopeFixture(t, 2, 1, 0)
	binary.BigEndian.PutUint64(worker[16:24], ^uint64(0))
	if err := validateLaneEnvelope(worker, 2, 0, obligationFixture(), 125, 3); err != nil {
		t.Fatal(err)
	}
	if err := validateLaneEnvelope(laneEnvelopeFixture(t, 1, 1, 0), 1, 0, obligationFixture(), 125, 3); err != nil {
		t.Fatal("worker advanced control watermark")
	}
}

// These byte-offset cases independently transcribe the accepted packet field
// matrix. They do not use the implementation's masks or a production encoder.
func eventFieldCases() []struct {
	kind   uint16
	lane   byte // zero means all three writers for lane-local trace faults
	fields []int
} {
	return []struct {
		kind   uint16
		lane   byte
		fields []int
	}{
		{1, 1, nil}, {2, 1, []int{24}},
		{3, 1, []int{72, 88, 96, 214}},
		{4, 1, []int{72, 88, 96, 164, 168, 214}},
		{5, 2, []int{72, 88, 96, 180, 182, 214}},
		{6, 2, []int{72, 88, 96, 164, 168, 180, 182, 214}},
		{7, 1, []int{72, 88, 96, 180, 182, 214}},
		{8, 1, []int{72, 88, 96, 180, 181, 182, 214}},
		{9, 1, nil}, {10, 1, []int{160, 164, 168}},
		{11, 1, []int{128, 160}}, {12, 1, nil}, {13, 1, nil}, {14, 1, nil},
		{15, 1, []int{164, 168}}, {16, 1, []int{24}}, {17, 1, []int{24}},
		{18, 1, nil}, {19, 1, []int{24}},
		{20, 1, []int{128, 160}}, {21, 1, []int{128, 160}},
		{22, 1, []int{128, 160, 164, 168}}, {23, 1, []int{128, 160}},
		{24, 1, []int{128, 160, 164, 168, 176}}, {25, 1, []int{128, 160}},
		{26, 2, []int{72, 88, 96, 172, 214}},
		{27, 2, []int{72, 88, 96, 180, 214}}, {28, 0, nil}, {29, 3, nil},
	}
}

func eventFieldsFixture(t *testing.T, kind uint16) []byte {
	t.Helper()
	raw := make([]byte, 256)
	copy(raw[:5], []byte{'C', '5', 'E', 'V', 1})
	binary.BigEndian.PutUint16(raw[6:8], kind)
	binary.BigEndian.PutUint64(raw[8:16], 7)
	binary.BigEndian.PutUint32(raw[32:36], 125)
	binary.BigEndian.PutUint32(raw[36:40], 3)
	copy(raw[40:72], wireBytes(t, eventBindingDigestVector))
	for _, tc := range eventFieldCases() {
		if tc.kind != kind {
			continue
		}
		raw[5] = tc.lane
		if raw[5] == 0 {
			raw[5] = 1
		}
		for _, offset := range tc.fields {
			switch offset {
			case 24, 88:
				binary.BigEndian.PutUint64(raw[offset:offset+8], 1)
			case 72:
				copy(raw[72:88], bytes.Repeat([]byte{11}, 16))
			case 96, 128, 182, 214:
				copy(raw[offset:offset+32], bytes.Repeat([]byte{byte(offset)}, 32))
			case 160:
				binary.BigEndian.PutUint32(raw[160:164], 41)
			case 164:
				binary.BigEndian.PutUint32(raw[164:168], ^uint32(0))
			case 168:
				binary.BigEndian.PutUint32(raw[168:172], 22)
			case 172, 176:
				binary.BigEndian.PutUint32(raw[offset:offset+4], 2)
			case 180, 181:
				raw[offset] = 1
			default:
				t.Fatalf("unknown test offset %d", offset)
			}
		}
		if kind == 24 {
			binary.BigEndian.PutUint32(raw[164:168], 41)
		}
		return raw
	}
	t.Fatalf("unknown test kind %d", kind)
	return nil
}

func requireEventFieldsRefused(t *testing.T, raw []byte) {
	t.Helper()
	got, err := decodeEventFields(raw, obligationFixture(), 125, 3)
	if err == nil || got != (eventEnvelope{}) {
		t.Fatalf("invalid event fields returned %+v, %v", got, err)
	}
}

func TestEventFieldsAllKindsAndLanes(t *testing.T) {
	for _, tc := range eventFieldCases() {
		for lane := byte(1); lane <= 3; lane++ {
			t.Run(fmt.Sprintf("kind%d/lane%d", tc.kind, lane), func(t *testing.T) {
				raw := eventFieldsFixture(t, tc.kind)
				raw[5] = lane
				if tc.lane != 0 && lane != tc.lane {
					requireEventFieldsRefused(t, raw)
					return
				}
				before := bytes.Clone(raw)
				got, err := decodeEventFields(raw, obligationFixture(), 125, 3)
				want, envelopeErr := decodeEventEnvelope(raw, obligationFixture(), 125, 3)
				if err != nil || envelopeErr != nil || got != want {
					t.Fatalf("supported local shape refused or changed: %+v %v", got, err)
				}
				if !bytes.Equal(raw, before) {
					t.Fatal("field decoder changed input")
				}
			})
		}
	}
}

func TestEventFieldsEveryForbiddenField(t *testing.T) {
	fields := []struct{ offset, size int }{
		{24, 8}, {72, 16}, {88, 8}, {96, 32}, {128, 32}, {160, 4}, {164, 4},
		{168, 4}, {172, 4}, {176, 4}, {180, 1}, {181, 1}, {182, 32}, {214, 32},
	}
	for _, tc := range eventFieldCases() {
		for _, field := range fields {
			allowed := false
			for _, offset := range tc.fields {
				if field.offset == offset {
					allowed = true
				}
			}
			if allowed {
				continue
			}
			t.Run(fmt.Sprintf("kind%d/offset%d", tc.kind, field.offset), func(t *testing.T) {
				raw := eventFieldsFixture(t, tc.kind)
				raw[field.offset+field.size-1] = 1
				requireEventFieldsRefused(t, raw)
			})
		}
	}
}

func TestEventFieldsRequiredTupleAndIdentity(t *testing.T) {
	for _, kind := range []uint16{3, 4, 5, 6, 7, 8, 26, 27} {
		for _, field := range [][2]int{{72, 16}, {88, 8}, {96, 32}, {214, 32}} {
			raw := eventFieldsFixture(t, kind)
			clear(raw[field[0] : field[0]+field[1]])
			t.Run(fmt.Sprintf("kind%d/missing%d", kind, field[0]), func(t *testing.T) { requireEventFieldsRefused(t, raw) })
		}
		for _, generation := range []uint64{1, 1<<53 - 1} {
			raw := eventFieldsFixture(t, kind)
			binary.BigEndian.PutUint64(raw[88:96], generation)
			if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
				t.Fatal("valid generation boundary refused", kind, generation, err)
			}
		}
		for _, generation := range []uint64{0, 1 << 53, ^uint64(0)} {
			raw := eventFieldsFixture(t, kind)
			binary.BigEndian.PutUint64(raw[88:96], generation)
			requireEventFieldsRefused(t, raw)
		}
	}
	for _, kind := range []uint16{11, 20, 21, 22, 23, 24, 25} {
		raw := eventFieldsFixture(t, kind)
		clear(raw[128:160])
		requireEventFieldsRefused(t, raw)
		for _, pid := range []uint32{0, 1 << 31, ^uint32(0)} {
			raw := eventFieldsFixture(t, kind)
			binary.BigEndian.PutUint32(raw[160:164], pid)
			// Keep the wait return matched so this tests the PID guard alone.
			if kind == 24 {
				binary.BigEndian.PutUint32(raw[164:168], pid)
			}
			requireEventFieldsRefused(t, raw)
		}
		for _, pid := range []uint32{1, 1<<31 - 1} {
			raw := eventFieldsFixture(t, kind)
			binary.BigEndian.PutUint32(raw[160:164], pid)
			if kind == 24 {
				binary.BigEndian.PutUint32(raw[164:168], pid)
			}
			if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
				t.Fatal("valid PID boundary refused", kind, pid, err)
			}
		}
	}
}

func TestEventFieldsReplyOutcomesAndDecisions(t *testing.T) {
	for _, kind := range []uint16{5, 6, 7, 8} {
		decisions := []byte{0}
		if kind == 8 {
			decisions = []byte{1, 2}
		}
		for _, decision := range decisions {
			for _, outcome := range []byte{1, 2, 3} {
				raw := eventFieldsFixture(t, kind)
				raw[180] = outcome
				raw[181] = decision
				if outcome != 1 {
					clear(raw[182:214])
				}
				if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
					t.Fatal("represented reply refused", kind, outcome, decision, err)
				}
				if outcome == 1 {
					clear(raw[182:214])
				} else {
					raw[182] = 1
				}
				t.Run(fmt.Sprintf("kind%d/outcome%d/decision%d", kind, outcome, decision), func(t *testing.T) { requireEventFieldsRefused(t, raw) })
			}
			for _, outcome := range []byte{0, 4, 255} {
				raw := eventFieldsFixture(t, kind)
				raw[180] = outcome
				raw[181] = decision
				clear(raw[182:214])
				requireEventFieldsRefused(t, raw)
			}
		}
	}
	for _, decision := range []byte{0, 3, 255} {
		raw := eventFieldsFixture(t, 8)
		raw[181] = decision
		requireEventFieldsRefused(t, raw)
	}
}

func TestEventFieldsStoreSitesAndOutcome(t *testing.T) {
	for _, site := range []uint32{1, 2, 3, 4} {
		raw := eventFieldsFixture(t, 26)
		binary.BigEndian.PutUint32(raw[172:176], site)
		if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
			t.Fatal("frozen store site refused", site, err)
		}
	}
	for _, site := range []uint32{0, 5, ^uint32(0)} {
		raw := eventFieldsFixture(t, 26)
		binary.BigEndian.PutUint32(raw[172:176], site)
		requireEventFieldsRefused(t, raw)
	}
	for _, outcome := range []byte{1, 2, 3} {
		raw := eventFieldsFixture(t, 27)
		raw[180] = outcome
		if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
			t.Fatal("store outcome with zero record digest refused", outcome, err)
		}
		raw[182] = 1
		requireEventFieldsRefused(t, raw)
	}
	for _, outcome := range []byte{0, 4, 255} {
		raw := eventFieldsFixture(t, 27)
		raw[180] = outcome
		requireEventFieldsRefused(t, raw)
	}
}

func TestEventFieldsWaitAndSpawnLocalShapeOnly(t *testing.T) {
	for _, status := range []uint32{0, 1, 0xffff} {
		raw := eventFieldsFixture(t, 24)
		binary.BigEndian.PutUint32(raw[176:180], status)
		if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
			t.Fatal("matching wait shape refused", status, err)
		}
		for _, result := range []uint32{0, ^uint32(0), 42} {
			binary.BigEndian.PutUint32(raw[164:168], result)
			if status != 0 {
				requireEventFieldsRefused(t, raw)
			} else if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
				t.Fatal("zero status observation refused", result, err)
			}
		}
	}
	for _, pid := range []uint32{0, 1, 1<<31 - 1} {
		for _, result := range []uint32{0, 17, ^uint32(0)} {
			raw := eventFieldsFixture(t, 10)
			binary.BigEndian.PutUint32(raw[160:164], pid)
			binary.BigEndian.PutUint32(raw[164:168], result)
			binary.BigEndian.PutUint32(raw[168:172], 1<<31)
			if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
				t.Fatal("named spawn observations refused", pid, result, err)
			}
		}
	}
	for _, pid := range []uint32{1 << 31, ^uint32(0)} {
		raw := eventFieldsFixture(t, 10)
		binary.BigEndian.PutUint32(raw[160:164], pid)
		requireEventFieldsRefused(t, raw)
	}
	// All-zero scalar observations are representable, not inferred successes.
	for _, kind := range []uint16{2, 4, 6, 10, 15, 16, 17, 19, 22, 24} {
		raw := eventFieldsFixture(t, kind)
		clear(raw[24:32])
		clear(raw[164:172])
		clear(raw[176:180])
		if _, err := decodeEventFields(raw, obligationFixture(), 125, 3); err != nil {
			t.Fatal("zero scalar observations refused", kind, err)
		}
	}
}

func TestEventFieldsEnvelopeRefusalOwnershipAndLimits(t *testing.T) {
	base := eventFieldsFixture(t, 8)
	for _, offset := range []int{0, 4, 5, 6, 32, 40, 246} {
		raw := bytes.Clone(base)
		raw[offset] ^= 0xff
		requireEventFieldsRefused(t, raw)
	}
	for _, raw := range [][]byte{nil, base[:255], append(bytes.Clone(base), 0)} {
		requireEventFieldsRefused(t, raw)
	}
	for _, tc := range []struct {
		frozen       obligationBindings
		numer, denom uint32
	}{{obligationBindings{}, 125, 3}, {obligationFixture(), 0, 3}, {obligationFixture(), 125, 0}, {obligationFixture(), 126, 3}} {
		got, err := decodeEventFields(base, tc.frozen, tc.numer, tc.denom)
		if err == nil || got != (eventEnvelope{}) {
			t.Fatal("wrapper skipped frozen envelope validation")
		}
	}
	got, err := decodeEventFields(base, obligationFixture(), 125, 3)
	if err != nil {
		t.Fatal(err)
	}
	before := bytes.Clone(base)
	got.Operation[0] ^= 1
	got.CandidateDigest[0] ^= 1
	if !bytes.Equal(base, before) {
		t.Fatal("result aliases raw frame")
	}
	copyOfValue := got
	clear(base)
	if got != copyOfValue {
		t.Fatal("raw frame aliases result")
	}
	// This single-record API can accept an absence shape without a prior wait.
	// It supplies no proof of custody, prior wait, terminality or actual absence.
	if _, err := decodeEventFields(eventFieldsFixture(t, 25), obligationFixture(), 125, 3); err != nil {
		t.Fatal(err)
	}
	// G3a4 remains broad syntax; callers must explicitly choose field validation.
	raw := wireBytes(t, eventEnvelopeVector)
	if _, err := decodeEventEnvelope(raw, obligationFixture(), 125, 3); err != nil {
		t.Fatal("G3a4 contract changed")
	}
	requireEventFieldsRefused(t, raw)
}

// Sidecar fixtures transcribe packet offsets and use the existing independent
// request/reply vectors; they do not call the correspondence implementation.
func capturedPairFixture(t *testing.T, kind uint16, request []byte, outcome byte) capturedFramePair {
	t.Helper()
	event := eventFieldsFixture(t, kind)
	copy(event[72:88], request[280:296])
	copy(event[88:96], request[296:304])
	requestHash := sha256.Sum256(request[8:])
	candidateHash := sha256.Sum256(request[305:373])
	copy(event[96:128], requestHash[:])
	copy(event[214:246], candidateHash[:])
	pair := capturedFramePair{Event: event, Request: bytes.Clone(request)}
	if kind != 3 {
		pair.Reply = replyFromRequest(request, outcome)
		event[180] = outcome
		copy(event[182:214], pair.Reply[66:98])
	}
	return pair
}

func requireCapturedPairRefused(t *testing.T, pair capturedFramePair) {
	t.Helper()
	if err := validateCapturedFrame(pair, obligationFixture(), 125, 3); err == nil {
		t.Fatal("invalid captured pair accepted")
	}
}

func TestCapturedFrameKindsOutcomesAndSelection(t *testing.T) {
	for _, op := range []struct {
		kind        byte
		runner      bool
		disposition byte
	}{
		{1, false, 0}, {2, true, 0}, {3, true, 1}, {3, false, 1}, {3, true, 2}, {3, false, 2},
	} {
		for _, eventKind := range []uint16{3, 5, 7} {
			for _, outcome := range []byte{1, 2, 3} {
				pair := capturedPairFixture(t, eventKind, operationRequest(t, op.kind, op.runner, op.disposition), outcome)
				if err := validateCapturedFrame(pair, obligationFixture(), 125, 3); err != nil {
					t.Fatal(op, eventKind, outcome, err)
				}
				if err := validateCapturedFrames([]capturedFramePair{pair}, obligationFixture(), 125, 3); err != nil {
					t.Fatal("partial selection refused", err)
				}
			}
		}
	}
	// Empty means no represented correspondence, never a complete trace verdict.
	if err := validateCapturedFrames(nil, obligationFixture(), 125, 3); err != nil {
		t.Fatal(err)
	}
}

func TestCapturedFrameEventCorrespondence(t *testing.T) {
	for _, kind := range []uint16{3, 5, 7} {
		for _, offset := range []int{72, 95, 96, 214} {
			t.Run(fmt.Sprintf("kind%d/offset%d", kind, offset), func(t *testing.T) {
				pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
				pair.Event[offset] ^= 1
				requireCapturedPairRefused(t, pair)
			})
		}
		pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
		wholeHash := sha256.Sum256(pair.Request)
		copy(pair.Event[96:128], wholeHash[:])
		requireCapturedPairRefused(t, pair)
	}
	for _, kind := range []uint16{5, 7} {
		pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 2)
		pair.Event[180] = 3 // Both values are well-formed, but do not correspond.
		requireCapturedPairRefused(t, pair)
		pair = capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
		pair.Event[182] ^= 1
		requireCapturedPairRefused(t, pair)
	}
}

func TestCapturedFrameRawBytesAndLengths(t *testing.T) {
	for _, kind := range []uint16{3, 5, 7} {
		for _, offset := range []int{0, 5, 7, 8, 248, 280, 303, 304, 305, 396} {
			pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
			pair.Request[offset] ^= 1
			t.Run(fmt.Sprintf("request/kind%d/offset%d", kind, offset), func(t *testing.T) { requireCapturedPairRefused(t, pair) })
		}
		// A structurally valid changed candidate still fails the stale event hash.
		pair := capturedPairFixture(t, kind, operationRequest(t, 2, true, 0), 1)
		pair.Request[307] ^= 1
		if kind != 3 {
			pair.Reply = replyFromRequest(pair.Request, 1)
			copy(pair.Event[182:214], pair.Reply[66:98])
			copy(pair.Event[96:128], pair.Reply[33:65])
		}
		requireCapturedPairRefused(t, pair)
		for _, member := range []string{"event", "request", "reply"} {
			if kind == 3 && member == "reply" {
				continue
			}
			for _, length := range []int{0, -1, 1} {
				pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
				var raw *[]byte
				switch member {
				case "event":
					raw = &pair.Event
				case "request":
					raw = &pair.Request
				case "reply":
					raw = &pair.Reply
				}
				if length == 0 {
					*raw = nil
				} else if length < 0 {
					*raw = (*raw)[:len(*raw)-1]
				} else {
					*raw = append(*raw, 0)
				}
				t.Run(fmt.Sprintf("kind%d/%s/length%d", kind, member, length), func(t *testing.T) { requireCapturedPairRefused(t, pair) })
			}
		}
	}
	for _, kind := range []uint16{5, 7} {
		for _, offset := range []int{0, 4, 5, 7, 8, 31, 32, 33, 65, 66} {
			pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 1)
			pair.Reply[offset] ^= 1
			t.Run(fmt.Sprintf("reply/kind%d/offset%d", kind, offset), func(t *testing.T) { requireCapturedPairRefused(t, pair) })
		}
		pair := capturedPairFixture(t, kind, wireBytes(t, requestVector), 2)
		pair.Reply[66] = 1
		requireCapturedPairRefused(t, pair)
	}
	pair := capturedPairFixture(t, 3, wireBytes(t, requestVector), 1)
	pair.Reply = wireBytes(t, replyVector)
	requireCapturedPairRefused(t, pair)
}

func TestCapturedFrameRejectsUnsupportedEventsAndContext(t *testing.T) {
	// A fully matching applied-reply shape is still outside the capture API.
	applied := capturedPairFixture(t, 7, wireBytes(t, requestVector), 1)
	binary.BigEndian.PutUint16(applied.Event[6:8], 8)
	applied.Event[181] = 1
	requireCapturedPairRefused(t, applied)
	for kind := uint16(1); kind <= 29; kind++ {
		if kind == 3 || kind == 5 || kind == 7 {
			continue
		}
		pair := capturedFramePair{Event: eventFieldsFixture(t, kind), Request: wireBytes(t, requestVector)}
		if kind == 6 || kind == 8 {
			pair.Reply = wireBytes(t, replyVector)
		}
		requireCapturedPairRefused(t, pair)
	}
	for _, offset := range []int{0, 4, 5, 32, 40, 246} {
		pair := capturedPairFixture(t, 5, wireBytes(t, requestVector), 1)
		pair.Event[offset] ^= 1
		requireCapturedPairRefused(t, pair)
	}
	for _, context := range []struct {
		bindings     obligationBindings
		numer, denom uint32
	}{
		{obligationBindings{}, 125, 3}, {obligationFixture(), 0, 3}, {obligationFixture(), 125, 0}, {obligationFixture(), 126, 3},
	} {
		pair := capturedPairFixture(t, 3, wireBytes(t, requestVector), 1)
		if err := validateCapturedFrame(pair, context.bindings, context.numer, context.denom); err == nil {
			t.Fatal("bad pair context accepted")
		}
		if context.numer == 126 {
			continue
		} // No event in an empty selection fixes a timebase value.
		if err := validateCapturedFrames(nil, context.bindings, context.numer, context.denom); err == nil {
			t.Fatal("invalid empty selection context accepted")
		}
	}
}

func TestCapturedFramesCapsAndDuplicates(t *testing.T) {
	requests := [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, true, 1)}
	requests[2][280] = 13
	binary.BigEndian.PutUint64(requests[2][296:304], 3)
	var pairs []capturedFramePair
	for _, request := range requests {
		for _, kind := range []uint16{3, 5, 7} {
			pairs = append(pairs, capturedPairFixture(t, kind, request, 1))
		}
	}
	if err := validateCapturedFrames(pairs, obligationFixture(), 125, 3); err != nil {
		t.Fatal("nine bounded matching captures refused", err)
	}
	if err := validateCapturedFrames(append(pairs, pairs[0]), obligationFixture(), 125, 3); err == nil {
		t.Fatal("total cap not enforced")
	}
	for _, kind := range []uint16{3, 5, 7} {
		first := capturedPairFixture(t, kind, requests[1], 1)
		secondRequest := bytes.Clone(requests[1])
		binary.BigEndian.PutUint64(secondRequest[296:304], 3)
		for _, second := range []capturedFramePair{first, capturedPairFixture(t, kind, secondRequest, 1)} {
			if err := validateCapturedFrames([]capturedFramePair{first, second}, obligationFixture(), 125, 3); err == nil {
				t.Fatal("duplicate category operation accepted", kind)
			}
		}
		var four []capturedFramePair
		for i := byte(0); i < 4; i++ {
			request := bytes.Clone(requests[1])
			request[280] = 20 + i
			four = append(four, capturedPairFixture(t, kind, request, 1))
		}
		if err := validateCapturedFrames(four, obligationFixture(), 125, 3); err == nil {
			t.Fatal("category cap not enforced", kind)
		}
	}
	// Four distinct anchors spread across categories still exceed one attempt.
	var four []capturedFramePair
	for i, kind := range []uint16{3, 3, 5, 7} {
		request := bytes.Clone(requests[1])
		request[280] = byte(20 + i)
		four = append(four, capturedPairFixture(t, kind, request, 1))
	}
	if err := validateCapturedFrames(four, obligationFixture(), 125, 3); err == nil {
		t.Fatal("request anchor cap not enforced")
	}
	if err := validateCapturedFrames([]capturedFramePair{{}}, obligationFixture(), 125, 3); err == nil {
		t.Fatal("missing pair members accepted")
	}
}

func TestCapturedFramesPeerEquality(t *testing.T) {
	request := operationRequest(t, 2, true, 0)
	for _, kinds := range [][2]uint16{{3, 5}, {3, 7}, {5, 7}} {
		first := capturedPairFixture(t, kinds[0], request, 1)
		changed := bytes.Clone(request)
		changed[307] ^= 1
		second := capturedPairFixture(t, kinds[1], changed, 1)
		if err := validateCapturedFrames([]capturedFramePair{first, second}, obligationFixture(), 125, 3); err == nil {
			t.Fatal("ambiguous request anchors accepted", kinds)
		}
	}
	for _, outcomes := range [][2]byte{{1, 2}, {2, 3}} {
		pairs := []capturedFramePair{capturedPairFixture(t, 5, request, outcomes[0]), capturedPairFixture(t, 7, request, outcomes[1])}
		if err := validateCapturedFrames(pairs, obligationFixture(), 125, 3); err == nil {
			t.Fatal("disagreeing worker/control replies accepted")
		}
	}
	// Cross-lane observations can share a sequence; no order is inferred here.
	pairs := []capturedFramePair{capturedPairFixture(t, 7, request, 2), capturedPairFixture(t, 5, request, 2), capturedPairFixture(t, 3, request, 1)}
	if err := validateCapturedFrames(pairs, obligationFixture(), 125, 3); err != nil {
		t.Fatal("unordered matching selection refused", err)
	}
}

func TestCapturedFramesNoMutationOrImplicitSettlement(t *testing.T) {
	request := wireBytes(t, requestVector)
	pair := capturedPairFixture(t, 7, request, 1)
	history, err := newWriteHistory(obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	if err = history.begin(request); err != nil {
		t.Fatal(err)
	}
	before := history.snapshot()
	for _, valid := range []bool{true, false} {
		if !valid {
			pair.Event[96] ^= 1
		}
		eventBefore, requestBefore, replyBefore := bytes.Clone(pair.Event), bytes.Clone(pair.Request), bytes.Clone(pair.Reply)
		err := validateCapturedFrames([]capturedFramePair{pair}, obligationFixture(), 125, 3)
		if (err == nil) != valid {
			t.Fatal("unexpected correspondence result", err)
		}
		if !bytes.Equal(pair.Event, eventBefore) || !bytes.Equal(pair.Request, requestBefore) || !bytes.Equal(pair.Reply, replyBefore) {
			t.Fatal("correspondence mutated inputs")
		}
		if history.snapshot() != before {
			t.Fatal("correspondence settled history")
		}
	}
	// Local fields stay opt-in and can accept a shape whose sidecar disagrees.
	if _, err := decodeEventFields(pair.Event, obligationFixture(), 125, 3); err != nil {
		t.Fatal("prior field API changed", err)
	}
}

// Application fixtures copy the represented reply tuple, then encode only the
// distinct kind, ordinal and decision fields at packet offsets.
func receivedAppliedFixture(t *testing.T, request []byte, outcome, decision byte, sequence uint64) receivedAppliedPair {
	t.Helper()
	received := capturedPairFixture(t, 7, request, outcome)
	binary.BigEndian.PutUint64(received.Event[8:16], sequence)
	applied := bytes.Clone(received.Event)
	binary.BigEndian.PutUint16(applied[6:8], 8)
	binary.BigEndian.PutUint64(applied[8:16], sequence+1)
	applied[181] = decision
	return receivedAppliedPair{Received: received, Applied: applied}
}

func requireReceivedAppliedRefused(t *testing.T, pair receivedAppliedPair) {
	t.Helper()
	if err := validateReceivedApplied(pair, obligationFixture(), 125, 3); err == nil {
		t.Fatal("invalid received/applied pair accepted")
	}
}

func TestReceivedAppliedShapesOutcomesAndDecisions(t *testing.T) {
	for _, op := range []struct {
		kind        byte
		runner      bool
		disposition byte
	}{{1, false, 0}, {2, true, 0}, {3, true, 1}, {3, false, 1}, {3, true, 2}, {3, false, 2}} {
		for _, outcome := range []byte{1, 2, 3} {
			for _, decision := range []byte{1, 2} {
				pair := receivedAppliedFixture(t, operationRequest(t, op.kind, op.runner, op.disposition), outcome, decision, 0)
				if err := validateReceivedApplied(pair, obligationFixture(), 125, 3); err != nil {
					t.Fatal(op, outcome, decision, err)
				}
				if err := validateReceivedAppliedPairs([]receivedAppliedPair{pair}, obligationFixture(), 125, 3); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	if err := validateReceivedAppliedPairs(nil, obligationFixture(), 125, 3); err != nil {
		t.Fatal("empty selection refused", err)
	}
}

func TestReceivedAppliedExactCorrespondence(t *testing.T) {
	for _, offset := range []int{72, 95, 96, 214, 182} {
		t.Run(fmt.Sprint(offset), func(t *testing.T) {
			pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
			pair.Applied[offset] ^= 1
			requireReceivedAppliedRefused(t, pair)
		})
	}
	pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 2, 2, 7)
	pair.Applied[180] = 3 // Individually valid uncertainty cannot replace the raw outcome.
	requireReceivedAppliedRefused(t, pair)
	for _, decision := range []byte{0, 3, 255} {
		pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
		pair.Applied[181] = decision
		requireReceivedAppliedRefused(t, pair)
	}
}

func TestReceivedAppliedKindsContextAndMembers(t *testing.T) {
	for _, receivedKind := range []uint16{3, 5} {
		pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
		pair.Received = capturedPairFixture(t, receivedKind, pair.Received.Request, 1)
		requireReceivedAppliedRefused(t, pair)
	}
	pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
	binary.BigEndian.PutUint16(pair.Applied[6:8], 7)
	pair.Applied[181] = 0 // A valid received record is not an applied record.
	requireReceivedAppliedRefused(t, pair)
	for _, member := range []string{"received", "applied", "request", "reply"} {
		for _, delta := range []int{0, -1, 1} {
			pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
			var raw *[]byte
			switch member {
			case "received":
				raw = &pair.Received.Event
			case "applied":
				raw = &pair.Applied
			case "request":
				raw = &pair.Received.Request
			case "reply":
				raw = &pair.Received.Reply
			}
			if delta == 0 {
				*raw = nil
			} else if delta < 0 {
				*raw = (*raw)[:len(*raw)-1]
			} else {
				*raw = append(*raw, 0)
			}
			t.Run(fmt.Sprintf("%s/%d", member, delta), func(t *testing.T) { requireReceivedAppliedRefused(t, pair) })
		}
	}
	for _, applied := range []bool{false, true} {
		for _, offset := range []int{0, 5, 32, 40, 172, 246} {
			pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
			raw := pair.Received.Event
			if applied {
				raw = pair.Applied
			}
			raw[offset] ^= 1
			requireReceivedAppliedRefused(t, pair)
		}
	}
	for _, member := range []string{"request", "reply"} {
		pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
		if member == "request" {
			pair.Received.Request[280] ^= 1
		} else {
			pair.Received.Reply[66] ^= 1
		}
		requireReceivedAppliedRefused(t, pair)
	}
	for _, context := range []struct {
		bindings     obligationBindings
		numer, denom uint32
	}{
		{obligationBindings{}, 125, 3}, {obligationFixture(), 0, 3}, {obligationFixture(), 125, 0}, {obligationFixture(), 126, 3},
	} {
		pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
		if err := validateReceivedApplied(pair, context.bindings, context.numer, context.denom); err == nil {
			t.Fatal("bad context accepted")
		}
		if context.numer != 126 && validateReceivedAppliedPairs(nil, context.bindings, context.numer, context.denom) == nil {
			t.Fatal("invalid empty context accepted")
		}
	}
}

func TestReceivedAppliedLocalOrder(t *testing.T) {
	for _, tc := range []struct {
		receivedSeq, appliedSeq, receivedTick, appliedTick uint64
		valid                                              bool
	}{
		{0, 1, 0, 0, true}, {7, 20, 4, 4, true}, {7, 20, 4, 5, true},
		{^uint64(0) - 1, ^uint64(0), ^uint64(0), ^uint64(0), true},
		{7, 7, 4, 4, false}, {8, 7, 4, 4, false}, {7, 8, 5, 4, false},
		{^uint64(0), 0, 0, 0, false},
	} {
		pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 1, 7)
		binary.BigEndian.PutUint64(pair.Received.Event[8:16], tc.receivedSeq)
		binary.BigEndian.PutUint64(pair.Applied[8:16], tc.appliedSeq)
		binary.BigEndian.PutUint64(pair.Received.Event[16:24], tc.receivedTick)
		binary.BigEndian.PutUint64(pair.Applied[16:24], tc.appliedTick)
		if err := validateReceivedApplied(pair, obligationFixture(), 125, 3); (err == nil) != tc.valid {
			t.Fatal(tc, err)
		}
	}
}

func applicationSelectionFixture(t *testing.T, count int) []receivedAppliedPair {
	t.Helper()
	var pairs []receivedAppliedPair
	for i := 0; i < count; i++ {
		request := operationRequest(t, 2, true, 0)
		request[280] = byte(20 + i)
		pairs = append(pairs, receivedAppliedFixture(t, request, 1, 1, uint64(2*i)))
	}
	return pairs
}

func TestReceivedAppliedSelectionCapsAndReuse(t *testing.T) {
	pairs := applicationSelectionFixture(t, 3)
	if err := validateReceivedAppliedPairs(pairs, obligationFixture(), 125, 3); err != nil {
		t.Fatal(err)
	}
	if validateReceivedAppliedPairs(applicationSelectionFixture(t, 4), obligationFixture(), 125, 3) == nil {
		t.Fatal("four pairs accepted")
	}
	if validateReceivedAppliedPairs([]receivedAppliedPair{{}}, obligationFixture(), 125, 3) == nil {
		t.Fatal("missing members accepted")
	}
	for _, differentGeneration := range []bool{false, true} {
		pairs := applicationSelectionFixture(t, 2)
		request := bytes.Clone(pairs[0].Received.Request)
		if differentGeneration {
			binary.BigEndian.PutUint64(request[296:304], 4)
		}
		pairs[1] = receivedAppliedFixture(t, request, 1, 2, 10)
		if validateReceivedAppliedPairs(pairs, obligationFixture(), 125, 3) == nil {
			t.Fatal("reused operation accepted")
		}
	}
	// Every collision role is refused, including received versus applied.
	for _, firstApplied := range []bool{false, true} {
		for _, secondApplied := range []bool{false, true} {
			pairs := applicationSelectionFixture(t, 2)
			first := pairs[0].Received.Event
			if firstApplied {
				first = pairs[0].Applied
			}
			second := pairs[1].Received.Event
			if secondApplied {
				second = pairs[1].Applied
			}
			// Only the chosen endpoints collide; other endpoints stay distinct.
			for i := range pairs {
				binary.BigEndian.PutUint64(pairs[i].Received.Event[8:16], uint64(i))
				binary.BigEndian.PutUint64(pairs[i].Applied[8:16], uint64(20+i))
			}
			binary.BigEndian.PutUint64(first[8:16], 10)
			binary.BigEndian.PutUint64(second[8:16], 10)
			if validateReceivedAppliedPairs(pairs, obligationFixture(), 125, 3) == nil {
				t.Fatal("control ordinal reused", firstApplied, secondApplied)
			}
		}
	}
}

func TestReceivedAppliedSelectionTickOrderAndInputOrder(t *testing.T) {
	for _, reverseInput := range []bool{false, true} {
		pairs := applicationSelectionFixture(t, 2)
		for i := range pairs {
			for _, raw := range [][]byte{pairs[i].Received.Event, pairs[i].Applied} {
				binary.BigEndian.PutUint64(raw[16:24], uint64(i+4))
			}
		}
		if reverseInput {
			pairs[0], pairs[1] = pairs[1], pairs[0]
		}
		if err := validateReceivedAppliedPairs(pairs, obligationFixture(), 125, 3); err != nil {
			t.Fatal("ordered observations refused", err)
		}
		// Each pair stays locally valid, but the later ordinal backdates its tick.
		for _, raw := range [][]byte{pairs[0].Received.Event, pairs[0].Applied} {
			binary.BigEndian.PutUint64(raw[16:24], 9)
		}
		for _, raw := range [][]byte{pairs[1].Received.Event, pairs[1].Applied} {
			binary.BigEndian.PutUint64(raw[16:24], 2)
		}
		if reverseInput {
			for _, raw := range [][]byte{pairs[0].Received.Event, pairs[0].Applied} {
				binary.BigEndian.PutUint64(raw[16:24], 2)
			}
			for _, raw := range [][]byte{pairs[1].Received.Event, pairs[1].Applied} {
				binary.BigEndian.PutUint64(raw[16:24], 9)
			}
		}
		if validateReceivedAppliedPairs(pairs, obligationFixture(), 125, 3) == nil {
			t.Fatal("cross-pair tick regression accepted")
		}
	}
}

func TestReceivedAppliedNonmutationAndOptIn(t *testing.T) {
	pair := receivedAppliedFixture(t, wireBytes(t, requestVector), 1, 2, 7)
	for _, valid := range []bool{true, false} {
		if !valid {
			pair.Applied[96] ^= 1
		}
		before := [][]byte{bytes.Clone(pair.Received.Event), bytes.Clone(pair.Received.Request), bytes.Clone(pair.Received.Reply), bytes.Clone(pair.Applied)}
		err := validateReceivedAppliedPairs([]receivedAppliedPair{pair}, obligationFixture(), 125, 3)
		if (err == nil) != valid {
			t.Fatal(err)
		}
		for i, raw := range [][]byte{pair.Received.Event, pair.Received.Request, pair.Received.Reply, pair.Applied} {
			if !bytes.Equal(raw, before[i]) {
				t.Fatal("input mutated")
			}
		}
	}
	if _, err := decodeEventFields(pair.Applied, obligationFixture(), 125, 3); err != nil {
		t.Fatal("prior field contract changed", err)
	}
	if err := validateCapturedFrame(pair.Received, obligationFixture(), 125, 3); err != nil {
		t.Fatal("prior sidecar contract changed", err)
	}
}

// G3a8 uses only inert, independently encoded request/event fixtures.
func decisionBeginFixture(t *testing.T, request []byte, sequence, tick uint64) capturedFramePair {
	t.Helper()
	pair := capturedPairFixture(t, 3, request, 0)
	binary.BigEndian.PutUint64(pair.Event[8:16], sequence)
	binary.BigEndian.PutUint64(pair.Event[16:24], tick)
	return pair
}

func decisionPairFixture(t *testing.T, request []byte, outcome, decision byte, sequence, tick uint64) receivedAppliedPair {
	t.Helper()
	pair := receivedAppliedFixture(t, request, outcome, decision, sequence)
	binary.BigEndian.PutUint64(pair.Received.Event[16:24], tick)
	binary.BigEndian.PutUint64(pair.Applied[16:24], tick)
	return pair
}

func decisionFixture(t *testing.T) *decisionHistory {
	t.Helper()
	h, err := newDecisionHistory(obligationFixture(), 125, 3)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func requireDecisionRefusal(t *testing.T, h *decisionHistory, action func() error) {
	t.Helper()
	before := *h
	if action() == nil {
		t.Fatal("invalid decision history accepted")
	}
	if *h != before {
		t.Fatal("refusal mutated private state")
	}
}

func TestDecisionHistorySettlements(t *testing.T) {
	for _, outcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(outcome), func(t *testing.T) {
			h := decisionFixture(t)
			prep := wireBytes(t, requestVector)
			runner := operationRequest(t, 2, true, 0)
			terminal := operationRequest(t, 3, outcome == 1, 1)
			terminal[280] = 13
			binary.BigEndian.PutUint64(terminal[296:304], 3)
			for i, request := range [][]byte{prep, runner, terminal} {
				if err := h.begin(decisionBeginFixture(t, request, uint64(i*3), 0)); err != nil {
					t.Fatal(i, err)
				}
				if !h.snapshot().History.Pending {
					t.Fatal("begin did not record pending")
				}
				settledOutcome := byte(1)
				if i == 1 {
					settledOutcome = outcome
				}
				if err := h.reconcile(decisionPairFixture(t, request, settledOutcome, 1, uint64(i*3+1), 0)); err != nil {
					t.Fatal(i, err)
				}
				got := h.snapshot()
				expected := [68]byte(request[305:373])
				if i == 1 && outcome != 1 {
					expected = [68]byte(prep[305:373])
				}
				if got.History.Pending || !got.History.LastSettledPresent || got.History.LastSettled.Outcome != settledOutcome || got.History.Confirmed != expected || got.Fatal || got.Decisions != uint8(i+1) {
					t.Fatalf("wrong settlement: %+v", got)
				}
			}
		})
	}
	// Existing history supports a direct preparation-to-terminal selection.
	h := decisionFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	terminal := operationRequest(t, 3, false, 1)
	if err := h.begin(decisionBeginFixture(t, terminal, 3, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, terminal, 1, 1, 4, 0)); err != nil {
		t.Fatal(err)
	}
}

func TestDecisionHistoryWrongDecisionsAtomic(t *testing.T) {
	prep := wireBytes(t, requestVector)
	h := decisionFixture(t)
	requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, 1, 0, 0)) })
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, 2, 1, 0)) })
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal("refusal consumed ordinal or budget", err)
	}
}

func TestDecisionHistoryMismatchedAnchorsAndLateSettlement(t *testing.T) {
	for _, substitution := range []string{"operation", "generation", "kind", "candidate"} {
		for _, outcome := range []byte{1, 2, 3} {
			t.Run(fmt.Sprint(substitution, outcome), func(t *testing.T) {
				h := decisionFixture(t)
				prep := wireBytes(t, requestVector)
				if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
					t.Fatal(err)
				}
				if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
					t.Fatal(err)
				}
				runner := operationRequest(t, 2, true, 0)
				if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
					t.Fatal(err)
				}
				other := bytes.Clone(runner)
				switch substitution {
				case "operation":
					other[280] ^= 1
				case "generation":
					binary.BigEndian.PutUint64(other[296:304], 3)
				case "kind":
					other = operationRequest(t, 3, false, 1)
				case "candidate":
					other[307] ^= 1
				}
				pair := decisionPairFixture(t, other, 1, 2, 4, 0)
				if err := validateReceivedApplied(pair, obligationFixture(), 125, 3); err != nil {
					t.Fatal("mismatch fixture malformed", err)
				}
				pair.Applied[181] = 1
				requireDecisionRefusal(t, h, func() error { return h.reconcile(pair) })
				pair.Applied[181] = 2
				before := h.history
				if err := h.reconcile(pair); err != nil {
					t.Fatal(err)
				}
				if h.history != before || !h.snapshot().Fatal {
					t.Fatal("rejection changed history or failed to latch fatal")
				}
				requireDecisionRefusal(t, h, func() error { return h.reconcile(pair) })
				if err := h.reconcile(decisionPairFixture(t, runner, outcome, 1, 6, 0)); err != nil {
					t.Fatal(err)
				}
				got := h.snapshot()
				expected := [68]byte(prep[305:373])
				if outcome == 1 {
					expected = [68]byte(runner[305:373])
				}
				if !got.Fatal || got.History.Pending || got.History.Confirmed != expected || got.History.LastSettled.Outcome != outcome {
					t.Fatal("late settlement changed latch or projection", got)
				}
			})
		}
	}
}

func TestDecisionHistoryDuplicateStaleAndHistoryOnlyAfterFatal(t *testing.T) {
	prep := wireBytes(t, requestVector)
	h := decisionFixture(t)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	before := h.history
	requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, 1, 3, 0)) })
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 2, 3, 0)); err != nil {
		t.Fatal(err)
	}
	if h.history != before || !h.snapshot().Fatal {
		t.Fatal("duplicate rejection changed history")
	}
	// This merely records history. It does not admit a real post-fatal submission.
	runner := operationRequest(t, 2, true, 0)
	if err := h.begin(decisionBeginFixture(t, runner, 5, 0)); err != nil {
		t.Fatal("history-only begin after fatal", err)
	}
	before = h.history
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 2, 6, 0)); err != nil {
		t.Fatal(err)
	}
	if h.history != before || !h.snapshot().Fatal {
		t.Fatal("stale rejection changed pending history")
	}
}

func TestDecisionHistoryBoundedRejections(t *testing.T) {
	h := decisionFixture(t)
	prep := wireBytes(t, requestVector)
	for i := uint64(0); i < 3; i++ {
		pair := decisionPairFixture(t, prep, 1, 2, i*2, 0)
		before := h.history
		if err := h.reconcile(pair); err != nil {
			t.Fatal(err)
		}
		if h.history != before || !h.snapshot().Fatal || h.snapshot().Decisions != uint8(i+1) {
			t.Fatal("wrong rejection effect")
		}
	}
	requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, 2, 6, 0)) })
}

func TestDecisionHistoryMalformedAndContext(t *testing.T) {
	for _, context := range []struct {
		bindings     obligationBindings
		numer, denom uint32
	}{{obligationBindings{}, 125, 3}, {obligationFixture(), 0, 3}, {obligationFixture(), 125, 0}} {
		if _, err := newDecisionHistory(context.bindings, context.numer, context.denom); err == nil {
			t.Fatal("invalid constructor context accepted")
		}
	}
	prep := wireBytes(t, requestVector)
	for _, h := range []*decisionHistory{nil, {}} {
		if h.begin(decisionBeginFixture(t, prep, 0, 0)) == nil || h.reconcile(decisionPairFixture(t, prep, 1, 2, 1, 0)) == nil {
			t.Fatal("uninitialized history accepted")
		}
	}
	for _, mutation := range []string{"request", "reply", "received", "applied", "outcome", "record", "decision", "kind", "clock-policy"} {
		h := decisionFixture(t)
		if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
			t.Fatal(err)
		}
		pair := decisionPairFixture(t, prep, 1, 1, 1, 0)
		switch mutation {
		case "clock-policy":
			pair.Received.Request[380] ^= 1
			setWireObligation(pair.Received.Request)
		case "request":
			pair.Received.Request = nil
		case "reply":
			pair.Received.Reply = nil
		case "received":
			pair.Received.Event = nil
		case "applied":
			pair.Applied = nil
		case "outcome":
			pair.Applied[180] = 2
		case "record":
			pair.Received.Reply[66] ^= 1
		case "decision":
			pair.Applied[181] = 0
		case "kind":
			binary.BigEndian.PutUint16(pair.Received.Event[6:8], 5)
		}
		requireDecisionRefusal(t, h, func() error { return h.reconcile(pair) })
		if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
			t.Fatal("bad evidence consumed ordinal", mutation, err)
		}
	}
	h := decisionFixture(t)
	bad := decisionBeginFixture(t, prep, 0, 0)
	bad.Event[96] ^= 1
	requireDecisionRefusal(t, h, func() error { return h.begin(bad) })
	wrongKind := capturedPairFixture(t, 7, prep, 1)
	requireDecisionRefusal(t, h, func() error { return h.begin(wrongKind) })
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, operationRequest(t, 2, true, 0), 1, 0)) })
}

func TestDecisionHistoryCrossCallChronology(t *testing.T) {
	prep := wireBytes(t, requestVector)
	for _, transition := range []string{"begin-receive", "apply-begin", "apply-receive"} {
		for _, backwardsTick := range []bool{false, true} {
			h := decisionFixture(t)
			var watermark uint64
			if transition == "begin-receive" {
				if err := h.begin(decisionBeginFixture(t, prep, 7, 10)); err != nil {
					t.Fatal(err)
				}
				watermark = 7
			} else {
				if err := h.reconcile(decisionPairFixture(t, prep, 1, 2, 6, 10)); err != nil {
					t.Fatal(err)
				}
				watermark = 7
			}
			seq, tick := watermark, uint64(10)
			if backwardsTick {
				seq, tick = watermark+1, 9
			}
			if transition == "apply-begin" {
				requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, prep, seq, tick)) })
				if err := h.begin(decisionBeginFixture(t, prep, 20, 10)); err != nil {
					t.Fatal(err)
				}
			} else {
				decision := byte(2)
				if transition == "begin-receive" {
					decision = 1
				}
				requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, decision, seq, tick)) })
				if err := h.reconcile(decisionPairFixture(t, prep, 1, decision, 20, 10)); err != nil {
					t.Fatal(err)
				}
			}
		}
	}
	h := decisionFixture(t)
	if err := h.begin(decisionBeginFixture(t, prep, ^uint64(0)-2, ^uint64(0))); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, ^uint64(0)-1, ^uint64(0))); err != nil {
		t.Fatal(err)
	}
	requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, operationRequest(t, 2, true, 0), 0, 0)) })
	requireDecisionRefusal(t, h, func() error { return h.reconcile(decisionPairFixture(t, prep, 1, 2, 0, 0)) })
}

func TestDecisionHistoryOwnershipAndBeginRules(t *testing.T) {
	h := decisionFixture(t)
	prep := wireBytes(t, requestVector)
	begin := decisionBeginFixture(t, prep, 0, 0)
	if err := h.begin(begin); err != nil {
		t.Fatal(err)
	}
	before := *h
	for _, raw := range [][]byte{begin.Event, begin.Request} {
		for i := range raw {
			raw[i] ^= 1
		}
	}
	snapshot := h.snapshot()
	snapshot.Fatal = true
	snapshot.History.PendingOperation.Candidate[0] ^= 1
	if *h != before {
		t.Fatal("borrowed begin/snapshot storage")
	}
	pair := decisionPairFixture(t, prep, 1, 1, 1, 0)
	if err := h.reconcile(pair); err != nil {
		t.Fatal(err)
	}
	before = *h
	for _, raw := range [][]byte{pair.Received.Event, pair.Received.Request, pair.Received.Reply, pair.Applied} {
		for i := range raw {
			raw[i] ^= 1
		}
	}
	if *h != before {
		t.Fatal("borrowed pair storage")
	}
	requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, prep, 3, 0)) })
	runner := operationRequest(t, 2, true, 0)
	binary.BigEndian.PutUint64(runner[296:304], 3)
	requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, runner, 3, 0)) })
	binary.BigEndian.PutUint64(runner[296:304], 2)
	if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
		t.Fatal(err)
	}
}

func TestDecisionHistoryTerminalAndInputPreservation(t *testing.T) {
	h := decisionFixture(t)
	requests := [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, true, 1)}
	requests[2][280] = 13
	binary.BigEndian.PutUint64(requests[2][296:304], 3)
	for i, request := range requests {
		if i == 2 {
			reused := bytes.Clone(request)
			copy(reused[280:296], requests[1][280:296])
			requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, reused, 6, 0)) })
		}
		begin := decisionBeginFixture(t, request, uint64(i*3), 0)
		originalEvent, originalRequest := bytes.Clone(begin.Event), bytes.Clone(begin.Request)
		if err := h.begin(begin); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(begin.Event, originalEvent) || !bytes.Equal(begin.Request, originalRequest) {
			t.Fatal("begin mutated input")
		}
		pair := decisionPairFixture(t, request, 1, 1, uint64(i*3+1), 0)
		raw := [][]byte{pair.Received.Event, pair.Received.Request, pair.Received.Reply, pair.Applied}
		copies := make([][]byte, len(raw))
		for j := range raw {
			copies[j] = bytes.Clone(raw[j])
		}
		if err := h.reconcile(pair); err != nil {
			t.Fatal(err)
		}
		for j := range raw {
			if !bytes.Equal(raw[j], copies[j]) {
				t.Fatal("reconcile mutated input")
			}
		}
	}
	terminal := bytes.Clone(requests[2])
	terminal[280] = 14
	binary.BigEndian.PutUint64(terminal[296:304], 4)
	requireDecisionRefusal(t, h, func() error { return h.begin(decisionBeginFixture(t, terminal, 9, 0)) })
}

// G3a9 supplies inert observations, never a filesystem read or final-store verdict.
func snapshotFixture(t *testing.T) *snapshotHistory {
	t.Helper()
	h, err := newSnapshotHistory(obligationFixture(), 125, 3)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func inspectSnapshot(t *testing.T, h *snapshotHistory, present bool, record []byte, worker *capturedFramePair) snapshotCorrespondence {
	t.Helper()
	before := *h
	got, err := h.inspect(present, record, worker)
	if err != nil {
		t.Fatal(err)
	}
	if *h != before {
		t.Fatal("snapshot query mutated private history")
	}
	return got
}

func refuseSnapshot(t *testing.T, h *snapshotHistory, present bool, record []byte, worker *capturedFramePair) {
	t.Helper()
	before := *h
	if _, err := h.inspect(present, record, worker); err == nil {
		t.Fatal("invalid snapshot correspondence accepted")
	}
	if *h != before {
		t.Fatal("snapshot refusal mutated private history")
	}
}

func TestSnapshotContextAndExplicitAbsence(t *testing.T) {
	for _, fraction := range [][2]uint32{{0, 3}, {125, 0}} {
		if _, err := newSnapshotHistory(obligationFixture(), fraction[0], fraction[1]); err == nil {
			t.Fatal("invalid snapshot timebase accepted")
		}
	}
	bad := obligationFixture()
	bad.Preparation = [16]byte{}
	if _, err := newSnapshotHistory(bad, 125, 3); err == nil {
		t.Fatal("invalid snapshot binding accepted")
	}
	for _, h := range []*snapshotHistory{nil, {}} {
		if _, err := h.inspect(false, nil, nil); err == nil {
			t.Fatal("uninitialized snapshot query accepted")
		}
		if h.begin(capturedFramePair{}) == nil || h.reconcile(receivedAppliedPair{}) == nil {
			t.Fatal("uninitialized snapshot transition accepted")
		}
	}
	h := snapshotFixture(t)
	if got := inspectSnapshot(t, h, false, nil, nil); got != (snapshotCorrespondence{History: h.history.snapshot()}) {
		t.Fatal("absence fabricated correspondence", got)
	}
	prep := wireBytes(t, requestVector)
	worker := capturedPairFixture(t, 5, prep, 1)
	refuseSnapshot(t, h, false, []byte{0}, nil)
	refuseSnapshot(t, h, false, nil, &worker)
	refuseSnapshot(t, h, true, nil, nil)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if !inspectSnapshot(t, h, false, nil, nil).History.History.Pending {
		t.Fatal("absence erased pending")
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	got := inspectSnapshot(t, h, false, []byte{}, nil)
	if got.Present || got.AcceptedOutcome != 0 || got.WorkerPresent || got.WorkerOutcome != 0 || got.Operation != (wireOperation{}) || got.LaterSubmitted || got.History.History.Confirmed != ([68]byte{1}) {
		t.Fatal("absence erased historical confirmation or fabricated a match", got)
	}
}

func TestSnapshotPendingWorkerEvidenceDoesNotSettle(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	record := wireBytes(t, recordVector)
	got := inspectSnapshot(t, h, true, record, nil)
	if !got.Present || got.AcceptedOutcome != 0 || got.WorkerPresent || got.WorkerOutcome != 0 || got.LaterSubmitted || got.Operation.Generation != 1 || got.Operation.Operation != obligationFixture().Preparation || got.Operation.Candidate != ([68]byte{1}) {
		t.Fatal("wrong pending record facts", got)
	}
	for _, outcome := range []byte{1, 2, 3} {
		worker := capturedPairFixture(t, 5, prep, outcome)
		got := inspectSnapshot(t, h, true, record, &worker)
		if !got.WorkerPresent || got.WorkerOutcome != outcome || got.AcceptedOutcome != 0 || !got.History.History.Pending || got.History.History.LastSettledPresent || got.History.History.Confirmed != ([68]byte{}) {
			t.Fatal("worker or record presence promoted settlement", got)
		}
	}
}

func TestSnapshotAcceptedOutcomesRemainSeparate(t *testing.T) {
	for _, outcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(outcome), func(t *testing.T) {
			h := snapshotFixture(t)
			prep := wireBytes(t, requestVector)
			if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
				t.Fatal(err)
			}
			if err := h.reconcile(decisionPairFixture(t, prep, outcome, 1, 1, 0)); err != nil {
				t.Fatal(err)
			}
			for _, supplied := range []bool{false, true} {
				var worker *capturedFramePair
				if supplied {
					pair := capturedPairFixture(t, 5, prep, outcome)
					worker = &pair
				}
				got := inspectSnapshot(t, h, true, recordFromRequest(prep), worker)
				wantProjection := [68]byte{}
				if outcome == 1 {
					wantProjection[0] = 1
				}
				if got.AcceptedOutcome != outcome || got.WorkerPresent != supplied || got.History.History.Pending || got.History.History.Confirmed != wantProjection || (!supplied && got.WorkerOutcome != 0) || (supplied && got.WorkerOutcome != outcome) {
					t.Fatal("accepted outcome/worker evidence conflated", got)
				}
			}
			for _, contrary := range []byte{1, 2, 3} {
				if contrary == outcome {
					continue
				}
				t.Run(fmt.Sprint("worker", contrary), func(t *testing.T) {
					worker := capturedPairFixture(t, 5, prep, contrary)
					if err := validateCapturedFrame(worker, obligationFixture(), 125, 3); err != nil {
						t.Fatal("contradiction fixture malformed", err)
					}
					refuseSnapshot(t, h, true, recordFromRequest(prep), &worker)
				})
			}
		})
	}
}

func TestSnapshotHistoricalCandidatesDoNotRewriteProjection(t *testing.T) {
	for _, runnerOutcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(runnerOutcome), func(t *testing.T) {
			h := snapshotFixture(t)
			prep := wireBytes(t, requestVector)
			runner := operationRequest(t, 2, true, 0)
			terminal := operationRequest(t, 3, runnerOutcome == 1, 1)
			terminal[280] = 13
			binary.BigEndian.PutUint64(terminal[296:304], 3)
			requests := [][]byte{prep, runner, terminal}
			for i, request := range requests {
				if err := h.begin(decisionBeginFixture(t, request, uint64(i*3), 0)); err != nil {
					t.Fatal(err)
				}
				for j := 0; j <= i; j++ {
					got := inspectSnapshot(t, h, true, recordFromRequest(requests[j]), nil)
					if got.LaterSubmitted != (j < i) || (j == i && got.AcceptedOutcome != 0) || got.Operation.Candidate != [68]byte(requests[j][305:373]) {
						t.Fatal("wrong submission-order relation", i, j, got)
					}
				}
				outcome := byte(1)
				if i == 1 {
					outcome = runnerOutcome
				}
				if err := h.reconcile(decisionPairFixture(t, request, outcome, 1, uint64(i*3+1), 0)); err != nil {
					t.Fatal(err)
				}
				wantProjection := [68]byte(request[305:373])
				if i == 1 && runnerOutcome != 1 {
					wantProjection = [68]byte{1}
				}
				for j := 0; j <= i; j++ {
					got := inspectSnapshot(t, h, true, recordFromRequest(requests[j]), nil)
					wantOutcome := byte(1)
					if j == 1 {
						wantOutcome = runnerOutcome
					}
					if got.AcceptedOutcome != wantOutcome || got.LaterSubmitted != (j < i) || got.History.History.Confirmed != wantProjection {
						t.Fatal("historical snapshot rewrote projection or outcome", got)
					}
				}
			}
		})
	}
	// Direct preparation-to-terminal is an existing inert history shape.
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	for i, request := range [][]byte{prep, operationRequest(t, 3, false, 1)} {
		if err := h.begin(decisionBeginFixture(t, request, uint64(i*3), 0)); err != nil {
			t.Fatal(err)
		}
		if err := h.reconcile(decisionPairFixture(t, request, 1, 1, uint64(i*3+1), 0)); err != nil {
			t.Fatal(err)
		}
		if got := inspectSnapshot(t, h, true, recordFromRequest(request), nil); got.AcceptedOutcome != 1 {
			t.Fatal("direct terminal correspondence missing")
		}
	}
}

func TestSnapshotMembershipAndRejectedAnchors(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	refuseSnapshot(t, h, true, recordFromRequest(prep), nil)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	runner := operationRequest(t, 2, true, 0)
	if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"operation", "generation", "candidate", "kind"} {
		t.Run(field, func(t *testing.T) {
			other := bytes.Clone(runner)
			switch field {
			case "operation":
				other[280] ^= 1
			case "generation":
				binary.BigEndian.PutUint64(other[296:304], 3)
			case "candidate":
				other[307] ^= 1
			case "kind":
				other = operationRequest(t, 3, false, 1)
			}
			record := recordFromRequest(other)
			if _, err := decodeRecord(record, obligationFixture()); err != nil {
				t.Fatal("unsubmitted record fixture malformed", err)
			}
			refuseSnapshot(t, h, true, record, nil)
		})
	}
	other := bytes.Clone(runner)
	other[280] ^= 1
	if err := h.reconcile(decisionPairFixture(t, other, 1, 2, 4, 0)); err != nil {
		t.Fatal(err)
	}
	refuseSnapshot(t, h, true, recordFromRequest(other), nil)
	got := inspectSnapshot(t, h, true, recordFromRequest(runner), nil)
	if !got.History.Fatal || got.AcceptedOutcome != 0 || !got.History.History.Pending {
		t.Fatal("rejected anchor created accepted evidence", got)
	}
	if err := h.reconcile(decisionPairFixture(t, runner, 1, 1, 6, 0)); err != nil {
		t.Fatal(err)
	}
	if got := inspectSnapshot(t, h, true, recordFromRequest(runner), nil); !got.History.Fatal || got.AcceptedOutcome != 1 {
		t.Fatal("late correspondence cleared fatal or lost outcome", got)
	}
}

func TestSnapshotWorkerLinkageAndMalformedEvidence(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	record := recordFromRequest(prep)
	for _, kind := range []uint16{3, 7} {
		t.Run(fmt.Sprint("kind", kind), func(t *testing.T) {
			worker := capturedPairFixture(t, kind, prep, 1)
			if kind == 3 {
				worker.Reply = nil
			}
			refuseSnapshot(t, h, true, record, &worker)
		})
	}
	other := bytes.Clone(prep)
	binary.BigEndian.PutUint64(other[296:304], 2)
	worker := capturedPairFixture(t, 5, other, 1)
	if err := validateCapturedFrame(worker, obligationFixture(), 125, 3); err != nil {
		t.Fatal("wrong worker fixture malformed", err)
	}
	refuseSnapshot(t, h, true, record, &worker)
	for _, field := range []string{"event", "request", "reply", "outcome", "digest", "lane"} {
		worker := capturedPairFixture(t, 5, prep, 1)
		switch field {
		case "event":
			worker.Event = worker.Event[:255]
		case "request":
			worker.Request[280] ^= 1
		case "reply":
			worker.Reply = append(worker.Reply, 0)
		case "outcome":
			worker.Reply[65] = 2
		case "digest":
			worker.Reply[66] ^= 1
		case "lane":
			worker.Event[5] = 1
		}
		refuseSnapshot(t, h, true, record, &worker)
	}
	for i := range record {
		changed := bytes.Clone(record)
		changed[i] ^= 0x80
		refuseSnapshot(t, h, true, changed, nil)
	}
	for _, malformed := range [][]byte{record[:394], append(bytes.Clone(record), 0)} {
		refuseSnapshot(t, h, true, malformed, nil)
	}
}

func TestSnapshotRejectedDuplicatePreservesAcceptedEvidence(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 2, 2, 3, 0)); err != nil {
		t.Fatal(err)
	}
	got := inspectSnapshot(t, h, true, recordFromRequest(prep), nil)
	if got.AcceptedOutcome != 1 || !got.History.Fatal || got.History.History.Confirmed != ([68]byte{1}) {
		t.Fatal("code2 overwrote accepted evidence", got)
	}
	worker := capturedPairFixture(t, 5, prep, 1)
	inspectSnapshot(t, h, true, recordFromRequest(prep), &worker)
	contrary := capturedPairFixture(t, 5, prep, 2)
	refuseSnapshot(t, h, true, recordFromRequest(prep), &contrary)
}

func TestSnapshotTransitionsAndOwnedValues(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	begin := decisionBeginFixture(t, prep, 0, 0)
	invalid := decisionBeginFixture(t, prep, 0, 0)
	invalid.Event[96] ^= 1
	before := *h
	if h.begin(invalid) == nil || *h != before {
		t.Fatal("invalid begin consumed submission evidence")
	}
	if err := h.begin(begin); err != nil {
		t.Fatal(err)
	}
	before = *h
	if h.begin(decisionBeginFixture(t, prep, 1, 0)) == nil || *h != before {
		t.Fatal("second pending begin changed evidence")
	}
	for _, raw := range [][]byte{begin.Event, begin.Request} {
		for i := range raw {
			raw[i] ^= 1
		}
	}
	if *h != before {
		t.Fatal("borrowed begin storage")
	}
	pair := decisionPairFixture(t, prep, 1, 2, 1, 0)
	if h.reconcile(pair) == nil || *h != before {
		t.Fatal("invalid reconcile consumed evidence")
	}
	pair.Applied[181] = 1
	if err := h.reconcile(pair); err != nil {
		t.Fatal(err)
	}
	before = *h
	for _, raw := range [][]byte{pair.Received.Event, pair.Received.Request, pair.Received.Reply, pair.Applied} {
		for i := range raw {
			raw[i] ^= 1
		}
	}
	if *h != before {
		t.Fatal("borrowed accepted evidence")
	}
	for range 5 {
		worker := capturedPairFixture(t, 5, prep, 1)
		record := recordFromRequest(prep)
		recordBefore, eventBefore := bytes.Clone(record), bytes.Clone(worker.Event)
		requestBefore, replyBefore := bytes.Clone(worker.Request), bytes.Clone(worker.Reply)
		got := inspectSnapshot(t, h, true, record, &worker)
		if !bytes.Equal(record, recordBefore) || !bytes.Equal(worker.Event, eventBefore) || !bytes.Equal(worker.Request, requestBefore) || !bytes.Equal(worker.Reply, replyBefore) {
			t.Fatal("query mutated caller bytes")
		}
		got.Operation.Candidate[0] ^= 1
		got.History.Fatal = true
		for _, raw := range [][]byte{record, worker.Event, worker.Request, worker.Reply} {
			for i := range raw {
				raw[i] ^= 1
			}
		}
		if *h != before {
			t.Fatal("query retained borrowed evidence or result alias")
		}
		refuseSnapshot(t, h, true, record, &worker)
	}
	if h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)) == nil || *h != before {
		t.Fatal("replayed reconcile changed evidence")
	}
}

func TestSnapshotWorkerExactRequestLinkage(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	runner := operationRequest(t, 2, true, 0)
	if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"operation", "generation", "candidate", "kind"} {
		for _, outcome := range []byte{2, 3} {
			t.Run(fmt.Sprint(field, outcome), func(t *testing.T) {
				other := bytes.Clone(runner)
				switch field {
				case "operation":
					other[280] ^= 1
				case "generation":
					binary.BigEndian.PutUint64(other[296:304], 3)
				case "candidate":
					other[307] ^= 1
				case "kind":
					other = operationRequest(t, 3, false, 1)
				}
				worker := capturedPairFixture(t, 5, other, outcome)
				if err := validateCapturedFrame(worker, obligationFixture(), 125, 3); err != nil {
					t.Fatal("wrong-request worker fixture malformed", err)
				}
				refuseSnapshot(t, h, true, recordFromRequest(runner), &worker)
			})
		}
	}
}

func TestSnapshotWrapperBoundsAndChronology(t *testing.T) {
	h := snapshotFixture(t)
	requests := [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, true, 1)}
	requests[2][280] = 13
	binary.BigEndian.PutUint64(requests[2][296:304], 3)
	for i, request := range requests {
		if i != 0 {
			before := *h
			if h.begin(decisionBeginFixture(t, request, uint64(i*3-1), 0)) == nil || *h != before {
				t.Fatal("begin chronology refusal consumed entry")
			}
		}
		if err := h.begin(decisionBeginFixture(t, request, uint64(i*3), 0)); err != nil {
			t.Fatal(err)
		}
		before := *h
		if h.reconcile(decisionPairFixture(t, request, 1, 1, uint64(i*3), 0)) == nil || *h != before {
			t.Fatal("receive chronology refusal consumed evidence")
		}
		if err := h.reconcile(decisionPairFixture(t, request, 1, 1, uint64(i*3+1), 0)); err != nil {
			t.Fatal(err)
		}
	}
	before := *h
	fourth := bytes.Clone(requests[2])
	fourth[280] = 14
	binary.BigEndian.PutUint64(fourth[296:304], 4)
	if h.begin(decisionBeginFixture(t, fourth, 9, 0)) == nil || *h != before {
		t.Fatal("fourth begin consumed entry")
	}
	if h.reconcile(decisionPairFixture(t, requests[2], 1, 2, 9, 0)) == nil || *h != before {
		t.Fatal("fourth decision consumed evidence")
	}
	empty := snapshotFixture(t)
	if err := empty.reconcile(decisionPairFixture(t, requests[0], 1, 2, 0, 0)); err != nil {
		t.Fatal(err)
	}
	refuseSnapshot(t, empty, true, recordFromRequest(requests[0]), nil)
	if got := inspectSnapshot(t, empty, false, nil, nil); !got.History.Fatal || got.History.History.LastSettledPresent {
		t.Fatal("unsubmitted rejection fabricated settlement", got)
	}
}

// G3a10 uses independently supplied inert slots, never actual worker I/O.
func workerSidecarFixture(t *testing.T, request []byte, outcome byte, control bool) workerSidecarSelection {
	t.Helper()
	worker := capturedPairFixture(t, 5, request, outcome)
	s := workerSidecarSelection{WorkerReceived: bytes.Clone(request), WorkerSent: replyFromRequest(request, outcome), WorkerReply: &worker}
	if control {
		pair := capturedPairFixture(t, 7, request, outcome)
		s.ControlReceived = &pair
	}
	return s
}

func inspectWorkerSidecars(t *testing.T, h *snapshotHistory, selections []workerSidecarSelection) workerSidecarCorrespondence {
	t.Helper()
	before := *h
	got, err := h.inspectWorkerSidecars(selections)
	if err != nil {
		t.Fatal("valid worker selection refused", err)
	}
	if *h != before {
		t.Fatal("worker query mutated private history")
	}
	return got
}

func refuseWorkerSidecars(t *testing.T, h *snapshotHistory, selections []workerSidecarSelection) {
	t.Helper()
	before := *h
	got, err := h.inspectWorkerSidecars(selections)
	if err == nil {
		t.Fatal("invalid worker correspondence accepted")
	}
	if got != (workerSidecarCorrespondence{}) {
		t.Fatal("worker refusal returned partial evidence")
	}
	if *h != before {
		t.Fatal("worker refusal mutated private history")
	}
}

func TestWorkerSidecarContextAndMemberRows(t *testing.T) {
	for _, h := range []*snapshotHistory{nil, {}} {
		for _, selections := range [][]workerSidecarSelection{nil, {{WorkerReceived: wireBytes(t, requestVector)}}} {
			if got, err := h.inspectWorkerSidecars(selections); err == nil || got != (workerSidecarCorrespondence{}) {
				t.Fatal("uninitialized worker query accepted")
			}
		}
	}
	h := snapshotFixture(t)
	if got := inspectWorkerSidecars(t, h, nil); got != (workerSidecarCorrespondence{History: h.history.snapshot()}) {
		t.Fatal("empty selection fabricated evidence")
	}
	if got := inspectWorkerSidecars(t, h, []workerSidecarSelection{}); got.Count != 0 {
		t.Fatal("allocated empty selection fabricated evidence")
	}
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
		t.Fatal(err)
	}
	for mask := 0; mask < 16; mask++ {
		t.Run(fmt.Sprint(mask), func(t *testing.T) {
			s := workerSidecarFixture(t, request, 1, true)
			if mask&1 == 0 {
				s.WorkerReceived = nil
			}
			if mask&2 == 0 {
				s.WorkerSent = nil
			}
			if mask&4 == 0 {
				s.WorkerReply = nil
			}
			if mask&8 == 0 {
				s.ControlReceived = nil
			}
			if mask == 1 || mask == 7 || mask == 15 {
				got := inspectWorkerSidecars(t, h, []workerSidecarSelection{s})
				if got.Count != 1 || !got.Entries[0].ReceivedPresent || got.Entries[0].SentPresent != (mask&2 != 0) || got.Entries[0].ControlReceivedPresent != (mask&8 != 0) {
					t.Fatal("wrong member presence facts", got)
				}
			} else {
				refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
			}
		})
	}
	for _, s := range []workerSidecarSelection{
		{WorkerReceived: request, WorkerSent: []byte{}},
		{WorkerReceived: request, WorkerReply: &capturedFramePair{}},
		{WorkerReceived: request, ControlReceived: &capturedFramePair{}},
	} {
		refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
	}
}

func TestWorkerSidecarPendingPartialEvidence(t *testing.T) {
	h := snapshotFixture(t)
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 100)); err != nil {
		t.Fatal(err)
	}
	for _, outcome := range []byte{1, 2, 3} {
		for row := 0; row < 3; row++ {
			s := workerSidecarFixture(t, request, outcome, row == 2)
			if row == 0 {
				s.WorkerSent, s.WorkerReply = nil, nil
			}
			// Cross-lane/historical clocks and indices deliberately do not order control.
			if s.WorkerReply != nil {
				binary.BigEndian.PutUint64(s.WorkerReply.Event[8:16], ^uint64(0))
				binary.BigEndian.PutUint64(s.WorkerReply.Event[16:24], ^uint64(0))
			}
			if s.ControlReceived != nil {
				binary.BigEndian.PutUint64(s.ControlReceived.Event[8:16], 0)
				binary.BigEndian.PutUint64(s.ControlReceived.Event[16:24], 0)
			}
			got := inspectWorkerSidecars(t, h, []workerSidecarSelection{s})
			entry := got.Entries[0]
			wantOutcome := outcome
			if row == 0 {
				wantOutcome = 0
			}
			if entry.AcceptedOutcome != 0 || entry.WorkerOutcome != wantOutcome || !entry.ReceivedPresent || entry.SentPresent != (row != 0) || entry.ControlReceivedPresent != (row == 2) || entry.Operation.Operation != obligationFixture().Preparation || !got.History.History.Pending || got.History.History.LastSettledPresent || got.History.History.Confirmed != ([68]byte{}) {
				t.Fatal("partial worker evidence promoted settlement or fabricated facts", got)
			}
		}
	}
}

func TestWorkerSidecarMembership(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	refuseWorkerSidecars(t, h, []workerSidecarSelection{{WorkerReceived: prep}})
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	runner := operationRequest(t, 2, true, 0)
	if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"operation", "generation", "candidate", "kind"} {
		t.Run(field, func(t *testing.T) {
			other := bytes.Clone(runner)
			switch field {
			case "operation":
				other[280] ^= 1
			case "generation":
				binary.BigEndian.PutUint64(other[296:304], 3)
			case "candidate":
				other[307] ^= 1
			case "kind":
				other = operationRequest(t, 3, false, 1)
			}
			if _, err := decodeRequest(other, obligationFixture()); err != nil {
				t.Fatal("membership fixture malformed", err)
			}
			refuseWorkerSidecars(t, h, []workerSidecarSelection{{WorkerReceived: other}})
		})
	}
	// A rejected control anchor is not a retained submission.
	other := bytes.Clone(runner)
	other[280] ^= 1
	if err := h.reconcile(decisionPairFixture(t, other, 2, 2, 4, 0)); err != nil {
		t.Fatal(err)
	}
	refuseWorkerSidecars(t, h, []workerSidecarSelection{workerSidecarFixture(t, other, 2, true)})
}

func TestWorkerSidecarIndependentLinks(t *testing.T) {
	h := snapshotFixture(t)
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
		t.Fatal(err)
	}
	for _, member := range []string{"worker-request", "worker-reply", "control-request", "control-reply", "worker-kind", "control-kind"} {
		t.Run(member, func(t *testing.T) {
			s := workerSidecarFixture(t, request, 2, true)
			other := bytes.Clone(request)
			binary.BigEndian.PutUint64(other[296:304], 2)
			switch member {
			case "worker-request":
				pair := capturedPairFixture(t, 5, other, 2)
				s.WorkerReply = &pair
				s.WorkerSent = bytes.Clone(pair.Reply)
				s.ControlReceived = nil
			case "worker-reply":
				pair := capturedPairFixture(t, 5, request, 3)
				s.WorkerReply = &pair
			case "control-request":
				pair := capturedPairFixture(t, 7, other, 2)
				s.ControlReceived = &pair
			case "control-reply":
				pair := capturedPairFixture(t, 7, request, 3)
				s.ControlReceived = &pair
			case "worker-kind":
				pair := capturedPairFixture(t, 7, request, 2)
				s.WorkerReply = &pair
			case "control-kind":
				pair := capturedPairFixture(t, 5, request, 2)
				s.ControlReceived = &pair
			}
			for _, pair := range []*capturedFramePair{s.WorkerReply, s.ControlReceived} {
				if pair == nil {
					continue
				}
				if err := validateCapturedFrame(*pair, obligationFixture(), 125, 3); err != nil {
					t.Fatal("link fixture malformed", err)
				}
			}
			refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
		})
	}
}

func TestWorkerSidecarAcceptedOutcomes(t *testing.T) {
	for _, outcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(outcome), func(t *testing.T) {
			h := snapshotFixture(t)
			request := wireBytes(t, requestVector)
			if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
				t.Fatal(err)
			}
			if err := h.reconcile(decisionPairFixture(t, request, outcome, 1, 1, 0)); err != nil {
				t.Fatal(err)
			}
			for row := 0; row < 3; row++ {
				s := workerSidecarFixture(t, request, outcome, row == 2)
				if row == 0 {
					s.WorkerSent, s.WorkerReply = nil, nil
				}
				got := inspectWorkerSidecars(t, h, []workerSidecarSelection{s})
				want := byte(0)
				if row != 0 {
					want = outcome
				}
				if got.Entries[0].AcceptedOutcome != outcome || got.Entries[0].WorkerOutcome != want || got.Entries[0].SentPresent != (row != 0) {
					t.Fatal("accepted and supplied worker facts conflated", got)
				}
			}
			for _, contrary := range []byte{1, 2, 3} {
				if contrary == outcome {
					continue
				}
				t.Run(fmt.Sprint("contrary", contrary), func(t *testing.T) {
					s := workerSidecarFixture(t, request, contrary, true)
					if err := validateCapturedFrame(*s.WorkerReply, obligationFixture(), 125, 3); err != nil {
						t.Fatal("contrary fixture malformed", err)
					}
					refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
				})
			}
		})
	}
}

func TestWorkerSidecarMalformedMembers(t *testing.T) {
	h := snapshotFixture(t)
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"received-short", "received-long", "sent-empty", "sent-short", "sent-long", "sent-outcome", "sent-digest", "worker-event", "worker-lane", "worker-reserved", "worker-context", "control-event", "control-lane", "control-reserved", "control-context"} {
		t.Run(field, func(t *testing.T) {
			s := workerSidecarFixture(t, request, 1, true)
			switch field {
			case "received-short":
				s.WorkerReceived = s.WorkerReceived[:396]
			case "received-long":
				s.WorkerReceived = append(s.WorkerReceived, 0)
			case "sent-empty":
				s.WorkerSent = []byte{}
			case "sent-short":
				s.WorkerSent = s.WorkerSent[:97]
			case "sent-long":
				s.WorkerSent = append(s.WorkerSent, 0)
			case "sent-outcome":
				s.WorkerSent[65] = 0
			case "sent-digest":
				s.WorkerSent[66] ^= 1
			case "worker-event":
				s.WorkerReply.Event = s.WorkerReply.Event[:255]
			case "worker-lane":
				s.WorkerReply.Event[5] = 1
			case "worker-reserved":
				s.WorkerReply.Event[255] = 1
			case "worker-context":
				s.WorkerReply.Request = nil
			case "control-event":
				s.ControlReceived.Event = append(s.ControlReceived.Event, 0)
			case "control-lane":
				s.ControlReceived.Event[5] = 2
			case "control-reserved":
				s.ControlReceived.Event[255] = 1
			case "control-context":
				s.ControlReceived.Request = nil
			}
			refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
		})
	}
}

func TestWorkerSidecarCollectionAndHistoricalFacts(t *testing.T) {
	h := snapshotFixture(t)
	requests := [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, false, 1)}
	requests[2][280] = 13
	binary.BigEndian.PutUint64(requests[2][296:304], 3)
	var selections []workerSidecarSelection
	for i, request := range requests {
		if err := h.begin(decisionBeginFixture(t, request, uint64(3*i), uint64(100+i))); err != nil {
			t.Fatal(err)
		}
		if err := h.reconcile(decisionPairFixture(t, request, byte(i+1), 1, uint64(3*i+1), uint64(100+i))); err != nil {
			t.Fatal(err)
		}
		selections = append(selections, workerSidecarFixture(t, request, byte(i+1), true))
	}
	for _, order := range [][3]int{{0, 1, 2}, {2, 0, 1}, {1, 2, 0}} {
		selected := []workerSidecarSelection{selections[order[0]], selections[order[1]], selections[order[2]]}
		got := inspectWorkerSidecars(t, h, selected)
		if got.Count != 3 || got.History.History.Confirmed != ([68]byte{1}) {
			t.Fatal("wrong full selection facts", got)
		}
		for i, index := range order {
			if got.Entries[i].Operation.Generation != uint64(index+1) || got.Entries[i].AcceptedOutcome != byte(index+1) || got.Entries[i].WorkerOutcome != byte(index+1) {
				t.Fatal("historical facts lost", got)
			}
		}
	}
	refuseWorkerSidecars(t, h, append(append([]workerSidecarSelection{}, selections...), selections[0]))
	t.Run("duplicate", func(t *testing.T) { refuseWorkerSidecars(t, h, []workerSidecarSelection{selections[0], selections[0]}) })
	// A late invalid member must not leak the earlier successful result.
	t.Run("late-invalid", func(t *testing.T) {
		bad := workerSidecarFixture(t, requests[1], 2, true)
		bad.WorkerSent[0] ^= 1
		refuseWorkerSidecars(t, h, []workerSidecarSelection{selections[0], bad})
	})
	got := inspectWorkerSidecars(t, h, []workerSidecarSelection{selections[0]})
	if got.Count != 1 || got.Entries[1] != (workerSidecarFacts{}) || got.Entries[2] != (workerSidecarFacts{}) {
		t.Fatal("unused results fabricated", got)
	}
}

func TestWorkerSidecarOwnedValuesAndFatalPreservation(t *testing.T) {
	h := snapshotFixture(t)
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
		t.Fatal(err)
	}
	other := bytes.Clone(request)
	binary.BigEndian.PutUint64(other[296:304], 2)
	if err := h.reconcile(decisionPairFixture(t, other, 2, 2, 1, 0)); err != nil {
		t.Fatal(err)
	}
	s := workerSidecarFixture(t, request, 1, true)
	raw := [][]byte{s.WorkerReceived, s.WorkerSent, s.WorkerReply.Event, s.WorkerReply.Request, s.WorkerReply.Reply, s.ControlReceived.Event, s.ControlReceived.Request, s.ControlReceived.Reply}
	copies := make([][]byte, len(raw))
	for i := range raw {
		copies[i] = bytes.Clone(raw[i])
	}
	got := inspectWorkerSidecars(t, h, []workerSidecarSelection{s})
	if !got.History.Fatal || !got.History.History.Pending || got.Entries[0].AcceptedOutcome != 0 {
		t.Fatal("worker query erased fatal/pending", got)
	}
	for i := range raw {
		if !bytes.Equal(raw[i], copies[i]) {
			t.Fatal("worker query mutated supplied input")
		}
	}
	got.Entries[0].Operation.Candidate[0] = 9
	got.History.Fatal = false
	for i := range raw {
		raw[i][0] ^= 1
	}
	fresh := workerSidecarFixture(t, request, 1, true)
	got = inspectWorkerSidecars(t, h, []workerSidecarSelection{fresh})
	if got.Entries[0].Operation.Candidate != ([68]byte{1}) || !got.History.Fatal {
		t.Fatal("worker query retained caller aliases", got)
	}
	// Refusals and repeated queries consume no decision or selection budget.
	for i := 0; i < 4; i++ {
		refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
		inspectWorkerSidecars(t, h, []workerSidecarSelection{fresh})
	}
}

func TestWorkerSidecarRejectedReplyAndMixedRows(t *testing.T) {
	h := snapshotFixture(t)
	prep := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, prep, 0, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 1, 1, 1, 0)); err != nil {
		t.Fatal(err)
	}
	runner := operationRequest(t, 2, true, 0)
	if err := h.begin(decisionBeginFixture(t, runner, 3, 0)); err != nil {
		t.Fatal(err)
	}
	if err := h.reconcile(decisionPairFixture(t, prep, 2, 2, 4, 0)); err != nil {
		t.Fatal(err)
	}
	matching := workerSidecarFixture(t, prep, 1, true)
	receivedOnly := workerSidecarSelection{WorkerReceived: bytes.Clone(runner)}
	got := inspectWorkerSidecars(t, h, []workerSidecarSelection{receivedOnly, matching})
	if got.Count != 2 || got.Entries[0].AcceptedOutcome != 0 || got.Entries[0].SentPresent || got.Entries[1].AcceptedOutcome != 1 || got.Entries[1].WorkerOutcome != 1 || !got.History.Fatal || !got.History.History.Pending {
		t.Fatal("rejected evidence overwrote accepted worker relation", got)
	}
	refuseWorkerSidecars(t, h, []workerSidecarSelection{workerSidecarFixture(t, prep, 2, true)})
	refuseWorkerSidecars(t, h, []workerSidecarSelection{receivedOnly, workerSidecarFixture(t, runner, 3, false)})
}

func TestWorkerSidecarRefusalPreservesSuppliedBytes(t *testing.T) {
	h := snapshotFixture(t)
	request := wireBytes(t, requestVector)
	if err := h.begin(decisionBeginFixture(t, request, 0, 0)); err != nil {
		t.Fatal(err)
	}
	s := workerSidecarFixture(t, request, 1, true)
	s.ControlReceived.Event[255] = 1
	raw := [][]byte{s.WorkerReceived, s.WorkerSent, s.WorkerReply.Event, s.WorkerReply.Request, s.WorkerReply.Reply, s.ControlReceived.Event, s.ControlReceived.Request, s.ControlReceived.Reply}
	copies := make([][]byte, len(raw))
	for i := range raw {
		copies[i] = bytes.Clone(raw[i])
	}
	refuseWorkerSidecars(t, h, []workerSidecarSelection{s})
	for i := range raw {
		if !bytes.Equal(raw[i], copies[i]) {
			t.Fatal("worker refusal mutated supplied input")
		}
	}
}

// G3a11 transcribes result slots independently of the correspondence query.
func writeResultFixture(t *testing.T, kind uint16, request []byte, outcome byte, result, errno int32) writeResultPair {
	t.Helper()
	before := capturedPairFixture(t, kind, request, outcome)
	binary.BigEndian.PutUint64(before.Event[8:16], 0)
	binary.BigEndian.PutUint64(before.Event[16:24], 5)
	after := bytes.Clone(before.Event)
	binary.BigEndian.PutUint16(after[6:8], kind+1)
	binary.BigEndian.PutUint64(after[8:16], 8)
	binary.BigEndian.PutUint32(after[164:168], uint32(result))
	binary.BigEndian.PutUint32(after[168:172], uint32(errno))
	return writeResultPair{Before: before, Result: after}
}

func inspectWriteResultFixture(t *testing.T, pairs []writeResultPair) writeResultCorrespondence {
	t.Helper()
	got, err := inspectWriteResults(pairs, obligationFixture(), 125, 3)
	if err != nil {
		t.Fatal("valid write/result correspondence refused", err)
	}
	return got
}

func refuseWriteResultFixture(t *testing.T, pairs []writeResultPair) {
	t.Helper()
	got, err := inspectWriteResults(pairs, obligationFixture(), 125, 3)
	if err == nil {
		t.Fatal("invalid write/result correspondence accepted")
	}
	if got != (writeResultCorrespondence{}) {
		t.Fatal("write/result refusal returned partial evidence")
	}
}

func TestWriteResultContextAndPartialSelection(t *testing.T) {
	for _, pairs := range [][]writeResultPair{nil, {}} {
		if got := inspectWriteResultFixture(t, pairs); got != (writeResultCorrespondence{}) {
			t.Fatal("empty selection fabricated evidence")
		}
		bad := obligationFixture()
		bad.Preparation = [16]byte{}
		for _, context := range []struct {
			bindings obligationBindings
			n, d     uint32
		}{{bad, 125, 3}, {obligationFixture(), 0, 3}, {obligationFixture(), 125, 0}} {
			got, err := inspectWriteResults(pairs, context.bindings, context.n, context.d)
			if err == nil || got != (writeResultCorrespondence{}) {
				t.Fatal("invalid empty context accepted")
			}
		}
	}
	request := wireBytes(t, requestVector)
	for _, kind := range []uint16{3, 5} {
		for _, outcome := range []byte{1, 2, 3} {
			length := int32(397)
			if kind == 5 {
				length = 98
			}
			pair := writeResultFixture(t, kind, request, outcome, length, -1)
			got := inspectWriteResultFixture(t, []writeResultPair{pair})
			if got.Count != 1 || got.Entries[0].Kind != kind || got.Entries[0].Operation.Operation != obligationFixture().Preparation || got.Entries[0].Result != length || got.Entries[0].Errno != -1 || !got.Entries[0].ExactFrameCount || got.Entries[1] != (writeResultFacts{}) {
				t.Fatal("wrong partial write/result facts", got)
			}
		}
	}
}

func TestWriteResultSignedDiagnostics(t *testing.T) {
	request := wireBytes(t, requestVector)
	for _, kind := range []uint16{3, 5} {
		length := int32(397)
		if kind == 5 {
			length = 98
		}
		for _, result := range []int32{-1 << 31, -2, -1, 0, 1, length - 1, length, length + 1, 98, 397, 1<<31 - 1} {
			for _, errno := range []int32{-1 << 31, -1, 0, 1, 1<<31 - 1} {
				t.Run(fmt.Sprintf("kind%d/result%d/errno%d", kind, result, errno), func(t *testing.T) {
					pair := writeResultFixture(t, kind, request, 2, result, errno)
					got := inspectWriteResultFixture(t, []writeResultPair{pair}).Entries[0]
					if got.Result != result || got.Errno != errno || got.ExactFrameCount != (result == length) {
						t.Fatal("raw diagnostic or category count changed", got)
					}
				})
			}
		}
	}
}

func TestWriteResultValidTupleSubstitutions(t *testing.T) {
	for _, kind := range []uint16{3, 5} {
		for _, field := range []string{"operation", "generation", "request", "candidate", "outcome", "record"} {
			if kind == 3 && (field == "outcome" || field == "record") {
				continue
			}
			t.Run(fmt.Sprintf("kind%d/%s", kind, field), func(t *testing.T) {
				pair := writeResultFixture(t, kind, wireBytes(t, requestVector), 2, -1, 22)
				switch field {
				case "operation":
					pair.Result[72] ^= 1
				case "generation":
					binary.BigEndian.PutUint64(pair.Result[88:96], 2)
				case "request":
					pair.Result[96] ^= 1
				case "candidate":
					pair.Result[214] ^= 1
				case "outcome":
					pair.Result[180] = 3
				case "record":
					pair = writeResultFixture(t, kind, wireBytes(t, requestVector), 1, -1, 22)
					pair.Result[182] ^= 1
				}
				if err := validateCapturedFrame(pair.Before, obligationFixture(), 125, 3); err != nil {
					t.Fatal("substitution pre-event malformed", err)
				}
				if _, err := decodeEventFields(pair.Result, obligationFixture(), 125, 3); err != nil {
					t.Fatal("substitution result malformed", err)
				}
				refuseWriteResultFixture(t, []writeResultPair{pair})
			})
		}
	}
}

func TestWriteResultKindsAndMalformedMembers(t *testing.T) {
	request := wireBytes(t, requestVector)
	for _, kind := range []uint16{3, 5} {
		for _, field := range []string{"pre-kind", "result-kind", "pre-short", "result-short", "pre-long", "result-long", "request-short", "reply-short", "pre-lane", "result-lane", "binding", "timebase", "reserved", "forbidden", "missing-pre", "missing-result"} {
			if kind == 3 && field == "reply-short" {
				continue
			}
			t.Run(fmt.Sprintf("kind%d/%s", kind, field), func(t *testing.T) {
				pair := writeResultFixture(t, kind, request, 2, 0, 0)
				switch field {
				case "pre-kind":
					pair.Before = capturedPairFixture(t, 7, request, 2)
					binary.BigEndian.PutUint64(pair.Before.Event[8:16], 0)
				case "result-kind":
					binary.BigEndian.PutUint16(pair.Result[6:8], kind)
				case "pre-short":
					pair.Before.Event = pair.Before.Event[:255]
				case "result-short":
					pair.Result = pair.Result[:255]
				case "pre-long":
					pair.Before.Event = append(pair.Before.Event, 0)
				case "result-long":
					pair.Result = append(pair.Result, 0)
				case "request-short":
					pair.Before.Request = pair.Before.Request[:396]
				case "reply-short":
					pair.Before.Reply = pair.Before.Reply[:97]
				case "pre-lane":
					pair.Before.Event[5] = 3
				case "result-lane":
					pair.Result[5] = 3
				case "binding":
					pair.Result[40] ^= 1
				case "timebase":
					binary.BigEndian.PutUint32(pair.Result[32:36], 124)
				case "reserved":
					pair.Result[255] = 1
				case "forbidden":
					pair.Result[128] = 1
				case "missing-pre":
					pair.Before = capturedFramePair{}
				case "missing-result":
					pair.Result = nil
				}
				if field == "result-kind" || field == "pre-kind" {
					if err := validateCapturedFrame(pair.Before, obligationFixture(), 125, 3); err != nil {
						t.Fatal("wrong-kind pre fixture malformed", err)
					}
					if _, err := decodeEventFields(pair.Result, obligationFixture(), 125, 3); err != nil {
						t.Fatal("wrong-kind result fixture malformed", err)
					}
				}
				refuseWriteResultFixture(t, []writeResultPair{pair})
			})
		}
	}
}

func TestWriteResultLocalChronology(t *testing.T) {
	for _, kind := range []uint16{3, 5} {
		for _, tc := range []struct {
			name                                   string
			preSeq, resultSeq, preTick, resultTick uint64
			valid                                  bool
		}{
			{"same-tick", 0, 1, 0, 0, true}, {"gap", 1, 100, 0, 5, true}, {"max", ^uint64(0) - 1, ^uint64(0), ^uint64(0), ^uint64(0), true},
			{"equal-sequence", 5, 5, 1, 1, false}, {"reversed-sequence", 6, 5, 1, 2, false}, {"wrapped-sequence", ^uint64(0), 0, 0, 1, false}, {"regressed-tick", 0, 1, 6, 5, false}, {"wrapped-tick", 0, 1, ^uint64(0), 0, false},
		} {
			t.Run(fmt.Sprintf("kind%d/%s", kind, tc.name), func(t *testing.T) {
				pair := writeResultFixture(t, kind, wireBytes(t, requestVector), 1, 0, 0)
				binary.BigEndian.PutUint64(pair.Before.Event[8:16], tc.preSeq)
				binary.BigEndian.PutUint64(pair.Result[8:16], tc.resultSeq)
				binary.BigEndian.PutUint64(pair.Before.Event[16:24], tc.preTick)
				binary.BigEndian.PutUint64(pair.Result[16:24], tc.resultTick)
				if tc.valid {
					inspectWriteResultFixture(t, []writeResultPair{pair})
				} else {
					refuseWriteResultFixture(t, []writeResultPair{pair})
				}
			})
		}
	}
}

func TestWriteResultCollectionBoundsAndOrdering(t *testing.T) {
	requests := [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, true, 1)}
	requests[2][280] = 13
	binary.BigEndian.PutUint64(requests[2][296:304], 3)
	var pairs []writeResultPair
	for _, request := range requests {
		for _, kind := range []uint16{3, 5} {
			pair := writeResultFixture(t, kind, request, 2, 17, -2)
			// Identical per-lane indices across pairs deliberately carry no full-stream claim.
			if kind == 5 {
				binary.BigEndian.PutUint64(pair.Before.Event[16:24], 999)
				binary.BigEndian.PutUint64(pair.Result[16:24], 999)
			}
			pairs = append(pairs, pair)
		}
	}
	for _, order := range [][6]int{{0, 1, 2, 3, 4, 5}, {5, 2, 1, 4, 3, 0}} {
		var selected []writeResultPair
		for _, i := range order {
			selected = append(selected, pairs[i])
		}
		got := inspectWriteResultFixture(t, selected)
		if got.Count != 6 {
			t.Fatal("full bounded selection lost entries", got)
		}
		for i, index := range order {
			if got.Entries[i].Kind != []uint16{3, 5}[index%2] || got.Entries[i].Operation.Generation != uint64(index/2+1) {
				t.Fatal("selection order changed", got)
			}
		}
	}
	inspectWriteResultFixture(t, []writeResultPair{pairs[0], pairs[2], pairs[4]})
	inspectWriteResultFixture(t, []writeResultPair{pairs[1], pairs[3], pairs[5]})
	t.Run("duplicate", func(t *testing.T) { refuseWriteResultFixture(t, []writeResultPair{pairs[0], pairs[0]}) })
	t.Run("duplicate-different-result", func(t *testing.T) {
		other := writeResultFixture(t, 3, requests[0], 0, -1, 22)
		refuseWriteResultFixture(t, []writeResultPair{pairs[0], other})
	})
	refuseWriteResultFixture(t, append(append([]writeResultPair{}, pairs...), pairs[0]))
	fourth := bytes.Clone(requests[2])
	fourth[280] = 14
	binary.BigEndian.PutUint64(fourth[296:304], 4)
	t.Run("four-operations", func(t *testing.T) {
		refuseWriteResultFixture(t, []writeResultPair{pairs[0], pairs[3], pairs[4], writeResultFixture(t, 5, fourth, 2, 0, 0)})
	})
	refuseWriteResultFixture(t, []writeResultPair{pairs[0], pairs[2], pairs[4], writeResultFixture(t, 3, fourth, 0, 0, 0)})
	t.Run("late-invalid", func(t *testing.T) {
		bad := writeResultFixture(t, 5, requests[1], 1, 0, 0)
		bad.Result[72] ^= 1
		refuseWriteResultFixture(t, []writeResultPair{pairs[0], bad})
	})
}

func TestWriteResultCrossCategoryExactRequest(t *testing.T) {
	request := operationRequest(t, 2, true, 0)
	for _, field := range []string{"generation", "candidate", "kind"} {
		t.Run(field, func(t *testing.T) {
			other := bytes.Clone(request)
			switch field {
			case "generation":
				binary.BigEndian.PutUint64(other[296:304], 3)
			case "candidate":
				other[307] ^= 1
			case "kind":
				other = operationRequest(t, 3, false, 1)
			}
			left := writeResultFixture(t, 3, request, 0, 397, 0)
			right := writeResultFixture(t, 5, other, 2, 98, 0)
			inspectWriteResultFixture(t, []writeResultPair{left})
			inspectWriteResultFixture(t, []writeResultPair{right})
			refuseWriteResultFixture(t, []writeResultPair{left, right})
		})
	}
}

func TestWriteResultOwnedFactsAndInputPreservation(t *testing.T) {
	request := wireBytes(t, requestVector)
	pair := writeResultFixture(t, 5, request, 1, 98, -1)
	raw := [][]byte{pair.Before.Event, pair.Before.Request, pair.Before.Reply, pair.Result}
	copies := make([][]byte, len(raw))
	for i := range raw {
		copies[i] = bytes.Clone(raw[i])
	}
	got := inspectWriteResultFixture(t, []writeResultPair{pair})
	saved := got
	for i := range raw {
		if !bytes.Equal(raw[i], copies[i]) {
			t.Fatal("write/result success mutated supplied input")
		}
		raw[i][0] ^= 1
	}
	if got != saved {
		t.Fatal("write/result facts alias input")
	}
	badCopies := make([][]byte, len(raw))
	for i := range raw {
		badCopies[i] = bytes.Clone(raw[i])
	}
	refuseWriteResultFixture(t, []writeResultPair{pair})
	for i := range raw {
		if !bytes.Equal(raw[i], badCopies[i]) {
			t.Fatal("write/result refusal mutated supplied input")
		}
	}
	got.Entries[0].Operation.Candidate[0] = 9
	got.Entries[0].Errno = 4
	fresh := writeResultFixture(t, 5, request, 1, 98, -1)
	if again := inspectWriteResultFixture(t, []writeResultPair{fresh}); again != saved {
		t.Fatal("write/result facts retained mutable state", again)
	}
}

func TestWriteResultCopiedOperationFacts(t *testing.T) {
	for _, request := range [][]byte{wireBytes(t, requestVector), operationRequest(t, 2, true, 0), operationRequest(t, 3, false, 2)} {
		want, err := decodeRequest(request, obligationFixture())
		if err != nil {
			t.Fatal("operation fact fixture malformed", err)
		}
		for _, kind := range []uint16{3, 5} {
			pair := writeResultFixture(t, kind, request, 3, -2, 1<<31-1)
			got := inspectWriteResultFixture(t, []writeResultPair{pair}).Entries[0]
			if got != (writeResultFacts{Kind: kind, Operation: want, Result: -2, Errno: 1<<31 - 1}) {
				t.Fatal("copied operation facts differ from supplied request", got)
			}
		}
	}
}
