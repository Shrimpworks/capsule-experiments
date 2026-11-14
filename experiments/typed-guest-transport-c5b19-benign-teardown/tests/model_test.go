package oracle

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"testing"
)

// Digest calculated independently from the exact domain-separated preimage:
// attempt=01*16, pid=42, sequence=7, creation tick=9, fixture SHA-256=04*32.
const processIdentityVector = "13eb9ba7e76fa3cb9142e197cd570d1dd9d1abe297cc40dff2410fde7700b29c"

func TestProcessIdentityKnownAnswer(t *testing.T) {
	attempt := [16]byte(bytes.Repeat([]byte{1}, 16))
	fixtureDigest := [32]byte(bytes.Repeat([]byte{4}, 32))
	got, err := deriveProcessIdentity(attempt, 42, 7, 9, fixtureDigest)
	if err != nil {
		t.Fatal(err)
	}
	want, err := hex.DecodeString(processIdentityVector)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got[:], want) {
		t.Fatalf("identity = %x, want %x", got, want)
	}
	for _, tc := range []struct {
		name     string
		attempt  [16]byte
		pid      uint32
		sequence uint64
		tick     uint64
		digest   [32]byte
	}{
		{"changed attempt", [16]byte(bytes.Repeat([]byte{2}, 16)), 42, 7, 9, fixtureDigest},
		{"changed pid", attempt, 43, 7, 9, fixtureDigest},
		{"changed sequence", attempt, 42, 8, 9, fixtureDigest},
		{"changed tick", attempt, 42, 7, 10, fixtureDigest},
		{"changed fixture", attempt, 42, 7, 9, [32]byte(bytes.Repeat([]byte{5}, 32))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			changed, err := deriveProcessIdentity(tc.attempt, tc.pid, tc.sequence, tc.tick, tc.digest)
			if err != nil || bytes.Equal(changed[:], want) {
				t.Fatalf("changed observation did not change identity: %x, %v", changed, err)
			}
		})
	}
}

func TestProcessIdentityRejectsInvalidObservations(t *testing.T) {
	attempt := [16]byte(bytes.Repeat([]byte{1}, 16))
	fixtureDigest := [32]byte(bytes.Repeat([]byte{4}, 32))
	for _, tc := range []struct {
		name     string
		attempt  [16]byte
		pid      uint32
		sequence uint64
		tick     uint64
		digest   [32]byte
	}{
		{"zero attempt", [16]byte{}, 42, 7, 9, fixtureDigest},
		{"zero pid", attempt, 0, 7, 9, fixtureDigest},
		{"pid overflow", attempt, 1 << 31, 7, 9, fixtureDigest},
		{"zero sequence", attempt, 42, 0, 9, fixtureDigest},
		{"zero tick", attempt, 42, 7, 0, fixtureDigest},
		{"zero fixture digest", attempt, 42, 7, 9, [32]byte{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := deriveProcessIdentity(tc.attempt, tc.pid, tc.sequence, tc.tick, tc.digest); err == nil {
				t.Fatal("invalid observation accepted")
			}
		})
	}
}

// These synthetic histories describe write bytes, never actual control events.
func historyRequest(t *testing.T, kind byte, generation uint64, operation, identity byte, runner bool, disposition byte) []byte {
	t.Helper()
	r := operationRequest(t, kind, runner, disposition)
	binary.BigEndian.PutUint64(r[296:304], generation)
	if kind != 1 {
		copy(r[280:296], bytes.Repeat([]byte{operation}, 16))
	}
	if runner {
		copy(r[307:339], bytes.Repeat([]byte{identity}, 32))
	}
	if kind == 3 {
		copy(r[339:371], bytes.Repeat([]byte{identity}, 32))
	}
	return r
}
func newHistoryFixture(t *testing.T) *writeHistory {
	t.Helper()
	h, err := newWriteHistory(obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	return h
}
func beginAndCheck(t *testing.T, h *writeHistory, r []byte) {
	t.Helper()
	before := h.snapshot()
	if err := h.begin(r); err != nil {
		t.Fatal(err)
	}
	got := h.snapshot()
	op, err := decodeRequest(r, obligationFixture())
	if err != nil {
		t.Fatal(err)
	}
	if !got.Pending || got.PendingOperation != op || got.LastSettled != before.LastSettled || got.LastSettledPresent != before.LastSettledPresent || got.Confirmed != before.Confirmed {
		t.Fatal("begin changed settled facts or retained wrong pending bytes")
	}
}
func settleAndCheck(t *testing.T, h *writeHistory, r []byte, outcome byte) {
	t.Helper()
	before := h.snapshot()
	if err := h.applyReply(replyFromRequest(r, outcome)); err != nil {
		t.Fatal(err)
	}
	got := h.snapshot()
	if got.Pending || got.PendingOperation != (wireOperation{}) || !got.LastSettledPresent || got.LastSettled.Operation != before.PendingOperation || got.LastSettled.Outcome != outcome {
		t.Fatal("settlement did not retain exact operation/outcome")
	}
	want := before.Confirmed
	if outcome == 1 {
		copy(want[:], r[305:373])
	}
	if got.Confirmed != want {
		t.Fatal("uncertain outcome promoted candidate or confirmed outcome lost exact projection")
	}
}
func rejectBeginUnchanged(t *testing.T, h *writeHistory, r []byte) {
	t.Helper()
	before := *h
	if err := h.begin(r); err == nil {
		t.Fatal("invalid begin accepted")
	}
	if *h != before {
		t.Fatal("rejected begin changed history")
	}
}
func rejectReplyUnchanged(t *testing.T, h *writeHistory, r []byte) {
	t.Helper()
	before := *h
	if err := h.applyReply(r); err == nil {
		t.Fatal("invalid reply accepted")
	}
	if *h != before {
		t.Fatal("rejected reply changed history")
	}
}
func preparedHistory(t *testing.T) *writeHistory {
	t.Helper()
	h := newHistoryFixture(t)
	r := wireBytes(t, requestVector)
	beginAndCheck(t, h, r)
	settleAndCheck(t, h, r, 1)
	return h
}

func TestWriteHistoryPositiveSettlementMatrix(t *testing.T) {
	for _, runnerOutcome := range []byte{0, 1, 2, 3} {
		for _, terminalOutcome := range []byte{1, 2, 3} {
			for _, disposition := range []byte{1, 2} {
				t.Run(fmt.Sprintf("runner-%d-terminal-%d-disposition-%d", runnerOutcome, terminalOutcome, disposition), func(t *testing.T) {
					h := preparedHistory(t)
					generation := uint64(2)
					if runnerOutcome != 0 {
						r := historyRequest(t, 2, 2, 11, 12, true, 0)
						beginAndCheck(t, h, r)
						settleAndCheck(t, h, r, runnerOutcome)
						generation++
					}
					terminal := historyRequest(t, 3, generation, 13, 12, runnerOutcome == 1, disposition)
					beginAndCheck(t, h, terminal)
					settleAndCheck(t, h, terminal, terminalOutcome)
					rejectBeginUnchanged(t, h, historyRequest(t, 3, generation+1, 14, 12, runnerOutcome == 1, disposition))
					rejectBeginUnchanged(t, h, historyRequest(t, 2, generation+1, 14, 12, true, 0))
				})
			}
		}
	}
	for _, outcome := range []byte{2, 3} {
		t.Run(fmt.Sprintf("preparation-%d", outcome), func(t *testing.T) {
			h := newHistoryFixture(t)
			r := wireBytes(t, requestVector)
			beginAndCheck(t, h, r)
			settleAndCheck(t, h, r, outcome)
			rejectBeginUnchanged(t, h, historyRequest(t, 2, 2, 11, 12, true, 0))
			rejectBeginUnchanged(t, h, historyRequest(t, 3, 2, 13, 12, false, 1))
			rejectBeginUnchanged(t, h, r)
		})
	}
}

func TestWriteHistoryPendingIsNotWorkerArrival(t *testing.T) {
	stages := []byte{1, 2, 3}
	for _, kind := range stages {
		t.Run(fmt.Sprint(kind), func(t *testing.T) {
			h := newHistoryFixture(t)
			r := wireBytes(t, requestVector)
			if kind != 1 {
				h = preparedHistory(t)
				r = historyRequest(t, kind, 2, 11, 12, kind == 2, 1)
				if kind == 2 {
					r[372] = 0
				}
			}
			beginAndCheck(t, h, r)
			before := *h
			for i := 0; i < 4; i++ {
				if _, err := validateReply(replyFromRequest(r, 1), r, obligationFixture()); err != nil {
					t.Fatal(err)
				}
				_ = h.snapshot()
				if *h != before {
					t.Fatal("standalone reply validation or snapshot settled pending")
				}
			}
			for _, nextKind := range stages {
				candidate := historyRequest(t, nextKind, 2, 14, 12, nextKind == 2, 1)
				if nextKind == 1 || nextKind == 2 {
					candidate[372] = 0
				}
				rejectBeginUnchanged(t, h, candidate)
			}
			settleAndCheck(t, h, r, 1)
		})
	}
}

func TestWriteHistoryGenerationFreshnessAndOrdering(t *testing.T) {
	for _, generation := range []uint64{0, 2, 1<<53 - 1} {
		h := newHistoryFixture(t)
		r := wireBytes(t, requestVector)
		binary.BigEndian.PutUint64(r[296:304], generation)
		rejectBeginUnchanged(t, h, r)
		beginAndCheck(t, h, wireBytes(t, requestVector))
	}
	for _, kind := range []byte{2, 3} {
		h := newHistoryFixture(t)
		disposition := byte(0)
		if kind == 3 {
			disposition = 1
		}
		rejectBeginUnchanged(t, h, historyRequest(t, kind, 1, 11, 12, kind == 2, disposition))
		beginAndCheck(t, h, wireBytes(t, requestVector))
	}
	for _, generation := range []uint64{1, 3, 1<<53 - 1} {
		h := preparedHistory(t)
		rejectBeginUnchanged(t, h, historyRequest(t, 2, generation, 11, 12, true, 0))
		beginAndCheck(t, h, historyRequest(t, 2, 2, 11, 12, true, 0))
	}
	for _, outcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(outcome), func(t *testing.T) {
			h := preparedHistory(t)
			runner := historyRequest(t, 2, 2, 11, 12, true, 0)
			beginAndCheck(t, h, runner)
			settleAndCheck(t, h, runner, outcome)
			rejectBeginUnchanged(t, h, historyRequest(t, 2, 3, 14, 12, true, 0))         // same kind, fresh ID, exact generation
			rejectBeginUnchanged(t, h, historyRequest(t, 3, 3, 11, 12, outcome == 1, 1)) // fresh kind/generation, reused ID
			rejectBeginUnchanged(t, h, historyRequest(t, 3, 2, 13, 12, outcome == 1, 1))
			rejectBeginUnchanged(t, h, historyRequest(t, 3, 1, 13, 12, outcome == 1, 1))
			rejectBeginUnchanged(t, h, wireBytes(t, requestVector))
			beginAndCheck(t, h, historyRequest(t, 3, 3, 13, 12, outcome == 1, 1))
		})
	}
}

func TestWriteHistoryTerminalContinuity(t *testing.T) {
	for _, outcome := range []byte{1, 2, 3} {
		t.Run(fmt.Sprint(outcome), func(t *testing.T) {
			h := preparedHistory(t)
			runner := historyRequest(t, 2, 2, 11, 12, true, 0)
			beginAndCheck(t, h, runner)
			settleAndCheck(t, h, runner, outcome)
			// Each rejected terminal is individually valid; only history rules refuse it.
			wrongFact := historyRequest(t, 3, 3, 13, 12, outcome != 1, 1)
			if _, err := decodeRequest(wrongFact, obligationFixture()); err != nil {
				t.Fatal(err)
			}
			rejectBeginUnchanged(t, h, wrongFact)
			wrongIdentity := historyRequest(t, 3, 3, 13, 14, outcome == 1, 1)
			if _, err := decodeRequest(wrongIdentity, obligationFixture()); err != nil {
				t.Fatal(err)
			}
			rejectBeginUnchanged(t, h, wrongIdentity)
			beginAndCheck(t, h, historyRequest(t, 3, 3, 13, 12, outcome == 1, 1))
		})
	}
	h := preparedHistory(t)
	rejectBeginUnchanged(t, h, historyRequest(t, 3, 2, 13, 12, true, 1))
	beginAndCheck(t, h, historyRequest(t, 3, 2, 13, 15, false, 1))
}

func TestWriteHistoryExactSettlementAndReplays(t *testing.T) {
	h := preparedHistory(t)
	preparationReply := wireBytes(t, replyVector)
	rejectReplyUnchanged(t, h, preparationReply)
	runner := historyRequest(t, 2, 2, 11, 12, true, 0)
	beginAndCheck(t, h, runner)
	rejectReplyUnchanged(t, h, preparationReply)
	reply := replyFromRequest(runner, 1)
	for i := range reply {
		changed := bytes.Clone(reply)
		changed[i] ^= 128
		rejectReplyUnchanged(t, h, changed)
	}
	for n := 0; n < len(reply); n++ {
		rejectReplyUnchanged(t, h, reply[:n])
	}
	rejectReplyUnchanged(t, h, append(bytes.Clone(reply), 0))
	changed := bytes.Clone(runner)
	changed[307] = 14
	rejectReplyUnchanged(t, h, replyFromRequest(changed, 1))
	changed = bytes.Clone(runner)
	changed[88] = 15
	setWireObligation(changed)
	rejectReplyUnchanged(t, h, replyFromRequest(changed, 1))
	settleAndCheck(t, h, runner, 1)
	rejectReplyUnchanged(t, h, reply)
	terminal := historyRequest(t, 3, 3, 13, 12, true, 1)
	beginAndCheck(t, h, terminal)
	rejectReplyUnchanged(t, h, reply)
	settleAndCheck(t, h, terminal, 1)
}

func TestWriteHistoryOwnershipAndInitialization(t *testing.T) {
	r := wireBytes(t, requestVector)
	reply := wireBytes(t, replyVector)
	zero := &writeHistory{}
	rejectBeginUnchanged(t, zero, r)
	rejectReplyUnchanged(t, zero, reply)
	var absent *writeHistory
	if absent.begin(r) == nil || absent.applyReply(reply) == nil {
		t.Fatal("nil history accepted operation")
	}
	for _, invalid := range []obligationBindings{{}, func() obligationBindings { b := obligationFixture(); b.Preparation = b.Attempt; return b }(), func() obligationBindings { b := obligationFixture(); b.Runner = b.Plan; return b }()} {
		if _, err := newWriteHistory(invalid); err == nil {
			t.Fatal("invalid constructor bindings accepted")
		}
	}
	frozen := obligationFixture()
	h, err := newWriteHistory(frozen)
	if err != nil {
		t.Fatal(err)
	}
	frozen.Attempt[0] = 15
	beginAndCheck(t, h, r)
	r[280] = 15
	r[305] = 0
	snap := h.snapshot()
	snap.PendingOperation.Operation[0] = 15
	snap.PendingOperation.Candidate[0] = 0
	snap.Confirmed[0] = 1
	if err := h.applyReply(reply); err != nil {
		t.Fatal("caller mutation changed retained pending bytes", err)
	}
	settled := h.snapshot()
	settled.LastSettled.Operation.Candidate[0] = 0
	settled.Confirmed[0] = 0
	if h.snapshot().Confirmed != [68]byte{1} || h.snapshot().LastSettled.Operation.Candidate != [68]byte{1} {
		t.Fatal("snapshot aliases history")
	}
}

func TestWriteHistoryVariedValidBindingsAndIdentities(t *testing.T) {
	for _, v := range []byte{14, 15, 16} {
		t.Run(fmt.Sprint(v), func(t *testing.T) {
			r := wireBytes(t, requestVector)
			r[88] = v
			r[136] = v
			r[232] = v
			r[280] = v
			setWireObligation(r)
			frozen := bindingsFromTestRequest(r)
			h, err := newWriteHistory(frozen)
			if err != nil {
				t.Fatal(err)
			}
			if err := h.begin(r); err != nil {
				t.Fatal(err)
			}
			if err := h.applyReply(replyFromRequest(r, 1)); err != nil {
				t.Fatal(err)
			}
			runner := historyRequest(t, 2, 2, v+10, v+20, true, 0)
			copy(runner[8:280], r[8:280])
			if err := h.begin(runner); err != nil {
				t.Fatal(err)
			}
			if err := h.applyReply(replyFromRequest(runner, 2)); err != nil {
				t.Fatal(err)
			}
			terminal := historyRequest(t, 3, 3, v+11, v+20, false, 2)
			copy(terminal[8:280], r[8:280])
			if err := h.begin(terminal); err != nil {
				t.Fatal(err)
			}
			if err := h.applyReply(replyFromRequest(terminal, 1)); err != nil {
				t.Fatal(err)
			}
			want := [68]byte(terminal[305:373])
			if h.snapshot().Confirmed != want {
				t.Fatal("varied fixture was hardcoded")
			}
		})
	}
}

func TestWriteHistoryRequestBindingAndRejectionOwnership(t *testing.T) {
	h := preparedHistory(t)
	request := historyRequest(t, 2, 2, 11, 12, true, 0)
	changed := bytes.Clone(request)
	changed[88] = 14
	setWireObligation(changed)
	if _, err := decodeRequest(changed, bindingsFromTestRequest(changed)); err != nil {
		t.Fatal(err)
	}
	rejectBeginUnchanged(t, h, changed)
	for _, invalid := range [][]byte{nil, request[:396], append(bytes.Clone(request), 0)} {
		rejectBeginUnchanged(t, h, invalid)
	}
	beginAndCheck(t, h, request)
	// An otherwise valid terminal uses exactly the current next generation and
	// fresh ID. Only the pending guard prevents it replacing the queued runner.
	replacement := historyRequest(t, 3, 2, 13, 12, false, 1)
	rejectBeginUnchanged(t, h, replacement)
	rejectReplyUnchanged(t, h, replyFromRequest(replacement, 1))
	settleAndCheck(t, h, request, 2)
	replacement = historyRequest(t, 3, 3, 13, 12, false, 1)
	beginAndCheck(t, h, replacement)
	settleAndCheck(t, h, replacement, 1)
}
