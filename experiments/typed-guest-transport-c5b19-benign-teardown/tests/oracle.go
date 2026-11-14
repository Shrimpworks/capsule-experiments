// This package is a read-only, offline experiment oracle. It has no process,
// signal, wait, or live transport authority.
package oracle

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
)

type cancelBindings struct {
	Attempt      [16]byte
	Approval     [16]byte
	Registration [16]byte
}

var errCancellationFrame = errors.New("C5B19_CANCEL_FRAME")

// validateCancellationFrame accepts only the one exact harness event frozen
// in the Gate-2 packet. Matching a PID, path, timestamp, or substitute binding
// is intentionally not an option.
func validateCancellationFrame(frame []byte, frozen cancelBindings) error {
	if frozen.Attempt == [16]byte{} || frozen.Approval == [16]byte{} ||
		frozen.Registration == [16]byte{} || frozen.Attempt == frozen.Approval ||
		frozen.Attempt == frozen.Registration || frozen.Approval == frozen.Registration {
		return errCancellationFrame
	}
	if len(frame) != 57 || !bytes.Equal(frame[:8], []byte{'C', '5', 'C', 'N', 1, 1, 0, 57}) ||
		!bytes.Equal(frame[8:24], frozen.Attempt[:]) ||
		!bytes.Equal(frame[24:40], frozen.Approval[:]) ||
		!bytes.Equal(frame[40:56], frozen.Registration[:]) || frame[56] != 1 {
		return errCancellationFrame
	}
	return nil
}

var errProcessObservation = errors.New("C5B19_PROCESS_OBSERVATION")

// deriveProcessIdentity is an offline binding calculation only. Its digest
// does not grant PID-targeting or signal authority; that requires exact live
// same-parent custody and an exclusive unreaped child in the Supervisor.
func deriveProcessIdentity(attempt [16]byte, pid uint32, sequence, tick uint64, fixtureDigest [32]byte) ([32]byte, error) {
	if attempt == [16]byte{} || pid == 0 || pid > 1<<31-1 || sequence == 0 || tick == 0 || fixtureDigest == [32]byte{} {
		return [32]byte{}, errProcessObservation
	}
	var fields [20]byte
	binary.BigEndian.PutUint32(fields[0:4], pid)
	binary.BigEndian.PutUint64(fields[4:12], sequence)
	binary.BigEndian.PutUint64(fields[12:20], tick)
	hash := sha256.New()
	hash.Write([]byte("capsule.c5b19.process-identity/v1\x00"))
	hash.Write(attempt[:])
	hash.Write(fields[:])
	hash.Write(fixtureDigest[:])
	var identity [32]byte
	copy(identity[:], hash.Sum(nil))
	return identity, nil
}

type obligationBindings struct {
	Installation [16]byte
	TrustEpoch   [32]byte
	Supervisor   [32]byte
	Attempt      [16]byte
	Approval     [16]byte
	Registration [16]byte
	Plan         [32]byte
	Profile      [32]byte
	Runner       [32]byte
	Preparation  [16]byte
}

var errObligationBinding = errors.New("C5B19_OBLIGATION_BINDING")

// encodeObligationPreimage builds the immutable, cleanup-only v1 obligation
// preimage. Changing policy, trigger mask or bindings requires a new packet.
func encodeObligationPreimage(b obligationBindings) ([]byte, error) {
	ids := [5][16]byte{b.Installation, b.Attempt, b.Approval, b.Registration, b.Preparation}
	digests := [5][32]byte{b.TrustEpoch, b.Supervisor, b.Plan, b.Profile, b.Runner}
	for i, id := range ids {
		if id == [16]byte{} {
			return nil, errObligationBinding
		}
		for j := 0; j < i; j++ {
			if id == ids[j] {
				return nil, errObligationBinding
			}
		}
	}
	for i, digest := range digests {
		if digest == [32]byte{} {
			return nil, errObligationBinding
		}
		for j := 0; j < i; j++ {
			if digest == digests[j] {
				return nil, errObligationBinding
			}
		}
	}
	preimage := make([]byte, 0, 295)
	preimage = append(preimage, []byte("capsule.c5b19.obligation/v1\x00")...)
	preimage = append(preimage, 0, 1)
	preimage = append(preimage, b.Installation[:]...)
	preimage = append(preimage, b.TrustEpoch[:]...)
	preimage = append(preimage, b.Supervisor[:]...)
	preimage = append(preimage, b.Attempt[:]...)
	preimage = append(preimage, b.Approval[:]...)
	preimage = append(preimage, b.Registration[:]...)
	preimage = append(preimage, b.Plan[:]...)
	preimage = append(preimage, b.Profile[:]...)
	preimage = append(preimage, b.Runner[:]...)
	preimage = append(preimage, b.Preparation[:]...)
	var clocks [24]byte
	binary.BigEndian.PutUint64(clocks[0:8], 1000)
	binary.BigEndian.PutUint64(clocks[8:16], 1000)
	binary.BigEndian.PutUint64(clocks[16:24], 1200)
	preimage = append(preimage, clocks[:]...)
	preimage = append(preimage, 0x07)
	return preimage, nil
}

var errWire = errors.New("C5B19_WIRE")

// wireOperation is a copied, structurally valid candidate, not a pending-write
// capability or evidence of storage confirmation. It deliberately has no
// control-state, process, completion or capacity methods.
type wireOperation struct {
	Bindings   obligationBindings
	Obligation [32]byte
	Operation  [16]byte
	Generation uint64
	Kind       byte
	Candidate  [68]byte
}

func decodeRequest(frame []byte, frozen obligationBindings) (wireOperation, error) {
	if len(frame) != 397 || !bytes.Equal(frame[:8], []byte{'C', '5', '1', '9', 1, 1, 1, 141}) {
		return wireOperation{}, errWire
	}
	return decodeWireFields(frame[8:248], frame[248:280], frame[280:296], frame[296:304], frame[304], frame[305:373], frame[373:397], frozen)
}

func decodeRecord(record []byte, frozen obligationBindings) (wireOperation, error) {
	if len(record) != 395 || !bytes.Equal(record[:6], []byte{'C', '5', 'R', '1', 0, 1}) {
		return wireOperation{}, errWire
	}
	return decodeWireFields(record[6:246], record[246:278], record[310:326], record[302:310], record[326], record[327:395], record[278:302], frozen)
}

// Only the fixed-size decoders call this helper. Comparing against the frozen
// immutable preimage validates all bindings, the exact clock policy and the
// immutable obligation digest before accepting any operation fields.
func decodeWireFields(bindings, obligation, operation, generation []byte, kind byte, candidate, policy []byte, frozen obligationBindings) (wireOperation, error) {
	preimage, err := encodeObligationPreimage(frozen)
	if err != nil || !bytes.Equal(bindings, preimage[30:270]) || !bytes.Equal(policy, preimage[270:294]) {
		return wireOperation{}, errWire
	}
	digest := sha256.Sum256(preimage)
	if !bytes.Equal(obligation, digest[:]) {
		return wireOperation{}, errWire
	}
	value := wireOperation{Bindings: frozen, Obligation: digest, Generation: binary.BigEndian.Uint64(generation), Kind: kind}
	copy(value.Operation[:], operation)
	copy(value.Candidate[:], candidate)
	if value.Operation == [16]byte{} || value.Generation == 0 || value.Generation > 1<<53-1 || !validWireCandidate(kind, value.Candidate) {
		return wireOperation{}, errWire
	}
	if (kind == 1 && value.Operation != frozen.Preparation) || (kind != 1 && value.Operation == frozen.Preparation) {
		return wireOperation{}, errWire
	}
	// Freshness, exact predecessor generation and custody require the separate
	// stateful model. Structural decoding makes no claim about those relations.
	return value, nil
}

func validWireCandidate(kind byte, candidate [68]byte) bool {
	if candidate[0] != 1 || candidate[1] > 1 || candidate[66] > 1 || candidate[67] > 2 {
		return false
	}
	runner := [32]byte(candidate[2:34])
	absence := [32]byte(candidate[34:66])
	if (candidate[1] == 1) != (runner != [32]byte{}) {
		return false
	}
	switch kind {
	case 1:
		return candidate == [68]byte{1}
	case 2:
		return candidate[1] == 1 && absence == [32]byte{} && candidate[66] == 0 && candidate[67] == 0
	case 3:
		// Identity publication may have failed before authoritative absence. Such
		// terminal evidence has a zero runner identity but a nonzero absence identity.
		return candidate[66] == 1 && candidate[67] != 0 && absence != [32]byte{} && (candidate[1] == 0 || runner == absence)
	default:
		return false
	}
}

func validateRecordForRequest(record, request []byte, frozen obligationBindings) error {
	req, err := decodeRequest(request, frozen)
	if err != nil {
		return err
	}
	rec, err := decodeRecord(record, frozen)
	if err != nil {
		return err
	}
	if req != rec {
		return errWire
	}
	return nil
}

// validateReply checks wire correspondence only. Even a confirmed outcome does
// not establish fsync/rename success, live custody, start or release authority.
func validateReply(reply, request []byte, frozen obligationBindings) (byte, error) {
	req, err := decodeRequest(request, frozen)
	if err != nil {
		return 0, err
	}
	if len(reply) != 98 || !bytes.Equal(reply[:8], []byte{'C', '5', '1', '9', 1, 2, 0, 98}) ||
		!bytes.Equal(reply[8:24], req.Operation[:]) || binary.BigEndian.Uint64(reply[24:32]) != req.Generation || reply[32] != req.Kind {
		return 0, errWire
	}
	requestHash := sha256.Sum256(request[8:])
	if !bytes.Equal(reply[33:65], requestHash[:]) {
		return 0, errWire
	}
	outcome := reply[65]
	var expectedDigest [32]byte
	switch outcome {
	case 1:
		// The validated request's exact fields are reordered into the frozen record
		// schema; no struct serialization, native padding or extra authority fields.
		var record [395]byte
		copy(record[:6], []byte{'C', '5', 'R', '1', 0, 1})
		copy(record[6:246], request[8:248])
		copy(record[246:278], req.Obligation[:])
		copy(record[278:302], request[373:397])
		binary.BigEndian.PutUint64(record[302:310], req.Generation)
		copy(record[310:326], req.Operation[:])
		record[326] = req.Kind
		copy(record[327:395], req.Candidate[:])
		expectedDigest = sha256.Sum256(record[:])
	case 2, 3:
		// Failed/indeterminate bytes remain uncertainty, including after a record
		// became present. Never promote presence to confirmed publication.
	default:
		return 0, errWire
	}
	if !bytes.Equal(reply[66:98], expectedDigest[:]) {
		return 0, errWire
	}
	return outcome, nil
}

var errWriteHistory = errors.New("C5B19_WRITE_HISTORY")

type writeSettlement struct {
	Operation wireOperation
	Outcome   byte
}

// All snapshot fields are values. Confirmed is an offline claimed write fact;
// it supplies no custody, timing, start, completion or capacity authority.
type writeHistorySnapshot struct {
	Pending            bool
	PendingOperation   wireOperation
	LastSettledPresent bool
	LastSettled        writeSettlement
	Confirmed          [68]byte
}

// writeHistory is bounded to one synthetic attempt and its three possible writes.
// It is not the control model, a store, or a live Supervisor. There is no reset,
// record-loading, timeout or implicit settlement path.
type writeHistory struct {
	initialized    bool
	frozen         obligationBindings
	state          writeHistorySnapshot
	pendingRequest [397]byte
	usedIDs        [3][16]byte
	usedCount      uint8
	attempted      [4]bool
	runnerAttempt  [32]byte
}

func newWriteHistory(frozen obligationBindings) (*writeHistory, error) {
	if _, err := encodeObligationPreimage(frozen); err != nil {
		return nil, errWriteHistory
	}
	return &writeHistory{initialized: true, frozen: frozen}, nil
}

func (h *writeHistory) snapshot() writeHistorySnapshot {
	if h == nil {
		return writeHistorySnapshot{}
	}
	return h.state
}

// begin records one submitted byte candidate, not permission to submit an actual
// operation. Every refusal leaves all accepted history and pending bytes intact.
func (h *writeHistory) begin(request []byte) error {
	if h == nil || !h.initialized {
		return errWriteHistory
	}
	if h.state.Pending {
		return errWriteHistory
	}
	op, err := decodeRequest(request, h.frozen)
	if err != nil {
		return errWriteHistory
	}
	nextGeneration := uint64(1)
	if h.state.LastSettledPresent {
		nextGeneration = h.state.LastSettled.Operation.Generation + 1
	}
	if op.Generation != nextGeneration {
		return errWriteHistory
	}
	if h.usedCount >= 3 || h.attempted[op.Kind] || h.attempted[3] {
		return errWriteHistory
	}
	for _, used := range h.usedIDs[:h.usedCount] {
		if op.Operation == used {
			return errWriteHistory
		}
	}
	if op.Kind == 1 {
		if h.usedCount != 0 {
			return errWriteHistory
		}
	} else if h.state.Confirmed[0] != 1 {
		return errWriteHistory
	}
	if op.Kind == 3 {
		// Preserve the exact prepared/confirmed-runner prefix, including uncertainty
		// after runner publication failed. The request parser checks terminal shape.
		if !bytes.Equal(op.Candidate[:34], h.state.Confirmed[:34]) {
			return errWriteHistory
		}
		// An attempted runner's identity remains the sole modeled process even when
		// its publication was uncertain. Skipping runner publication has no observed
		// process identity here; a future trace/control model must establish custody.
		if h.attempted[2] && [32]byte(op.Candidate[34:66]) != h.runnerAttempt {
			return errWriteHistory
		}
	}
	// No state mutation occurs until every structural/history check has passed.
	h.usedIDs[h.usedCount] = op.Operation
	h.usedCount++
	h.attempted[op.Kind] = true
	if op.Kind == 2 {
		h.runnerAttempt = [32]byte(op.Candidate[2:34])
	}
	copy(h.pendingRequest[:], request)
	h.state.Pending = true
	h.state.PendingOperation = op
	return nil
}

// applyReply represents a simulated accepted control application, not worker
// arrival or observed fsync. It matches only the privately copied pending request;
// callers cannot substitute request/candidate/record bytes at settlement time.
func (h *writeHistory) applyReply(reply []byte) error {
	if h == nil || !h.initialized || !h.state.Pending {
		return errWriteHistory
	}
	outcome, err := validateReply(reply, h.pendingRequest[:], h.frozen)
	if err != nil {
		return errWriteHistory
	}
	pending := h.state.PendingOperation
	h.state.LastSettledPresent = true
	h.state.LastSettled = writeSettlement{Operation: pending, Outcome: outcome}
	if outcome == 1 {
		h.state.Confirmed = pending.Candidate
	}
	h.state.Pending = false
	h.state.PendingOperation = wireOperation{}
	h.pendingRequest = [397]byte{}
	return nil
}

var errEventEnvelope = errors.New("C5B19_EVENT_ENVELOPE")

// eventEnvelope is a copied syntactic record, not a semantically valid event or
// case verdict. Kind-specific fields, lane ownership, frame pairing, causality
// and timing still require the future full oracle. In particular, decoding a
// trace-fault or containment event never makes it passing Supervisor evidence.
type eventEnvelope struct {
	Lane              byte
	Kind              uint16
	Sequence          uint64
	Tick              uint64
	AuxiliaryTick     uint64
	Numerator         uint32
	Denominator       uint32
	BindingDigest     [32]byte
	Operation         [16]byte
	Generation        uint64
	RequestDigest     [32]byte
	ProcessIdentity   [32]byte
	PID               uint32
	SyscallResult     int32
	Errno             int32
	Flags             uint32
	WaitStatus        uint32
	Outcome           byte
	ApplicationResult byte
	RecordDigest      [32]byte
	CandidateDigest   [32]byte
}

func decodeEventEnvelope(raw []byte, frozen obligationBindings, numer, denom uint32) (eventEnvelope, error) {
	if len(raw) != 256 || !bytes.Equal(raw[:5], []byte{'C', '5', 'E', 'V', 1}) ||
		raw[5] < 1 || raw[5] > 3 || numer == 0 || denom == 0 {
		return eventEnvelope{}, errEventEnvelope
	}
	kind := binary.BigEndian.Uint16(raw[6:8])
	if kind < 1 || kind > 29 || raw[180] > 3 || raw[181] > 2 ||
		binary.BigEndian.Uint32(raw[32:36]) != numer || binary.BigEndian.Uint32(raw[36:40]) != denom ||
		[10]byte(raw[246:256]) != [10]byte{} {
		return eventEnvelope{}, errEventEnvelope
	}
	preimage, err := encodeObligationPreimage(frozen)
	if err != nil {
		return eventEnvelope{}, errEventEnvelope
	}
	// The event binds only the packet's exact 240-byte Bindings, excluding the
	// obligation's domain/version, clock policy and trigger mask.
	bindingDigest := sha256.Sum256(preimage[30:270])
	if [32]byte(raw[40:72]) != bindingDigest {
		return eventEnvelope{}, errEventEnvelope
	}
	return eventEnvelope{
		Lane: raw[5], Kind: kind,
		Sequence: binary.BigEndian.Uint64(raw[8:16]), Tick: binary.BigEndian.Uint64(raw[16:24]),
		AuxiliaryTick: binary.BigEndian.Uint64(raw[24:32]), Numerator: numer, Denominator: denom,
		BindingDigest: bindingDigest, Operation: [16]byte(raw[72:88]),
		Generation: binary.BigEndian.Uint64(raw[88:96]), RequestDigest: [32]byte(raw[96:128]),
		ProcessIdentity: [32]byte(raw[128:160]), PID: binary.BigEndian.Uint32(raw[160:164]),
		SyscallResult: int32(binary.BigEndian.Uint32(raw[164:168])), Errno: int32(binary.BigEndian.Uint32(raw[168:172])),
		Flags: binary.BigEndian.Uint32(raw[172:176]), WaitStatus: binary.BigEndian.Uint32(raw[176:180]),
		Outcome: raw[180], ApplicationResult: raw[181],
		RecordDigest: [32]byte(raw[182:214]), CandidateDigest: [32]byte(raw[214:246]),
	}, nil
}

// validateLaneEnvelope checks only finite framing and common fields. The trusted
// caller supplies firstSequence because Gate2 does not freeze a writer origin;
// it is never inferred from untrusted records. Success cannot prove capture
// completeness, correct kind ownership or any causal/timing/lifecycle claim.
// No history is settled and no watermark is shared with another invocation/lane.
func validateLaneEnvelope(raw []byte, expectedLane byte, firstSequence uint64, frozen obligationBindings, numer, denom uint32) error {
	var capacity int
	switch expectedLane {
	case 1:
		capacity = 32768
	case 2:
		capacity = 1024
	case 3:
		capacity = 64
	default:
		return errEventEnvelope
	}
	if len(raw) == 0 || len(raw)%256 != 0 || len(raw)/256 > capacity {
		return errEventEnvelope
	}
	count := len(raw) / 256
	if uint64(count-1) > ^uint64(0)-firstSequence {
		return errEventEnvelope
	}
	var previousTick uint64
	for index := 0; index < count; index++ {
		event, err := decodeEventEnvelope(raw[index*256:(index+1)*256], frozen, numer, denom)
		if err != nil || event.Lane != expectedLane || event.Sequence != firstSequence+uint64(index) {
			return errEventEnvelope
		}
		if expectedLane == 1 && index > 0 && event.Tick < previousTick {
			return errEventEnvelope
		}
		previousTick = event.Tick
	}
	return nil
}

var errEventFields = errors.New("C5B19_EVENT_FIELDS")

type eventFieldMask uint16

const (
	fieldAuxiliary eventFieldMask = 1 << iota
	fieldOperation
	fieldGeneration
	fieldRequest
	fieldIdentity
	fieldPID
	fieldResult
	fieldErrno
	fieldSite
	fieldWaitStatus
	fieldOutcome
	fieldApplication
	fieldRecord
	fieldCandidate

	tupleFields    = fieldOperation | fieldGeneration | fieldRequest | fieldCandidate
	identityFields = fieldIdentity | fieldPID
	syscallFields  = fieldResult | fieldErrno
	replyFields    = fieldOutcome | fieldRecord
)

// decodeEventFields opts into the table-defined local shapes after common
// envelope validation. It does not check lane sequences, sidecars, causal pairs,
// syscall semantics, terminal wait status, timing or any actual lifecycle fact.
// Kind29 supports only the payload-free subset; the optional harness identity
// mapping remains unspecified. Kind8 supports complete represented replies for
// both decisions, not arbitrary malformed-reply diagnostic encodings.
func decodeEventFields(raw []byte, frozen obligationBindings, numer, denom uint32) (eventEnvelope, error) {
	event, err := decodeEventEnvelope(raw, frozen, numer, denom)
	if err != nil {
		return eventEnvelope{}, err
	}
	// Lane zero means any known lane, solely for the lane-local trace-fault kind.
	// Unlisted non-common fields are forbidden, even when their values would be
	// meaningful for another kind. No successful return is a trace/case verdict.
	shapes := [30]struct {
		lane   byte
		fields eventFieldMask
	}{
		1:  {1, 0},                                                // endpoint-created
		2:  {1, fieldAuxiliary},                                   // setup-check
		3:  {1, tupleFields},                                      // write-request
		4:  {1, tupleFields | syscallFields},                      // request-write-result
		5:  {2, tupleFields | replyFields},                        // worker-reply
		6:  {2, tupleFields | syscallFields | replyFields},        // worker-reply-write-result
		7:  {1, tupleFields | replyFields},                        // control-reply-received
		8:  {1, tupleFields | replyFields | fieldApplication},     // control-reply-applied
		9:  {1, 0},                                                // spawn-call
		10: {1, fieldPID | syscallFields},                         // spawn-result
		11: {1, identityFields},                                   // identity-frozen
		12: {1, 0},                                                // cancel-ingress
		13: {1, 0},                                                // start-admission
		14: {1, 0},                                                // start-token-call
		15: {1, syscallFields},                                    // start-token-result
		16: {1, fieldAuxiliary},                                   // start-post-service
		17: {1, fieldAuxiliary},                                   // wall-service
		18: {1, 0},                                                // fatal-service
		19: {1, fieldAuxiliary},                                   // stop-latch
		20: {1, identityFields},                                   // signal-latch
		21: {1, identityFields},                                   // signal-call
		22: {1, identityFields | syscallFields},                   // signal-result
		23: {1, identityFields},                                   // wait-call
		24: {1, identityFields | syscallFields | fieldWaitStatus}, // wait-result
		25: {1, identityFields},                                   // absence (status belongs to24)
		26: {2, tupleFields | fieldSite},                          // store-edge
		27: {2, tupleFields | fieldOutcome},                       // store-outcome: no record digest
		28: {0, 0},                                                // lane-local trace-fault
		29: {3, 0},                                                // payload-free harness-containment
	}
	shape := shapes[event.Kind] // envelope already closed the kind range to1–29
	if shape.lane != 0 && event.Lane != shape.lane {
		return eventEnvelope{}, errEventFields
	}
	var present eventFieldMask
	for _, field := range [...]struct {
		mask    eventFieldMask
		nonzero bool
	}{
		{fieldAuxiliary, event.AuxiliaryTick != 0},
		{fieldOperation, event.Operation != [16]byte{}},
		{fieldGeneration, event.Generation != 0},
		{fieldRequest, event.RequestDigest != [32]byte{}},
		{fieldIdentity, event.ProcessIdentity != [32]byte{}},
		{fieldPID, event.PID != 0},
		{fieldResult, event.SyscallResult != 0},
		{fieldErrno, event.Errno != 0},
		{fieldSite, event.Flags != 0},
		{fieldWaitStatus, event.WaitStatus != 0},
		{fieldOutcome, event.Outcome != 0},
		{fieldApplication, event.ApplicationResult != 0},
		{fieldRecord, event.RecordDigest != [32]byte{}},
		{fieldCandidate, event.CandidateDigest != [32]byte{}},
	} {
		if field.nonzero {
			present |= field.mask
		}
	}
	if present & ^shape.fields != 0 {
		return eventEnvelope{}, errEventFields
	}
	if shape.fields&tupleFields != 0 &&
		(present&tupleFields != tupleFields || event.Generation > 1<<53-1) {
		return eventEnvelope{}, errEventFields
	}
	if event.PID > 1<<31-1 || (shape.fields&fieldIdentity != 0 && present&identityFields != identityFields) {
		return eventEnvelope{}, errEventFields
	}
	if (shape.fields&fieldOutcome != 0 && event.Outcome == 0) ||
		(shape.fields&fieldApplication != 0 && event.ApplicationResult == 0) {
		return eventEnvelope{}, errEventFields
	}
	if shape.fields&fieldRecord != 0 && (event.Outcome == 1) != (event.RecordDigest != [32]byte{}) {
		return eventEnvelope{}, errEventFields
	}
	if shape.fields&fieldSite != 0 && (event.Flags < 1 || event.Flags > 4) {
		return eventEnvelope{}, errEventFields
	}
	// A zero status is representable. Nonzero status requires a matching target
	// return, but this neither interprets Darwin status bits nor proves absence.
	if event.WaitStatus != 0 && event.SyscallResult != int32(event.PID) {
		return eventEnvelope{}, errEventFields
	}
	return event, nil
}

var errCapturedFrame = errors.New("C5B19_CAPTURED_FRAME")

// capturedFramePair is an in-memory selection, not a serialized sidecar format.
// For kind3, Request is the captured control request and Reply must be empty.
// For kinds5/7, Request is decoding context, not proof of worker receipt or a
// captured kind3 event. The caller owns these bytes; validation retains none.
type capturedFramePair struct {
	Event   []byte
	Request []byte
	Reply   []byte
}

// validateCapturedFrame checks represented well-formed bytes only. Success is
// not control application, durable publication, a passing trace or authority.
func validateCapturedFrame(pair capturedFramePair, frozen obligationBindings, numer, denom uint32) error {
	event, err := decodeEventFields(pair.Event, frozen, numer, denom)
	if err != nil || (event.Kind != 3 && event.Kind != 5 && event.Kind != 7) {
		return errCapturedFrame
	}
	request, err := decodeRequest(pair.Request, frozen)
	if err != nil {
		return errCapturedFrame
	}
	if event.Operation != request.Operation || event.Generation != request.Generation ||
		event.RequestDigest != sha256.Sum256(pair.Request[8:]) ||
		event.CandidateDigest != sha256.Sum256(request.Candidate[:]) {
		return errCapturedFrame
	}
	if event.Kind == 3 {
		if len(pair.Reply) != 0 {
			return errCapturedFrame
		}
		return nil
	}
	outcome, err := validateReply(pair.Reply, pair.Request, frozen)
	if err != nil || event.Outcome != outcome || event.RecordDigest != [32]byte(pair.Reply[66:98]) {
		return errCapturedFrame
	}
	return nil
}

// validateCapturedFrames checks only supplied pairs: at most three per supported
// category and three distinct operation anchors for one attempt. An omitted
// entire pair cannot be detected. No full round trip, lane sequence, causal or
// timing order is required or established, and an empty selection is no evidence.
// In particular, this never applies kind8 or changes writeHistory.
func validateCapturedFrames(pairs []capturedFramePair, frozen obligationBindings, numer, denom uint32) error {
	if _, err := encodeObligationPreimage(frozen); err != nil || numer == 0 || denom == 0 || len(pairs) > 9 {
		return errCapturedFrame
	}
	var events [9]eventEnvelope
	var counts [8]byte
	unique := 0
	for i, pair := range pairs {
		if err := validateCapturedFrame(pair, frozen, numer, denom); err != nil {
			return err
		}
		// The pair validator already verified every event byte and closed kinds.
		event, _ := decodeEventFields(pair.Event, frozen, numer, denom)
		counts[event.Kind]++
		if counts[event.Kind] > 3 {
			return errCapturedFrame
		}
		seen := false
		for j := 0; j < i; j++ {
			if events[j].Operation != event.Operation {
				continue
			}
			seen = true
			if events[j].Kind == event.Kind || !bytes.Equal(pairs[j].Request, pair.Request) {
				return errCapturedFrame
			}
			if event.Kind != 3 && events[j].Kind != 3 && !bytes.Equal(pairs[j].Reply, pair.Reply) {
				return errCapturedFrame
			}
		}
		if !seen {
			unique++
			if unique > 3 {
				return errCapturedFrame
			}
		}
		events[i] = event
	}
	return nil
}
