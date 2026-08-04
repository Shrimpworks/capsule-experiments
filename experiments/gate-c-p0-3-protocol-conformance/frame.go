package conformance

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
)

var (
	ErrUnknownRole       = errors.New("unknown role")
	ErrPayloadTooLarge   = errors.New("payload exceeds role maximum")
	ErrInvalidBinding    = errors.New("binding identifiers must be nonzero and role-distinct")
	ErrInvalidStatus     = errors.New("unknown terminal status")
	ErrNonSuccessPayload = errors.New("non-success completion payload must be exactly null")
)

func EncodeData(role Role, binding Binding, payload []byte) ([]byte, error) {
	if role != RoleSource && role != RoleInput {
		return nil, ErrUnknownRole
	}
	if uint64(len(payload)) > PayloadMaximum(role) {
		return nil, ErrPayloadTooLarge
	}
	if !validBindingShape(binding) {
		return nil, ErrInvalidBinding
	}

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
	copy(frame[DataHeaderLength:], payload)
	return frame, nil
}

func EncodeCompletion(binding Binding, status TerminalStatus, payload []byte) ([]byte, error) {
	if uint64(len(payload)) > InlineJSONPayloadMax {
		return nil, ErrPayloadTooLarge
	}
	if !validBindingShape(binding) {
		return nil, ErrInvalidBinding
	}
	if !validTerminalStatus(status) {
		return nil, ErrInvalidStatus
	}
	if status != StatusSucceeded && !bytes.Equal(payload, []byte("null")) {
		return nil, ErrNonSuccessPayload
	}

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
	// 154:160 are flags and reserved bytes and remain zero in version 1.
	copy(frame[CompletionHeaderLength:], payload)

	trailerOffset := CompletionHeaderLength + len(payload)
	trailer := frame[trailerOffset:]
	copy(trailer[0:8], magicCommit[:])
	binary.BigEndian.PutUint16(trailer[8:10], Version)
	binary.BigEndian.PutUint16(trailer[10:12], CommitTrailerLength)
	binary.BigEndian.PutUint16(trailer[12:14], uint16(RoleCompletion))
	// 14:16 are reserved and remain zero in version 1.
	copy(trailer[16:32], binding.AttemptID[:])
	frameDigest := sha256.Sum256(frame[:trailerOffset])
	copy(trailer[32:64], frameDigest[:])
	return frame, nil
}

func magicForRole(role Role) [8]byte {
	switch role {
	case RoleSource:
		return magicSource
	case RoleInput:
		return magicInput
	case RoleCompletion:
		return magicCompletion
	default:
		return [8]byte{}
	}
}

func validBindingShape(binding Binding) bool {
	return !allZero(binding.AttemptID[:]) &&
		!allZero(binding.RegistrationID[:]) &&
		!bytes.Equal(binding.AttemptID[:], binding.RegistrationID[:])
}

func allZero(value []byte) bool {
	for _, b := range value {
		if b != 0 {
			return false
		}
	}
	return true
}

func validTerminalStatus(status TerminalStatus) bool {
	return status >= StatusSucceeded && status <= StatusChildTerminated
}
