// Package supervisorseam is a disposable, test-only model of the Capsule
// Supervisor approval/attempt authority boundary. It is not product code and
// deliberately contains no listener, signer, Keychain, LocalAuthentication,
// lifecycle, backend, runtime, or guest integration.
package supervisorseam

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
)

const (
	FixtureSchema = "capsule.c6b1b.supervisor-seam-fixture/v0"
	StoreSchema   = "capsule.c6b1b.supervisor-seam-store/v0"
)

var ErrResponseLost = errors.New("test-only response lost")

type CapsuleFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type CapsuleInput struct {
	Repository string        `json:"repository"`
	Commit     string        `json:"commit"`
	Files      []CapsuleFile `json:"files"`
}

type InterfaceContract struct {
	Name                            string   `json:"name"`
	Stage                           string   `json:"stage"`
	ReplayIdentity                  string   `json:"replayIdentity"`
	AuthorityOwner                  string   `json:"authorityOwner"`
	BrokerDurableAuthority          bool     `json:"brokerDurableAuthority"`
	CryptographicVerificationBySeam bool     `json:"cryptographicVerificationPerformedBySeam"`
	Notes                           []string `json:"notes"`
}

type Registration struct {
	RegistrationID       string `json:"registrationId"`
	RegistrationSequence uint64 `json:"registrationSequence"`
	PlanDigest           string `json:"planDigest"`
	InstallationID       string `json:"installationId"`
	EpochSequence        uint64 `json:"epochSequence"`
	EpochDigest          string `json:"epochDigest"`
	SupervisorID         string `json:"supervisorId"`
	Purpose              string `json:"purpose"`
	Audience             string `json:"audience"`
}

type VerifiedSubmission struct {
	Name                    string `json:"name"`
	VerificationDisposition string `json:"verificationDisposition"`
	PayloadHex              string `json:"payloadHex"`
	ProtectedHex            string `json:"protectedHex"`
	EnvelopeHex             string `json:"envelopeHex"`
}

type Fixture struct {
	SchemaVersion               string               `json:"schemaVersion"`
	CapsuleInput                CapsuleInput         `json:"capsuleInput"`
	Interface                   InterfaceContract    `json:"interface"`
	Registration                Registration         `json:"registration"`
	AuthorizationIdentityDigest string               `json:"authorizationIdentityDigest"`
	AttemptNonce                string               `json:"attemptNonce"`
	ApprovalID                  string               `json:"approvalId"`
	AttemptID                   string               `json:"attemptId"`
	Submissions                 []VerifiedSubmission `json:"submissions"`
}

func LoadFixture(path string) (Fixture, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Fixture{}, err
	}
	var fixture Fixture
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fixture); err != nil {
		return Fixture{}, fmt.Errorf("decode fixture: %w", err)
	}
	if err := fixture.Validate(); err != nil {
		return Fixture{}, err
	}
	return fixture, nil
}

func (fixture Fixture) Validate() error {
	if fixture.SchemaVersion != FixtureSchema {
		return fmt.Errorf("fixture schema %q", fixture.SchemaVersion)
	}
	if fixture.CapsuleInput.Repository != "Shrimpworks/capsule-corp" || len(fixture.CapsuleInput.Commit) != 40 {
		return errors.New("fixture must pin the exact Capsule repository and commit")
	}
	if fixture.Interface.Name != "capsule.c6b1b.verified-approval-input/v0" ||
		fixture.Interface.AuthorityOwner != "Supervisor durable store" ||
		fixture.Interface.BrokerDurableAuthority || fixture.Interface.CryptographicVerificationBySeam {
		return errors.New("fixture interface changes the authority or verification boundary")
	}
	if fixture.Registration.Purpose != "capsule.plan.approve" || fixture.Registration.Audience != "capsule.execution-supervisor" {
		return errors.New("fixture purpose/audience mismatch")
	}
	for name, value := range map[string]string{
		"registrationId": fixture.Registration.RegistrationID,
		"installationId": fixture.Registration.InstallationID,
		"supervisorId":   fixture.Registration.SupervisorID,
		"attemptNonce":   fixture.AttemptNonce,
		"approvalId":     fixture.ApprovalID,
		"attemptId":      fixture.AttemptID,
	} {
		if err := validateNonzeroHex(name, value, 16); err != nil {
			return err
		}
	}
	for name, value := range map[string]string{
		"planDigest":                  fixture.Registration.PlanDigest,
		"epochDigest":                 fixture.Registration.EpochDigest,
		"authorizationIdentityDigest": fixture.AuthorizationIdentityDigest,
	} {
		if err := validateNonzeroHex(name, value, 32); err != nil {
			return err
		}
	}
	if fixture.Registration.RegistrationSequence == 0 || fixture.Registration.EpochSequence == 0 {
		return errors.New("fixture sequences must be nonzero")
	}
	if len(fixture.Submissions) != 2 {
		return errors.New("fixture requires ordinary and complementary submissions")
	}
	ordinary, err := decodeSubmission(fixture.Submissions[0])
	if err != nil {
		return err
	}
	equivalent, err := decodeSubmission(fixture.Submissions[1])
	if err != nil {
		return err
	}
	if !bytes.Equal(ordinary.payload, equivalent.payload) || !bytes.Equal(ordinary.protected, equivalent.protected) {
		return errors.New("equivalent submission changed payload or protected bytes")
	}
	if bytes.Equal(ordinary.envelope, equivalent.envelope) {
		return errors.New("equivalent submission must use distinct envelope bytes")
	}
	if err := validateComplementarySignatures(ordinary.envelope, equivalent.envelope); err != nil {
		return err
	}
	files := make(map[string]string, len(fixture.CapsuleInput.Files))
	for _, file := range fixture.CapsuleInput.Files {
		if file.Path == "" || len(file.SHA256) != 64 || files[file.Path] != "" {
			return errors.New("Capsule file pins must be unique paths with SHA-256")
		}
		files[file.Path] = file.SHA256
	}
	if got := sha256Hex(ordinary.payload); files["schemas/conformance/v0/approval-grant/ordinary.payload.cbor"] != got {
		return fmt.Errorf("ordinary payload pin mismatch: %s", got)
	}
	if got := sha256Hex(ordinary.protected); files["schemas/conformance/v0/approval-grant/ordinary.protected.cbor"] != got {
		return fmt.Errorf("ordinary protected pin mismatch: %s", got)
	}
	if got := sha256Hex(ordinary.envelope); files["schemas/conformance/v0/approval-grant/ordinary.cose"] != got {
		return fmt.Errorf("ordinary envelope pin mismatch: %s", got)
	}
	return nil
}

type decodedSubmission struct {
	payload   []byte
	protected []byte
	envelope  []byte
}

func decodeSubmission(submission VerifiedSubmission) (decodedSubmission, error) {
	if submission.Name == "" || submission.VerificationDisposition == "" {
		return decodedSubmission{}, errors.New("submission name/disposition required")
	}
	payload, err := hex.DecodeString(submission.PayloadHex)
	if err != nil || len(payload) == 0 {
		return decodedSubmission{}, fmt.Errorf("%s payload hex invalid", submission.Name)
	}
	protected, err := hex.DecodeString(submission.ProtectedHex)
	if err != nil || len(protected) == 0 {
		return decodedSubmission{}, fmt.Errorf("%s protected hex invalid", submission.Name)
	}
	envelope, err := hex.DecodeString(submission.EnvelopeHex)
	if err != nil || len(envelope) == 0 {
		return decodedSubmission{}, fmt.Errorf("%s envelope hex invalid", submission.Name)
	}
	return decodedSubmission{payload: payload, protected: protected, envelope: envelope}, nil
}

func validateComplementarySignatures(first, second []byte) error {
	if len(first) < 64 || len(first) != len(second) {
		return errors.New("equivalent envelopes have invalid lengths")
	}
	prefixEnd := len(first) - 64
	if !bytes.Equal(first[:prefixEnd+32], second[:prefixEnd+32]) {
		return errors.New("equivalent envelopes differ outside ECDSA S")
	}
	// P-256 group order, split into four big-endian uint64 limbs.
	order := [4]uint64{0xffffffff00000000, 0xffffffffffffffff, 0xbce6faada7179e84, 0xf3b9cac2fc632551}
	firstS := bytesToLimbs(first[len(first)-32:])
	secondS := bytesToLimbs(second[len(second)-32:])
	var carry uint64
	for index := 3; index >= 0; index-- {
		sum, next := add64(firstS[index], secondS[index], carry)
		if sum != order[index] {
			return errors.New("fixture signatures are not P-256 complements")
		}
		carry = next
	}
	if carry != 0 {
		return errors.New("fixture signature complement overflow")
	}
	return nil
}

func bytesToLimbs(value []byte) [4]uint64 {
	var result [4]uint64
	for index := range result {
		for _, octet := range value[index*8 : index*8+8] {
			result[index] = result[index]<<8 | uint64(octet)
		}
	}
	return result
}

func add64(left, right, carry uint64) (uint64, uint64) {
	sum := left + right
	next := uint64(0)
	if sum < left {
		next = 1
	}
	withCarry := sum + carry
	if withCarry < sum {
		next = 1
	}
	return withCarry, next
}

func validateNonzeroHex(name, value string, size int) error {
	decoded, err := hex.DecodeString(value)
	if err != nil || len(decoded) != size {
		return fmt.Errorf("%s must be %d bytes", name, size)
	}
	if bytes.Equal(decoded, make([]byte, size)) {
		return fmt.Errorf("%s must be nonzero", name)
	}
	return nil
}

func sha256Hex(value []byte) string {
	digest := sha256.Sum256(value)
	return hex.EncodeToString(digest[:])
}

type ApprovalRecord struct {
	ApprovalID                  string `json:"approvalId"`
	AttemptNonce                string `json:"attemptNonce"`
	RegistrationID              string `json:"registrationId"`
	RegistrationSequence        uint64 `json:"registrationSequence"`
	PlanDigest                  string `json:"planDigest"`
	InstallationID              string `json:"installationId"`
	EpochSequence               uint64 `json:"epochSequence"`
	EpochDigest                 string `json:"epochDigest"`
	SupervisorID                string `json:"supervisorId"`
	Purpose                     string `json:"purpose"`
	Audience                    string `json:"audience"`
	ExactPayloadHex             string `json:"exactPayloadHex"`
	PayloadDigest               string `json:"payloadDigest"`
	EnvelopeDigest              string `json:"envelopeDigest"`
	AuthorizationIdentityDigest string `json:"authorizationIdentityDigest"`
	State                       string `json:"state"`
	ConsumedAttemptID           string `json:"consumedAttemptId,omitempty"`
}

type AttemptRecord struct {
	AttemptID                   string `json:"attemptId"`
	ApprovalID                  string `json:"approvalId"`
	AttemptNonce                string `json:"attemptNonce"`
	RegistrationID              string `json:"registrationId"`
	RegistrationSequence        uint64 `json:"registrationSequence"`
	PlanDigest                  string `json:"planDigest"`
	InstallationID              string `json:"installationId"`
	EpochSequence               uint64 `json:"epochSequence"`
	EpochDigest                 string `json:"epochDigest"`
	SupervisorID                string `json:"supervisorId"`
	Purpose                     string `json:"purpose"`
	Audience                    string `json:"audience"`
	ApprovalPayloadDigest       string `json:"approvalPayloadDigest"`
	AuthorizationIdentityDigest string `json:"authorizationIdentityDigest"`
	State                       string `json:"state"`
}

type State struct {
	SchemaVersion string           `json:"schemaVersion"`
	Approvals     []ApprovalRecord `json:"approvals"`
	Attempts      []AttemptRecord  `json:"attempts"`
}

type Fault string

const (
	NoFault          Fault = "none"
	LoseBeforeCommit Fault = "lose-before-commit"
	LoseAfterCommit  Fault = "lose-after-commit"
)

type Store struct {
	path  string
	state State
}

func OpenStore(path string) (*Store, error) {
	info, err := os.Lstat(filepath.Dir(path))
	if err != nil || !info.IsDir() || info.Mode().Perm() != 0o700 {
		return nil, errors.New("store parent must be an existing mode-0700 directory")
	}
	store := &Store{path: path, state: State{SchemaVersion: StoreSchema, Approvals: []ApprovalRecord{}, Attempts: []AttemptRecord{}}}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil
	}
	if err != nil {
		return nil, err
	}
	fileInfo, err := os.Lstat(path)
	if err != nil || !fileInfo.Mode().IsRegular() || fileInfo.Mode().Perm() != 0o600 {
		return nil, errors.New("store must be a regular mode-0600 file")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&store.state); err != nil {
		return nil, fmt.Errorf("decode store: %w", err)
	}
	if err := validateState(store.state); err != nil {
		return nil, fmt.Errorf("repair required: %w", err)
	}
	return store, nil
}

func (store *Store) commit(next State, fault Fault) error {
	if err := validateState(next); err != nil {
		return err
	}
	if fault == LoseBeforeCommit {
		return ErrResponseLost
	}
	raw, err := json.MarshalIndent(next, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	temporary := store.path + ".next"
	file, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	removeTemporary := true
	defer func() {
		_ = file.Close()
		if removeTemporary {
			_ = os.Remove(temporary)
		}
	}()
	if _, err := file.Write(raw); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporary, store.path); err != nil {
		return err
	}
	removeTemporary = false
	directory, err := os.Open(filepath.Dir(store.path))
	if err != nil {
		return err
	}
	if err := directory.Sync(); err != nil {
		_ = directory.Close()
		return err
	}
	if err := directory.Close(); err != nil {
		return err
	}
	store.state = cloneState(next)
	if fault == LoseAfterCommit {
		return ErrResponseLost
	}
	return nil
}

func (store *Store) Snapshot() State {
	return cloneState(store.state)
}

func cloneState(state State) State {
	clone := state
	clone.Approvals = append([]ApprovalRecord(nil), state.Approvals...)
	clone.Attempts = append([]AttemptRecord(nil), state.Attempts...)
	return clone
}

func validateState(state State) error {
	if state.SchemaVersion != StoreSchema {
		return errors.New("unknown store schema")
	}
	approvalIDs := map[string]struct{}{}
	payloadDigests := map[string]struct{}{}
	nonces := map[string]struct{}{}
	attemptIDs := map[string]struct{}{}
	attemptByApproval := map[string]AttemptRecord{}
	for _, attempt := range state.Attempts {
		for name, value := range map[string]string{
			"attemptId": attempt.AttemptID, "attemptApprovalId": attempt.ApprovalID,
			"attemptNonce": attempt.AttemptNonce, "attemptRegistrationId": attempt.RegistrationID,
			"attemptInstallationId": attempt.InstallationID, "attemptSupervisorId": attempt.SupervisorID,
		} {
			if err := validateNonzeroHex(name, value, 16); err != nil {
				return err
			}
		}
		for name, value := range map[string]string{
			"attemptPlanDigest": attempt.PlanDigest, "attemptEpochDigest": attempt.EpochDigest,
			"attemptPayloadDigest":               attempt.ApprovalPayloadDigest,
			"attemptAuthorizationIdentityDigest": attempt.AuthorizationIdentityDigest,
		} {
			if err := validateNonzeroHex(name, value, 32); err != nil {
				return err
			}
		}
		if _, exists := attemptIDs[attempt.AttemptID]; exists {
			return errors.New("duplicate attempt ID")
		}
		if _, exists := attemptByApproval[attempt.ApprovalID]; exists {
			return errors.New("more than one attempt for approval")
		}
		if attempt.State != "created" {
			return errors.New("invalid attempt state")
		}
		attemptIDs[attempt.AttemptID] = struct{}{}
		attemptByApproval[attempt.ApprovalID] = attempt
	}
	for _, approval := range state.Approvals {
		for name, value := range map[string]string{
			"approvalId": approval.ApprovalID, "approvalAttemptNonce": approval.AttemptNonce,
			"approvalRegistrationId": approval.RegistrationID, "approvalInstallationId": approval.InstallationID,
			"approvalSupervisorId": approval.SupervisorID,
		} {
			if err := validateNonzeroHex(name, value, 16); err != nil {
				return err
			}
		}
		for name, value := range map[string]string{
			"approvalPlanDigest": approval.PlanDigest, "approvalEpochDigest": approval.EpochDigest,
			"approvalPayloadDigest": approval.PayloadDigest, "approvalEnvelopeDigest": approval.EnvelopeDigest,
			"approvalAuthorizationIdentityDigest": approval.AuthorizationIdentityDigest,
		} {
			if err := validateNonzeroHex(name, value, 32); err != nil {
				return err
			}
		}
		payload, err := hex.DecodeString(approval.ExactPayloadHex)
		if err != nil || len(payload) == 0 || sha256Hex(payload) != approval.PayloadDigest {
			return errors.New("approval exact payload/digest mismatch")
		}
		if _, exists := approvalIDs[approval.ApprovalID]; exists {
			return errors.New("duplicate approval ID")
		}
		approvalIDs[approval.ApprovalID] = struct{}{}
		if _, exists := payloadDigests[approval.PayloadDigest]; exists {
			return errors.New("duplicate approval payload replay identity")
		}
		if _, exists := nonces[approval.AttemptNonce]; exists {
			return errors.New("duplicate approval nonce")
		}
		payloadDigests[approval.PayloadDigest] = struct{}{}
		nonces[approval.AttemptNonce] = struct{}{}
		attempt, hasAttempt := attemptByApproval[approval.ApprovalID]
		switch approval.State {
		case "usable":
			if approval.ConsumedAttemptID != "" || hasAttempt {
				return errors.New("usable approval has attempt")
			}
		case "consumed":
			if !hasAttempt || approval.ConsumedAttemptID != attempt.AttemptID {
				return errors.New("consumed approval missing exact attempt")
			}
			if attempt.RegistrationID != approval.RegistrationID ||
				attempt.AttemptNonce != approval.AttemptNonce ||
				attempt.RegistrationSequence != approval.RegistrationSequence ||
				attempt.PlanDigest != approval.PlanDigest ||
				attempt.InstallationID != approval.InstallationID ||
				attempt.EpochSequence != approval.EpochSequence ||
				attempt.EpochDigest != approval.EpochDigest ||
				attempt.SupervisorID != approval.SupervisorID ||
				attempt.Purpose != approval.Purpose || attempt.Audience != approval.Audience ||
				attempt.ApprovalPayloadDigest != approval.PayloadDigest ||
				attempt.AuthorizationIdentityDigest != approval.AuthorizationIdentityDigest {
				return errors.New("attempt copied binding mismatch")
			}
		default:
			return errors.New("invalid approval state")
		}
	}
	for approvalID := range attemptByApproval {
		if _, exists := approvalIDs[approvalID]; !exists {
			return errors.New("attempt without approval")
		}
	}
	return nil
}

type Seam struct {
	mu      sync.Mutex
	fixture Fixture
	store   *Store
}

func NewSeam(fixture Fixture, store *Store) (*Seam, error) {
	if err := fixture.Validate(); err != nil {
		return nil, err
	}
	if store == nil {
		return nil, errors.New("store required")
	}
	return &Seam{fixture: fixture, store: store}, nil
}

func (seam *Seam) Submit(submission VerifiedSubmission, fault Fault) (ApprovalRecord, error) {
	seam.mu.Lock()
	defer seam.mu.Unlock()
	decoded, err := decodeSubmission(submission)
	if err != nil {
		return ApprovalRecord{}, err
	}
	allowed := false
	for _, candidate := range seam.fixture.Submissions {
		if candidate.Name == submission.Name && candidate.VerificationDisposition == submission.VerificationDisposition &&
			candidate.PayloadHex == submission.PayloadHex && candidate.ProtectedHex == submission.ProtectedHex &&
			candidate.EnvelopeHex == submission.EnvelopeHex {
			allowed = true
			break
		}
	}
	if !allowed {
		return ApprovalRecord{}, errors.New("submission was not accepted by the test-only verifier")
	}
	payloadDigest := sha256Hex(decoded.payload)
	state := seam.store.Snapshot()
	for _, approval := range state.Approvals {
		if approval.PayloadDigest != payloadDigest {
			continue
		}
		if approval.RegistrationID != seam.fixture.Registration.RegistrationID ||
			approval.AuthorizationIdentityDigest != seam.fixture.AuthorizationIdentityDigest {
			return ApprovalRecord{}, errors.New("payload replay binding mismatch")
		}
		if approval.ExactPayloadHex != submission.PayloadHex {
			return ApprovalRecord{}, errors.New("payload digest collision or non-exact replay")
		}
		return approval, nil
	}
	record := ApprovalRecord{
		ApprovalID: seam.fixture.ApprovalID, AttemptNonce: seam.fixture.AttemptNonce,
		RegistrationID:       seam.fixture.Registration.RegistrationID,
		RegistrationSequence: seam.fixture.Registration.RegistrationSequence,
		PlanDigest:           seam.fixture.Registration.PlanDigest,
		InstallationID:       seam.fixture.Registration.InstallationID,
		EpochSequence:        seam.fixture.Registration.EpochSequence,
		EpochDigest:          seam.fixture.Registration.EpochDigest,
		SupervisorID:         seam.fixture.Registration.SupervisorID,
		Purpose:              seam.fixture.Registration.Purpose, Audience: seam.fixture.Registration.Audience,
		ExactPayloadHex: submission.PayloadHex, PayloadDigest: payloadDigest,
		EnvelopeDigest:              sha256Hex(decoded.envelope),
		AuthorizationIdentityDigest: seam.fixture.AuthorizationIdentityDigest, State: "usable",
	}
	state.Approvals = append(state.Approvals, record)
	if err := seam.store.commit(state, fault); err != nil {
		return ApprovalRecord{}, err
	}
	return record, nil
}

func (seam *Seam) RequestAttempt(registrationID, approvalID string, fault Fault) (AttemptRecord, error) {
	seam.mu.Lock()
	defer seam.mu.Unlock()
	state := seam.store.Snapshot()
	approvalIndex := -1
	for index := range state.Approvals {
		if state.Approvals[index].ApprovalID == approvalID {
			approvalIndex = index
			break
		}
	}
	if approvalIndex < 0 || state.Approvals[approvalIndex].RegistrationID != registrationID {
		return AttemptRecord{}, errors.New("approval binding not found")
	}
	approval := state.Approvals[approvalIndex]
	if approval.State == "consumed" {
		for _, attempt := range state.Attempts {
			if attempt.AttemptID == approval.ConsumedAttemptID {
				return attempt, nil
			}
		}
		return AttemptRecord{}, errors.New("repair required: consumed approval missing attempt")
	}
	if approval.State != "usable" {
		return AttemptRecord{}, errors.New("approval not usable")
	}
	attempt := AttemptRecord{
		AttemptID: seam.fixture.AttemptID, ApprovalID: approval.ApprovalID,
		AttemptNonce: approval.AttemptNonce, RegistrationID: approval.RegistrationID,
		RegistrationSequence: approval.RegistrationSequence, PlanDigest: approval.PlanDigest,
		InstallationID: approval.InstallationID, EpochSequence: approval.EpochSequence,
		EpochDigest: approval.EpochDigest, SupervisorID: approval.SupervisorID,
		Purpose: approval.Purpose, Audience: approval.Audience,
		ApprovalPayloadDigest:       approval.PayloadDigest,
		AuthorizationIdentityDigest: approval.AuthorizationIdentityDigest, State: "created",
	}
	state.Attempts = append(state.Attempts, attempt)
	state.Approvals[approvalIndex].State = "consumed"
	state.Approvals[approvalIndex].ConsumedAttemptID = attempt.AttemptID
	if err := seam.store.commit(state, fault); err != nil {
		return AttemptRecord{}, err
	}
	return attempt, nil
}

func (seam *Seam) Snapshot() State {
	seam.mu.Lock()
	defer seam.mu.Unlock()
	return seam.store.Snapshot()
}

func StateDigest(state State) string {
	// Retain stable order even if a future test creates records concurrently.
	sort.Slice(state.Approvals, func(left, right int) bool {
		return state.Approvals[left].ApprovalID < state.Approvals[right].ApprovalID
	})
	sort.Slice(state.Attempts, func(left, right int) bool { return state.Attempts[left].AttemptID < state.Attempts[right].AttemptID })
	raw, _ := json.Marshal(state)
	return sha256Hex(raw)
}
