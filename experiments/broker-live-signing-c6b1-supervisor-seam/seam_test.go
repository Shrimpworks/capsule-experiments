package supervisorseam

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func fixtureForTest(t *testing.T) (Fixture, []byte) {
	t.Helper()
	path := filepath.Join("fixtures", "supervisor-seam-v0.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := LoadFixture(path)
	if err != nil {
		t.Fatal(err)
	}
	return fixture, raw
}

func TestFixturePinsEquivalentPublicInputs(t *testing.T) {
	fixture, _ := fixtureForTest(t)
	if fixture.CapsuleInput.Commit != "88f3a2c1f968b1aa604ce14a2db4389822e5b193" {
		t.Fatal("unexpected Capsule commit")
	}
	if fixture.Interface.BrokerDurableAuthority || fixture.Interface.CryptographicVerificationBySeam {
		t.Fatal("fixture expanded seam authority")
	}
	first, _ := decodeSubmission(fixture.Submissions[0])
	second, _ := decodeSubmission(fixture.Submissions[1])
	if reflect.DeepEqual(first.envelope, second.envelope) || !reflect.DeepEqual(first.payload, second.payload) {
		t.Fatal("fixture does not isolate equivalent-signature replay")
	}
}

func TestMatrixPassesAllDurableConvergenceRows(t *testing.T) {
	fixture, raw := fixtureForTest(t)
	result, err := RunMatrix(fixture, raw, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	wantIDs := []string{
		"submit-response-loss-before-commit",
		"submit-response-loss-after-commit",
		"submit-equivalent-envelope-replay",
		"request-attempt-response-loss-before-commit",
		"request-attempt-response-loss-after-commit",
		"request-attempt-concurrent-replay",
	}
	if result.Status != "PASSED" || !result.CleanupVerified || len(result.Rows) != len(wantIDs) {
		t.Fatalf("matrix summary: %#v", result)
	}
	for index, want := range wantIDs {
		row := result.Rows[index]
		if row.ID != want || row.Status != "PASSED" || !row.Observation.Reopened {
			t.Fatalf("row %d: %#v", index, row)
		}
	}
	if result.ProductStateAccessed || result.BrokerDurableStateCreated || result.ListenerActivated ||
		result.SignerOrCredentialAccessed || result.RuntimeBackendOrGuestStarted {
		t.Fatal("test-only matrix claimed or accessed excluded state")
	}
}

func TestRetainedResultIsCompleteAndBound(t *testing.T) {
	fixture, raw := fixtureForTest(t)
	if _, err := LoadAndValidateResult(filepath.Join("evidence", "2026-08-11", "result.json"), fixture, raw); err != nil {
		t.Fatal(err)
	}
}

func TestUnverifiedSubmissionCannotReachDurableStore(t *testing.T) {
	fixture, _ := fixtureForTest(t)
	root := filepath.Join(t.TempDir(), "owned")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	seam, err := newScenario(fixture, root)
	if err != nil {
		t.Fatal(err)
	}
	changed := fixture.Submissions[0]
	changed.Name = "caller-invented"
	if _, err := seam.Submit(changed, NoFault); err == nil {
		t.Fatal("unverified submission reached store")
	}
	state := seam.Snapshot()
	if len(state.Approvals) != 0 || len(state.Attempts) != 0 {
		t.Fatal("unverified submission changed authority")
	}
}

func TestStoreRejectsSplitAuthorityOnReopen(t *testing.T) {
	fixture, _ := fixtureForTest(t)
	root := filepath.Join(t.TempDir(), "owned")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	seam, err := newScenario(fixture, root)
	if err != nil {
		t.Fatal(err)
	}
	approval, err := seam.Submit(fixture.Submissions[0], NoFault)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := seam.RequestAttempt(fixture.Registration.RegistrationID, approval.ApprovalID, NoFault); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "supervisor-state.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	state.Approvals[0].ConsumedAttemptID = "cccccccccccccccccccccccccccccccc"
	raw, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := OpenStore(path); err == nil {
		t.Fatal("split approval/attempt state reopened")
	}
}

func TestStoreModesAndBeforeCommitNoRewrite(t *testing.T) {
	fixture, _ := fixtureForTest(t)
	root := filepath.Join(t.TempDir(), "owned")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	seam, err := newScenario(fixture, root)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := seam.Submit(fixture.Submissions[0], LoseBeforeCommit); !errors.Is(err, ErrResponseLost) {
		t.Fatalf("before commit error: %v", err)
	}
	path := filepath.Join(root, "supervisor-state.json")
	if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("before-commit loss created store bytes")
	}
	if _, err := seam.Submit(fixture.Submissions[0], NoFault); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm() != 0o600 {
		t.Fatalf("store mode = %v", info.Mode())
	}
}
