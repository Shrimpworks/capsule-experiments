// Package conformance is a development-only, backend-independent framing experiment.
// It is not a Capsule product package or a frozen wire contract.
package conformance

const (
	Version uint16 = 1

	SourcePayloadMax       uint64 = 1_048_576
	CanonicalInputMax      uint64 = 262_144
	InlineJSONPayloadMax   uint64 = 262_144
	DataHeaderLength              = 152
	CompletionHeaderLength        = 160
	CommitTrailerLength           = 64

	SourcePhysicalMax     uint64 = DataHeaderLength + SourcePayloadMax
	InputPhysicalMax      uint64 = DataHeaderLength + CanonicalInputMax
	CompletionPhysicalMax uint64 = CompletionHeaderLength + InlineJSONPayloadMax + CommitTrailerLength
)

type Role uint16

const (
	RoleSource     Role = 1
	RoleInput      Role = 2
	RoleCompletion Role = 3
)

type TerminalStatus uint16

const (
	StatusSucceeded       TerminalStatus = 1
	StatusWorkloadFailed  TerminalStatus = 2
	StatusResultInvalid   TerminalStatus = 3
	StatusChildTerminated TerminalStatus = 4
)

var (
	magicSource     = [8]byte{'C', 'A', 'P', 'S', 'R', 'C', '0', '1'}
	magicInput      = [8]byte{'C', 'A', 'P', 'I', 'N', 'P', '0', '1'}
	magicCompletion = [8]byte{'C', 'A', 'P', 'C', 'M', 'P', '0', '1'}
	magicCommit     = [8]byte{'C', 'A', 'P', 'C', 'M', 'T', '0', '1'}
)

type Binding struct {
	AttemptID            [16]byte
	RegistrationID       [16]byte
	PlanDigest           [32]byte
	RuntimeProfileDigest [32]byte
}

type ExpectedBinding struct {
	Binding
	StaleAttemptIDs map[[16]byte]struct{}
}

func PayloadMaximum(role Role) uint64 {
	switch role {
	case RoleSource:
		return SourcePayloadMax
	case RoleInput:
		return CanonicalInputMax
	case RoleCompletion:
		return InlineJSONPayloadMax
	default:
		return 0
	}
}

func PhysicalMaximum(role Role) uint64 {
	switch role {
	case RoleSource:
		return SourcePhysicalMax
	case RoleInput:
		return InputPhysicalMax
	case RoleCompletion:
		return CompletionPhysicalMax
	default:
		return 0
	}
}
