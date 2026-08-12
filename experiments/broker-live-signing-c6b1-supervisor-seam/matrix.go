package supervisorseam

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sync"
)

type Observation struct {
	ApprovalCount      int              `json:"approvalCount"`
	AttemptCount       int              `json:"attemptCount"`
	ApprovalState      string           `json:"approvalState,omitempty"`
	ApprovalID         string           `json:"approvalId,omitempty"`
	AttemptID          string           `json:"attemptId,omitempty"`
	StateDigest        string           `json:"stateDigest"`
	Reopened           bool             `json:"reopened"`
	Intermediate       *AuthorityCounts `json:"authorityImmediatelyAfterFaultOrFirstCommit,omitempty"`
	ReplayReturnedSame bool             `json:"replayReturnedSameIdentity"`
	ConcurrentCallers  int              `json:"concurrentCallers,omitempty"`
}

type AuthorityCounts struct {
	ApprovalCount int    `json:"approvalCount"`
	AttemptCount  int    `json:"attemptCount"`
	ApprovalState string `json:"approvalState,omitempty"`
}

type MatrixRow struct {
	ID          string      `json:"id"`
	Status      string      `json:"status"`
	Question    string      `json:"question"`
	Observation Observation `json:"observation"`
}

type MatrixResult struct {
	SchemaVersion string `json:"schemaVersion"`
	Status        string `json:"status"`
	Scope         string `json:"scope"`
	Environment   struct {
		GOOS      string `json:"goos"`
		GOARCH    string `json:"goarch"`
		GoVersion string `json:"goVersion"`
	} `json:"environment"`
	CapsuleInput                 CapsuleInput `json:"capsuleInput"`
	FixtureSHA256                string       `json:"fixtureSha256"`
	Rows                         []MatrixRow  `json:"rows"`
	CleanupVerified              bool         `json:"cleanupVerified"`
	ProductStateAccessed         bool         `json:"productStateAccessed"`
	BrokerDurableStateCreated    bool         `json:"brokerDurableStateCreated"`
	ListenerActivated            bool         `json:"listenerActivated"`
	SignerOrCredentialAccessed   bool         `json:"signerOrCredentialAccessed"`
	RuntimeBackendOrGuestStarted bool         `json:"runtimeBackendOrGuestStarted"`
	Limitations                  []string     `json:"limitations"`
}

func RunMatrix(fixture Fixture, fixtureRaw []byte, temporaryParent string) (MatrixResult, error) {
	if err := fixture.Validate(); err != nil {
		return MatrixResult{}, err
	}
	root, err := os.MkdirTemp(temporaryParent, "capsule-c6b1b-supervisor-seam-")
	if err != nil {
		return MatrixResult{}, err
	}
	if err := os.Chmod(root, 0o700); err != nil {
		_ = os.RemoveAll(root)
		return MatrixResult{}, err
	}
	result := MatrixResult{
		SchemaVersion: "capsule.c6b1b.supervisor-seam-result/v0",
		Status:        "PASSED",
		Scope:         "test-only Supervisor durable approval/attempt replay and fault seam",
		CapsuleInput:  fixture.CapsuleInput,
		FixtureSHA256: sha256Hex(fixtureRaw),
		Rows:          []MatrixRow{},
		Limitations: []string{
			"This is an experiment-local store model, not Capsule product code or installed durability evidence.",
			"The input is a test-verifier projection; this seam does not verify COSE, sign, render UI, or authorize a key.",
			"No authenticated IPC, protected store, lifecycle driver, runtime, backend, VM, guest, or product consumer was exercised.",
		},
	}
	result.Environment.GOOS = runtime.GOOS
	result.Environment.GOARCH = runtime.GOARCH
	result.Environment.GoVersion = runtime.Version()

	rows := []func(string) (MatrixRow, error){
		func(path string) (MatrixRow, error) { return rowSubmitBeforeCommit(fixture, path) },
		func(path string) (MatrixRow, error) { return rowSubmitAfterCommit(fixture, path) },
		func(path string) (MatrixRow, error) { return rowEquivalentReplay(fixture, path) },
		func(path string) (MatrixRow, error) { return rowAttemptBeforeCommit(fixture, path) },
		func(path string) (MatrixRow, error) { return rowAttemptAfterCommit(fixture, path) },
		func(path string) (MatrixRow, error) { return rowConcurrentAttemptReplay(fixture, path) },
	}
	for index, run := range rows {
		scenario := filepath.Join(root, fmt.Sprintf("row-%02d", index+1))
		if err := os.Mkdir(scenario, 0o700); err != nil {
			_ = os.RemoveAll(root)
			return MatrixResult{}, err
		}
		row, err := run(scenario)
		if err != nil {
			_ = os.RemoveAll(root)
			return MatrixResult{}, fmt.Errorf("matrix row %d: %w", index+1, err)
		}
		result.Rows = append(result.Rows, row)
	}
	if err := os.RemoveAll(root); err != nil {
		return MatrixResult{}, err
	}
	if _, err := os.Lstat(root); !errors.Is(err, os.ErrNotExist) {
		return MatrixResult{}, errors.New("disposable root cleanup not verified")
	}
	result.CleanupVerified = true
	return result, nil
}

func rowSubmitBeforeCommit(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	if _, err := seam.Submit(fixture.Submissions[0], LoseBeforeCommit); !errors.Is(err, ErrResponseLost) {
		return MatrixRow{}, errors.New("before-commit submission did not lose response")
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	if state := reopened.Snapshot(); len(state.Approvals) != 0 || len(state.Attempts) != 0 {
		return MatrixRow{}, errors.New("before-commit submission created authority")
	}
	approval, err := reopened.Submit(fixture.Submissions[0], NoFault)
	if err != nil || approval.ApprovalID != fixture.ApprovalID {
		return MatrixRow{}, errors.New("before-commit retry did not create expected approval")
	}
	row := passedRow("submit-response-loss-before-commit", "Does a lost response before SubmitApproval commit leave no authority and permit a fresh commit?", reopened, true)
	row.Observation.Intermediate = &AuthorityCounts{}
	return row, nil
}

func rowSubmitAfterCommit(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	if _, err := seam.Submit(fixture.Submissions[0], LoseAfterCommit); !errors.Is(err, ErrResponseLost) {
		return MatrixRow{}, errors.New("after-commit submission did not lose response")
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	intermediate := counts(reopened.Snapshot())
	approval, err := reopened.Submit(fixture.Submissions[0], NoFault)
	if err != nil || approval.ApprovalID != fixture.ApprovalID {
		return MatrixRow{}, errors.New("exact submission replay did not converge")
	}
	if len(reopened.Snapshot().Approvals) != 1 {
		return MatrixRow{}, errors.New("exact submission replay duplicated approval")
	}
	row := passedRow("submit-response-loss-after-commit", "Does crash/reopen after a lost committed SubmitApproval reply return the same ApprovalID?", reopened, true)
	row.Observation.Intermediate = &intermediate
	row.Observation.ReplayReturnedSame = true
	return row, nil
}

func rowEquivalentReplay(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	first, err := seam.Submit(fixture.Submissions[0], NoFault)
	if err != nil {
		return MatrixRow{}, err
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	intermediate := counts(reopened.Snapshot())
	equivalent, err := reopened.Submit(fixture.Submissions[1], NoFault)
	if err != nil || equivalent.ApprovalID != first.ApprovalID {
		return MatrixRow{}, errors.New("equivalent signature replay did not converge")
	}
	state := reopened.Snapshot()
	if len(state.Approvals) != 1 || state.Approvals[0].EnvelopeDigest != first.EnvelopeDigest {
		return MatrixRow{}, errors.New("equivalent replay mutated retained approval")
	}
	row := passedRow("submit-equivalent-envelope-replay", "Do distinct complementary signatures over one payload converge by payload and authorization identity?", reopened, true)
	row.Observation.Intermediate = &intermediate
	row.Observation.ReplayReturnedSame = true
	return row, nil
}

func rowAttemptBeforeCommit(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	approval, err := seam.Submit(fixture.Submissions[0], NoFault)
	if err != nil {
		return MatrixRow{}, err
	}
	if _, err := seam.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, LoseBeforeCommit); !errors.Is(err, ErrResponseLost) {
		return MatrixRow{}, errors.New("before-commit attempt did not lose response")
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	state := reopened.Snapshot()
	if len(state.Attempts) != 0 || state.Approvals[0].State != "usable" {
		return MatrixRow{}, errors.New("before-commit attempt changed durable authority")
	}
	intermediate := counts(state)
	attempt, err := reopened.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, NoFault)
	if err != nil || attempt.AttemptID != fixture.AttemptID {
		return MatrixRow{}, errors.New("before-commit attempt retry did not create expected attempt")
	}
	row := passedRow("request-attempt-response-loss-before-commit", "Does loss before atomic consume/create preserve usable approval and create no attempt?", reopened, true)
	row.Observation.Intermediate = &intermediate
	return row, nil
}

func rowAttemptAfterCommit(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	approval, err := seam.Submit(fixture.Submissions[0], NoFault)
	if err != nil {
		return MatrixRow{}, err
	}
	if _, err := seam.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, LoseAfterCommit); !errors.Is(err, ErrResponseLost) {
		return MatrixRow{}, errors.New("after-commit attempt did not lose response")
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	intermediate := counts(reopened.Snapshot())
	attempt, err := reopened.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, NoFault)
	if err != nil || attempt.AttemptID != fixture.AttemptID {
		return MatrixRow{}, errors.New("attempt replay did not return same AttemptID")
	}
	state := reopened.Snapshot()
	if len(state.Attempts) != 1 || state.Approvals[0].State != "consumed" || state.Approvals[0].ConsumedAttemptID != attempt.AttemptID {
		return MatrixRow{}, errors.New("atomic consume/create did not survive reopen")
	}
	row := passedRow("request-attempt-response-loss-after-commit", "Does loss after atomic consume/create reopen as one consumed approval and the same AttemptID?", reopened, true)
	row.Observation.Intermediate = &intermediate
	row.Observation.ReplayReturnedSame = true
	return row, nil
}

func rowConcurrentAttemptReplay(fixture Fixture, path string) (MatrixRow, error) {
	seam, err := newScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	approval, err := seam.Submit(fixture.Submissions[0], NoFault)
	if err != nil {
		return MatrixRow{}, err
	}
	const callers = 16
	results := make(chan AttemptRecord, callers)
	errorsSeen := make(chan error, callers)
	var group sync.WaitGroup
	for index := 0; index < callers; index++ {
		group.Add(1)
		go func() {
			defer group.Done()
			attempt, err := seam.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, NoFault)
			if err != nil {
				errorsSeen <- err
				return
			}
			results <- attempt
		}()
	}
	group.Wait()
	close(results)
	close(errorsSeen)
	for err := range errorsSeen {
		return MatrixRow{}, err
	}
	for attempt := range results {
		if attempt.AttemptID != fixture.AttemptID {
			return MatrixRow{}, errors.New("concurrent request returned another AttemptID")
		}
	}
	reopened, err := reopenScenario(fixture, path)
	if err != nil {
		return MatrixRow{}, err
	}
	state := reopened.Snapshot()
	if len(state.Approvals) != 1 || len(state.Attempts) != 1 || state.Approvals[0].State != "consumed" {
		return MatrixRow{}, errors.New("concurrent requests created split or duplicate state")
	}
	row := passedRow("request-attempt-concurrent-replay", "Do concurrent exact requests serialize to one consumption and one AttemptID?", reopened, true)
	row.Observation.ReplayReturnedSame = true
	row.Observation.ConcurrentCallers = callers
	return row, nil
}

func newScenario(fixture Fixture, path string) (*Seam, error) {
	store, err := OpenStore(filepath.Join(path, "supervisor-state.json"))
	if err != nil {
		return nil, err
	}
	return NewSeam(fixture, store)
}

func reopenScenario(fixture Fixture, path string) (*Seam, error) {
	return newScenario(fixture, path)
}

func passedRow(id, question string, seam *Seam, reopened bool) MatrixRow {
	state := seam.Snapshot()
	observation := Observation{
		ApprovalCount: len(state.Approvals), AttemptCount: len(state.Attempts),
		StateDigest: StateDigest(state), Reopened: reopened,
	}
	if len(state.Approvals) == 1 {
		observation.ApprovalState = state.Approvals[0].State
		observation.ApprovalID = state.Approvals[0].ApprovalID
	}
	if len(state.Attempts) == 1 {
		observation.AttemptID = state.Attempts[0].AttemptID
	}
	return MatrixRow{ID: id, Status: "PASSED", Question: question, Observation: observation}
}

func counts(state State) AuthorityCounts {
	result := AuthorityCounts{ApprovalCount: len(state.Approvals), AttemptCount: len(state.Attempts)}
	if len(state.Approvals) == 1 {
		result.ApprovalState = state.Approvals[0].State
	}
	return result
}

func WriteResult(path string, result MatrixResult) error {
	raw, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')
	return os.WriteFile(path, raw, 0o644)
}

func LoadAndValidateResult(path string, fixture Fixture, fixtureRaw []byte) (MatrixResult, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return MatrixResult{}, err
	}
	var result MatrixResult
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&result); err != nil {
		return MatrixResult{}, err
	}
	if result.SchemaVersion != "capsule.c6b1b.supervisor-seam-result/v0" || result.Status != "PASSED" ||
		!result.CleanupVerified || result.FixtureSHA256 != sha256Hex(fixtureRaw) ||
		!reflect.DeepEqual(result.CapsuleInput, fixture.CapsuleInput) {
		return MatrixResult{}, errors.New("retained result summary or input binding mismatch")
	}
	if result.ProductStateAccessed || result.BrokerDurableStateCreated || result.ListenerActivated ||
		result.SignerOrCredentialAccessed || result.RuntimeBackendOrGuestStarted {
		return MatrixResult{}, errors.New("retained result claims excluded authority or execution")
	}
	want := []string{
		"submit-response-loss-before-commit",
		"submit-response-loss-after-commit",
		"submit-equivalent-envelope-replay",
		"request-attempt-response-loss-before-commit",
		"request-attempt-response-loss-after-commit",
		"request-attempt-concurrent-replay",
	}
	if len(result.Rows) != len(want) {
		return MatrixResult{}, errors.New("retained result row count mismatch")
	}
	for index, id := range want {
		row := result.Rows[index]
		if row.ID != id || row.Status != "PASSED" || !row.Observation.Reopened || row.Observation.StateDigest == "" {
			return MatrixResult{}, fmt.Errorf("retained result row %d mismatch", index)
		}
	}
	if result.Rows[0].Observation.Intermediate == nil ||
		result.Rows[0].Observation.Intermediate.ApprovalCount != 0 ||
		result.Rows[0].Observation.Intermediate.AttemptCount != 0 {
		return MatrixResult{}, errors.New("before-submit-commit retained nonzero authority")
	}
	if result.Rows[3].Observation.Intermediate == nil ||
		result.Rows[3].Observation.Intermediate.ApprovalState != "usable" ||
		result.Rows[3].Observation.Intermediate.AttemptCount != 0 {
		return MatrixResult{}, errors.New("before-attempt-commit did not retain usable-only authority")
	}
	for _, index := range []int{1, 2, 4, 5} {
		if !result.Rows[index].Observation.ReplayReturnedSame {
			return MatrixResult{}, fmt.Errorf("row %d did not retain replay convergence", index)
		}
	}
	if result.Rows[5].Observation.ConcurrentCallers != 16 {
		return MatrixResult{}, errors.New("concurrent replay caller count mismatch")
	}
	return result, nil
}
