package conformance

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"unicode/utf8"
)

type Disposition string

const (
	Accept           Disposition = "ACCEPT"
	Oversize         Disposition = "OVERSIZE"
	Truncated        Disposition = "TRUNCATED"
	MalformedHeader  Disposition = "MALFORMED_HEADER"
	MalformedLength  Disposition = "MALFORMED_LENGTH"
	BindingMismatch  Disposition = "BINDING"
	WrongDomain      Disposition = "DOMAIN"
	Stale            Disposition = "STALE"
	BadDigest        Disposition = "BAD_DIGEST"
	InvalidJSON      Disposition = "INVALID_JSON"
	EarlyCommit      Disposition = "EARLY_COMMIT"
	MissingCommit    Disposition = "MISSING_COMMIT"
	DuplicateCommit  Disposition = "DUPLICATE_COMMIT"
	DuplicateFrame   Disposition = "DUPLICATE_FRAME"
	TrailingData     Disposition = "TRAILING_DATA"
	ReaderStall      Disposition = "READER_STALL"
	ReaderDied       Disposition = "READER_DIED"
	LifecycleFailure Disposition = "LIFECYCLE_FAILURE"
)

type Validation struct {
	Disposition Disposition `json:"disposition"`
	Committed   bool        `json:"committed"`
	Detail      string      `json:"detail,omitempty"`
}

func ValidateDataFrame(frame []byte, role Role, expected ExpectedBinding, totalDrained uint64) Validation {
	if role != RoleSource && role != RoleInput {
		return reject(WrongDomain, "source/input validator received an unsupported endpoint role")
	}
	if totalDrained > PhysicalMaximum(role) {
		return reject(Oversize, "physical stream exceeded the exact role cap")
	}
	if len(frame) < DataHeaderLength {
		return reject(Truncated, "fixed data header was incomplete")
	}
	magic := magicForRole(role)
	if !bytes.Equal(frame[0:8], magic[:]) || binary.BigEndian.Uint16(frame[10:12]) != uint16(role) {
		return reject(WrongDomain, "magic or role does not match the dedicated endpoint")
	}
	if binary.BigEndian.Uint16(frame[8:10]) != Version || binary.BigEndian.Uint32(frame[12:16]) != DataHeaderLength {
		return reject(MalformedHeader, "version or fixed header length is unsupported")
	}
	payloadLength := binary.BigEndian.Uint64(frame[112:120])
	if payloadLength > PayloadMaximum(role) {
		return reject(Oversize, "declared payload length exceeded the exact role cap")
	}
	expectedLength := uint64(DataHeaderLength) + payloadLength
	if uint64(len(frame)) < expectedLength {
		return reject(Truncated, "stream ended before the declared payload length")
	}
	if uint64(len(frame)) > expectedLength {
		extra := frame[expectedLength:]
		if len(extra) >= 8 && bytes.Equal(extra[:8], magic[:]) {
			return reject(DuplicateFrame, "a second role envelope followed the first")
		}
		return reject(TrailingData, "bytes followed the declared role envelope")
	}
	binding := bindingFromHeader(frame)
	if result := validateBinding(binding, expected); result.Disposition != Accept {
		return result
	}
	digest := sha256.Sum256(frame[DataHeaderLength:])
	if !bytes.Equal(digest[:], frame[120:152]) {
		return reject(BadDigest, "payload digest did not match the exact received bytes")
	}
	return Validation{Disposition: Accept}
}

func ValidateCompletionFrame(frame []byte, expected ExpectedBinding, totalDrained uint64) Validation {
	if totalDrained > CompletionPhysicalMax {
		return reject(Oversize, "physical completion stream exceeded its exact cap")
	}
	if len(frame) < CompletionHeaderLength {
		if bytes.HasPrefix(frame, magicCommit[:]) {
			return reject(EarlyCommit, "commit trailer appeared before the completion header")
		}
		return reject(Truncated, "fixed completion header was incomplete")
	}
	if !bytes.Equal(frame[0:8], magicCompletion[:]) || binary.BigEndian.Uint16(frame[10:12]) != uint16(RoleCompletion) {
		return reject(WrongDomain, "magic or role does not match the completion endpoint")
	}
	if binary.BigEndian.Uint16(frame[8:10]) != Version || binary.BigEndian.Uint32(frame[12:16]) != CompletionHeaderLength {
		return reject(MalformedHeader, "version or fixed completion header length is unsupported")
	}
	if !allZero(frame[154:160]) {
		return reject(MalformedHeader, "completion flags/reserved bytes are nonzero")
	}
	payloadLength := binary.BigEndian.Uint64(frame[112:120])
	if payloadLength > InlineJSONPayloadMax {
		return reject(Oversize, "declared JSON payload exceeded its exact cap")
	}
	trailerOffset := uint64(CompletionHeaderLength) + payloadLength
	expectedLength := trailerOffset + CommitTrailerLength
	if uint64(len(frame)) < trailerOffset {
		if bytes.Index(frame[CompletionHeaderLength:], magicCommit[:]) >= 0 {
			return reject(EarlyCommit, "commit trailer appeared inside the declared payload")
		}
		return reject(Truncated, "stream ended before the declared JSON payload")
	}
	if uint64(len(frame)) < expectedLength {
		return reject(MissingCommit, "complete payload was not followed by the fixed commit trailer")
	}
	if uint64(len(frame)) > expectedLength {
		extra := frame[expectedLength:]
		if len(extra) >= 8 && bytes.Equal(extra[:8], magicCommit[:]) {
			return reject(DuplicateCommit, "a second commit trailer followed the frame")
		}
		if len(extra) >= 8 && bytes.Equal(extra[:8], magicCompletion[:]) {
			return reject(DuplicateFrame, "a second completion frame followed the first")
		}
		return reject(TrailingData, "bytes followed the committed completion frame")
	}

	binding := bindingFromHeader(frame)
	if result := validateBinding(binding, expected); result.Disposition != Accept {
		return result
	}
	status := TerminalStatus(binary.BigEndian.Uint16(frame[152:154]))
	if !validTerminalStatus(status) {
		return reject(MalformedHeader, "terminal status is outside the closed version-1 allowlist")
	}
	payload := frame[CompletionHeaderLength:trailerOffset]
	payloadDigest := sha256.Sum256(payload)
	if !bytes.Equal(payloadDigest[:], frame[120:152]) {
		return reject(BadDigest, "JSON payload digest did not match the exact received bytes")
	}
	if !validInlineJSON(payload) {
		return reject(InvalidJSON, "payload is not one strict bounded JSON value")
	}
	if status != StatusSucceeded && !bytes.Equal(payload, []byte("null")) {
		return reject(InvalidJSON, "non-success terminal status must carry exactly null")
	}

	trailer := frame[trailerOffset:expectedLength]
	if !bytes.Equal(trailer[0:8], magicCommit[:]) {
		return reject(MissingCommit, "fixed commit magic is absent at the only valid offset")
	}
	if binary.BigEndian.Uint16(trailer[8:10]) != Version ||
		binary.BigEndian.Uint16(trailer[10:12]) != CommitTrailerLength ||
		binary.BigEndian.Uint16(trailer[12:14]) != uint16(RoleCompletion) ||
		!allZero(trailer[14:16]) {
		return reject(MalformedHeader, "commit trailer version, length, role, or reserved bytes are invalid")
	}
	if !bytes.Equal(trailer[16:32], binding.AttemptID[:]) {
		return reject(BindingMismatch, "commit trailer attempt does not match the frame")
	}
	frameDigest := sha256.Sum256(frame[:trailerOffset])
	if !bytes.Equal(frameDigest[:], trailer[32:64]) {
		return reject(BadDigest, "commit digest did not bind the complete header and payload")
	}
	return Validation{Disposition: Accept, Committed: true}
}

func bindingFromHeader(frame []byte) Binding {
	var binding Binding
	copy(binding.AttemptID[:], frame[16:32])
	copy(binding.RegistrationID[:], frame[32:48])
	copy(binding.PlanDigest[:], frame[48:80])
	copy(binding.RuntimeProfileDigest[:], frame[80:112])
	return binding
}

func validateBinding(actual Binding, expected ExpectedBinding) Validation {
	if !validBindingShape(actual) {
		return reject(WrongDomain, "attempt and registration identifiers are zero or role-duplicated")
	}
	if _, ok := expected.StaleAttemptIDs[actual.AttemptID]; ok {
		return reject(Stale, "attempt identifier is known stale")
	}
	if actual.AttemptID != expected.AttemptID || actual.RegistrationID != expected.RegistrationID ||
		actual.PlanDigest != expected.PlanDigest || actual.RuntimeProfileDigest != expected.RuntimeProfileDigest {
		return reject(BindingMismatch, "attempt, registration, plan, or runtime-profile binding differs")
	}
	return Validation{Disposition: Accept}
}

func validInlineJSON(payload []byte) bool {
	if len(payload) == 0 || uint64(len(payload)) > InlineJSONPayloadMax || !utf8.Valid(payload) || bytes.HasPrefix(payload, []byte{0xef, 0xbb, 0xbf}) {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	budget := jsonBudget{}
	if !readJSONValue(decoder, 1, &budget) {
		return false
	}
	if _, err := decoder.Token(); err != io.EOF {
		return false
	}
	return true
}

type jsonBudget struct {
	nodes    int
	members  int
	elements int
}

func readJSONValue(decoder *json.Decoder, depth int, budget *jsonBudget) bool {
	if depth > 32 {
		return false
	}
	budget.nodes++
	if budget.nodes > 8193 {
		return false
	}
	token, err := decoder.Token()
	if err != nil {
		return false
	}
	switch typed := token.(type) {
	case nil, bool, string:
		return true
	case json.Number:
		text := string(typed)
		if text == "-0" || bytes.ContainsAny([]byte(text), ".eE+") || (len(text) > 1 && text[0] == '0') || (len(text) > 2 && text[0] == '-' && text[1] == '0') {
			return false
		}
		integer, err := strconv.ParseInt(text, 10, 64)
		return err == nil && integer >= -9_007_199_254_740_991 && integer <= 9_007_199_254_740_991
	case json.Delim:
		switch typed {
		case '{':
			seen := make(map[string]struct{})
			containerMembers := 0
			for decoder.More() {
				keyToken, keyErr := decoder.Token()
				key, ok := keyToken.(string)
				if keyErr != nil || !ok {
					return false
				}
				if _, duplicate := seen[key]; duplicate {
					return false
				}
				seen[key] = struct{}{}
				containerMembers++
				budget.members++
				if containerMembers > 256 || budget.members > 4096 || !readJSONValue(decoder, depth+1, budget) {
					return false
				}
			}
			closeToken, closeErr := decoder.Token()
			return closeErr == nil && closeToken == json.Delim('}')
		case '[':
			containerElements := 0
			for decoder.More() {
				containerElements++
				budget.elements++
				if containerElements > 256 || budget.elements > 4096 || !readJSONValue(decoder, depth+1, budget) {
					return false
				}
			}
			closeToken, closeErr := decoder.Token()
			return closeErr == nil && closeToken == json.Delim(']')
		default:
			return false
		}
	default:
		return false
	}
}

func reject(disposition Disposition, detail string) Validation {
	return Validation{Disposition: disposition, Detail: detail}
}

func (validation Validation) Error() error {
	if validation.Disposition == Accept {
		return nil
	}
	return fmt.Errorf("%s: %s", validation.Disposition, validation.Detail)
}
