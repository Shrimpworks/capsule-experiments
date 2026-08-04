package conformance

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
)

type FixtureCase struct {
	Name                    string          `json:"name"`
	EndpointRole            Role            `json:"endpointRole"`
	ExpectedDisposition     Disposition     `json:"expectedDisposition"`
	RunnerLifecycle         RunnerLifecycle `json:"runnerLifecycle,omitempty"`
	ExpectedOrdinarySuccess bool            `json:"expectedOrdinarySuccess"`
	Bytes                   []byte          `json:"-"`
}

func CandidateBinding() Binding {
	return Binding{
		AttemptID:            filled16(0x11),
		RegistrationID:       filled16(0x22),
		PlanDigest:           filled32(0x33),
		RuntimeProfileDigest: filled32(0x44),
	}
}

func CandidateExpectedBinding() ExpectedBinding {
	stale := filled16(0x55)
	return ExpectedBinding{
		Binding:         CandidateBinding(),
		StaleAttemptIDs: map[[16]byte]struct{}{stale: {}},
	}
}

func CandidateFixtures() []FixtureCase {
	binding := CandidateBinding()
	expected := CandidateExpectedBinding()
	_ = expected

	sourceExact, _ := EncodeData(RoleSource, binding, bytes.Repeat([]byte{'s'}, int(SourcePayloadMax)))
	inputExact, _ := EncodeData(RoleInput, binding, bytes.Repeat([]byte{'i'}, int(CanonicalInputMax)))
	sourceSmall, _ := EncodeData(RoleSource, binding, []byte("export default 1;\n"))
	inputSmall, _ := EncodeData(RoleInput, binding, []byte(`{"value":1}`))
	completion, _ := EncodeCompletion(binding, StatusSucceeded, []byte(`{"value":1}`))
	maxJSON := append([]byte{'"'}, bytes.Repeat([]byte{'j'}, int(InlineJSONPayloadMax)-2)...)
	maxJSON = append(maxJSON, '"')
	completionExact, _ := EncodeCompletion(binding, StatusSucceeded, maxJSON)
	trailer := append([]byte(nil), completion[len(completion)-CommitTrailerLength:]...)

	wrongAttemptID := filled16(0x66)
	staleAttemptID := filled16(0x55)
	wrongRegistrationID := filled16(0x77)
	wrongPlanDigest := filled32(0x77)
	wrongProfileDigest := filled32(0x88)
	wrongCommitAttemptID := filled16(0x99)
	wrongAttempt := mutateBinding(sourceSmall, 16, wrongAttemptID[:])
	staleAttempt := mutateBinding(sourceSmall, 16, staleAttemptID[:])
	wrongRegistration := mutateBinding(sourceSmall, 32, wrongRegistrationID[:])
	wrongPlan := mutateBinding(sourceSmall, 48, wrongPlanDigest[:])
	wrongProfile := mutateBinding(sourceSmall, 80, wrongProfileDigest[:])
	duplicateIDs := mutateBinding(sourceSmall, 32, binding.AttemptID[:])
	completionWrongAttempt := mutateBinding(completion, 16, wrongAttemptID[:])
	completionStaleAttempt := mutateBinding(completion, 16, staleAttemptID[:])
	completionWrongRegistration := mutateBinding(completion, 32, wrongRegistrationID[:])
	completionWrongPlan := mutateBinding(completion, 48, wrongPlanDigest[:])
	completionWrongProfile := mutateBinding(completion, 80, wrongProfileDigest[:])

	declaredLong := append([]byte(nil), completion...)
	binary.BigEndian.PutUint64(declaredLong[112:120], 100)

	unknownStatus := append([]byte(nil), completion...)
	binary.BigEndian.PutUint16(unknownStatus[152:154], 99)

	badPayloadDigest := append([]byte(nil), completion...)
	badPayloadDigest[CompletionHeaderLength] ^= 1

	badCommitDigest := append([]byte(nil), completion...)
	badCommitDigest[len(badCommitDigest)-1] ^= 1

	wrongCommitAttempt := append([]byte(nil), completion...)
	copy(wrongCommitAttempt[len(wrongCommitAttempt)-48:len(wrongCommitAttempt)-32], wrongCommitAttemptID[:])

	inputOnSource, _ := EncodeData(RoleInput, binding, []byte(`{"value":1}`))
	malformedJSON, _ := EncodeCompletion(binding, StatusSucceeded, []byte(`{"value":]`))
	duplicateJSONKey, _ := EncodeCompletion(binding, StatusSucceeded, []byte(`{"value":1,"value":2}`))
	secondJSONDocument, _ := EncodeCompletion(binding, StatusSucceeded, []byte(`{} {}`))
	nonSuccessPayload := rawCompletion(binding, StatusWorkloadFailed, []byte(`{"error":"guest text"}`))
	overSource := rawData(RoleSource, binding, bytes.Repeat([]byte{'s'}, int(SourcePayloadMax)+1))
	overInput := rawData(RoleInput, binding, bytes.Repeat([]byte{'i'}, int(CanonicalInputMax)+1))
	overJSON := append([]byte{'"'}, bytes.Repeat([]byte{'j'}, int(InlineJSONPayloadMax)-1)...)
	overJSON = append(overJSON, '"')
	overCompletion := rawCompletion(binding, StatusSucceeded, overJSON)

	return []FixtureCase{
		{Name: "source-small-accept", EndpointRole: RoleSource, ExpectedDisposition: Accept, Bytes: sourceSmall},
		{Name: "source-payload-exact", EndpointRole: RoleSource, ExpectedDisposition: Accept, Bytes: sourceExact},
		{Name: "source-payload-cap-plus-one", EndpointRole: RoleSource, ExpectedDisposition: Oversize, Bytes: overSource},
		{Name: "source-truncated", EndpointRole: RoleSource, ExpectedDisposition: Truncated, Bytes: sourceSmall[:len(sourceSmall)-1]},
		{Name: "source-duplicate-frame", EndpointRole: RoleSource, ExpectedDisposition: DuplicateFrame, Bytes: append(append([]byte(nil), sourceSmall...), sourceSmall...)},
		{Name: "source-wrong-attempt", EndpointRole: RoleSource, ExpectedDisposition: BindingMismatch, Bytes: wrongAttempt},
		{Name: "source-stale-attempt", EndpointRole: RoleSource, ExpectedDisposition: Stale, Bytes: staleAttempt},
		{Name: "source-wrong-registration", EndpointRole: RoleSource, ExpectedDisposition: BindingMismatch, Bytes: wrongRegistration},
		{Name: "source-wrong-plan", EndpointRole: RoleSource, ExpectedDisposition: BindingMismatch, Bytes: wrongPlan},
		{Name: "source-wrong-profile", EndpointRole: RoleSource, ExpectedDisposition: BindingMismatch, Bytes: wrongProfile},
		{Name: "source-duplicate-role-ids", EndpointRole: RoleSource, ExpectedDisposition: WrongDomain, Bytes: duplicateIDs},
		{Name: "input-small-accept", EndpointRole: RoleInput, ExpectedDisposition: Accept, Bytes: inputSmall},
		{Name: "input-payload-exact", EndpointRole: RoleInput, ExpectedDisposition: Accept, Bytes: inputExact},
		{Name: "input-payload-cap-plus-one", EndpointRole: RoleInput, ExpectedDisposition: Oversize, Bytes: overInput},
		{Name: "input-swapped-onto-source", EndpointRole: RoleSource, ExpectedDisposition: WrongDomain, Bytes: inputOnSource},
		{Name: "completion-small-accept", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Accept, ExpectedOrdinarySuccess: true, Bytes: completion},
		{Name: "completion-json-exact", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Accept, ExpectedOrdinarySuccess: true, Bytes: completionExact},
		{Name: "completion-physical-cap-plus-one", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Oversize, Bytes: append(append([]byte(nil), completionExact...), 0)},
		{Name: "completion-json-cap-plus-one", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Oversize, Bytes: overCompletion},
		{Name: "completion-truncated-payload", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Truncated, Bytes: completion[:CompletionHeaderLength+2]},
		{Name: "completion-malformed-length-early-trailer", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: EarlyCommit, Bytes: declaredLong},
		{Name: "completion-malformed-json", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: InvalidJSON, Bytes: malformedJSON},
		{Name: "completion-json-duplicate-key", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: InvalidJSON, Bytes: duplicateJSONKey},
		{Name: "completion-json-second-document", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: InvalidJSON, Bytes: secondJSONDocument},
		{Name: "completion-unknown-status", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: MalformedHeader, Bytes: unknownStatus},
		{Name: "completion-nonsuccess-nonnull", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: InvalidJSON, Bytes: nonSuccessPayload},
		{Name: "completion-bad-payload-digest", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BadDigest, Bytes: badPayloadDigest},
		{Name: "completion-bad-commit-digest", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BadDigest, Bytes: badCommitDigest},
		{Name: "completion-wrong-commit-attempt", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BindingMismatch, Bytes: wrongCommitAttempt},
		{Name: "completion-wrong-attempt", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BindingMismatch, Bytes: completionWrongAttempt},
		{Name: "completion-stale-attempt", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: Stale, Bytes: completionStaleAttempt},
		{Name: "completion-wrong-registration", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BindingMismatch, Bytes: completionWrongRegistration},
		{Name: "completion-wrong-plan", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BindingMismatch, Bytes: completionWrongPlan},
		{Name: "completion-wrong-profile", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: BindingMismatch, Bytes: completionWrongProfile},
		{Name: "completion-source-role-swap", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: WrongDomain, Bytes: sourceSmall},
		{Name: "completion-early-trailer", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: EarlyCommit, Bytes: trailer},
		{Name: "completion-missing-trailer", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: MissingCommit, Bytes: completion[:len(completion)-CommitTrailerLength]},
		{Name: "completion-duplicate-trailer", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: DuplicateCommit, Bytes: append(append([]byte(nil), completion...), trailer...)},
		{Name: "completion-trailing-data", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: TrailingData, Bytes: append(append([]byte(nil), completion...), 0xaa)},
		{Name: "completion-duplicate-frame", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: DuplicateFrame, Bytes: append(append([]byte(nil), completion...), completion...)},
		{Name: "completion-runner-zero-without-commit", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCleanExit, ExpectedDisposition: MissingCommit, Bytes: completion[:len(completion)-CommitTrailerLength]},
		{Name: "completion-crash-before-commit", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCrash, ExpectedDisposition: MissingCommit, Bytes: completion[:len(completion)-CommitTrailerLength]},
		{Name: "completion-crash-after-commit", EndpointRole: RoleCompletion, RunnerLifecycle: RunnerCrash, ExpectedDisposition: Accept, ExpectedOrdinarySuccess: false, Bytes: completion},
	}
}

func mutateBinding(frame []byte, offset int, value []byte) []byte {
	mutated := append([]byte(nil), frame...)
	copy(mutated[offset:offset+len(value)], value)
	return mutated
}

func rawData(role Role, binding Binding, payload []byte) []byte {
	frame := make([]byte, DataHeaderLength+len(payload))
	magic := magicForRole(role)
	copy(frame[0:8], magic[:])
	binary.BigEndian.PutUint16(frame[8:10], Version)
	binary.BigEndian.PutUint16(frame[10:12], uint16(role))
	binary.BigEndian.PutUint32(frame[12:16], DataHeaderLength)
	copy(frame[16:32], binding.AttemptID[:])
	copy(frame[32:48], binding.RegistrationID[:])
	copy(frame[48:80], binding.PlanDigest[:])
	copy(frame[80:112], binding.RuntimeProfileDigest[:])
	binary.BigEndian.PutUint64(frame[112:120], uint64(len(payload)))
	digest := sha256.Sum256(payload)
	copy(frame[120:152], digest[:])
	copy(frame[152:], payload)
	return frame
}

func rawCompletion(binding Binding, status TerminalStatus, payload []byte) []byte {
	frame := make([]byte, CompletionHeaderLength+len(payload)+CommitTrailerLength)
	copy(frame[0:8], magicCompletion[:])
	binary.BigEndian.PutUint16(frame[8:10], Version)
	binary.BigEndian.PutUint16(frame[10:12], uint16(RoleCompletion))
	binary.BigEndian.PutUint32(frame[12:16], CompletionHeaderLength)
	copy(frame[16:32], binding.AttemptID[:])
	copy(frame[32:48], binding.RegistrationID[:])
	copy(frame[48:80], binding.PlanDigest[:])
	copy(frame[80:112], binding.RuntimeProfileDigest[:])
	binary.BigEndian.PutUint64(frame[112:120], uint64(len(payload)))
	payloadDigest := sha256.Sum256(payload)
	copy(frame[120:152], payloadDigest[:])
	binary.BigEndian.PutUint16(frame[152:154], uint16(status))
	copy(frame[CompletionHeaderLength:], payload)
	offset := CompletionHeaderLength + len(payload)
	trailer := frame[offset:]
	copy(trailer[0:8], magicCommit[:])
	binary.BigEndian.PutUint16(trailer[8:10], Version)
	binary.BigEndian.PutUint16(trailer[10:12], CommitTrailerLength)
	binary.BigEndian.PutUint16(trailer[12:14], uint16(RoleCompletion))
	copy(trailer[16:32], binding.AttemptID[:])
	digest := sha256.Sum256(frame[:offset])
	copy(trailer[32:64], digest[:])
	return frame
}

func filled16(value byte) [16]byte {
	var result [16]byte
	for index := range result {
		result[index] = value
	}
	return result
}

func filled32(value byte) [32]byte {
	var result [32]byte
	for index := range result {
		result[index] = value
	}
	return result
}
