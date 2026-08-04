package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	conformance "capsule.local/capsule/experiments/gate-c-p0-3-protocol-conformance"
)

type fixtureRecord struct {
	Name                    string                      `json:"name"`
	File                    string                      `json:"file"`
	SHA256                  string                      `json:"sha256"`
	Bytes                   int                         `json:"bytes"`
	EndpointRole            conformance.Role            `json:"endpointRole"`
	ExpectedDisposition     conformance.Disposition     `json:"expectedDisposition"`
	RunnerLifecycle         conformance.RunnerLifecycle `json:"runnerLifecycle,omitempty"`
	ExpectedOrdinarySuccess bool                        `json:"expectedOrdinarySuccess"`
}

type fixtureManifest struct {
	Status     string            `json:"status"`
	Version    uint16            `json:"version"`
	Layout     map[string]uint64 `json:"layout"`
	BindingHex map[string]string `json:"bindingHex"`
	Cases      []fixtureRecord   `json:"cases"`
}

type measurementRecord struct {
	Name               string                  `json:"name"`
	EndpointRole       conformance.Role        `json:"endpointRole"`
	ChunkBytes         int                     `json:"chunkBytes"`
	InputBytes         uint64                  `json:"inputBytes"`
	DrainedBytes       uint64                  `json:"drainedBytes"`
	RetainedBytes      uint64                  `json:"retainedBytes"`
	Disposition        conformance.Disposition `json:"disposition"`
	ElapsedNanoseconds int64                   `json:"elapsedNanoseconds"`
}

type measurementEvidence struct {
	Status      string              `json:"status"`
	ObservedAt  string              `json:"observedAt"`
	Environment map[string]string   `json:"environment"`
	Records     []measurementRecord `json:"records"`
	Flood       measurementRecord   `json:"flood"`
}

func main() {
	root := flag.String("root", "experiments/gate-c-p0-3-protocol-conformance", "experiment directory from the current working directory")
	verifyOnly := flag.Bool("verify", false, "verify retained fixture bytes instead of rewriting them")
	flag.Parse()

	if *verifyOnly {
		must(verifyFixtures(*root))
		fmt.Println("retained P0-3 fixtures verified")
		return
	}
	must(writeFixtures(*root))
	must(writeMeasurements(*root))
	fmt.Println("retained P0-3 fixtures and measurement evidence written")
}

func writeFixtures(root string) error {
	casesDirectory := filepath.Join(root, "fixtures", "cases")
	if err := os.MkdirAll(casesDirectory, 0o755); err != nil {
		return err
	}

	records := make([]fixtureRecord, 0, len(conformance.CandidateFixtures()))
	for _, fixture := range conformance.CandidateFixtures() {
		filename := fixture.Name + ".bin"
		path := filepath.Join(casesDirectory, filename)
		if err := os.WriteFile(path, fixture.Bytes, 0o644); err != nil {
			return err
		}
		digest := sha256.Sum256(fixture.Bytes)
		records = append(records, fixtureRecord{
			Name:                    fixture.Name,
			File:                    filepath.ToSlash(filepath.Join("cases", filename)),
			SHA256:                  hex.EncodeToString(digest[:]),
			Bytes:                   len(fixture.Bytes),
			EndpointRole:            fixture.EndpointRole,
			ExpectedDisposition:     fixture.ExpectedDisposition,
			RunnerLifecycle:         fixture.RunnerLifecycle,
			ExpectedOrdinarySuccess: fixture.ExpectedOrdinarySuccess,
		})
	}
	sort.Slice(records, func(left, right int) bool { return records[left].Name < records[right].Name })
	binding := conformance.CandidateBinding()
	manifest := fixtureManifest{
		Status:  "development-only candidate; not a frozen product contract",
		Version: conformance.Version,
		Layout: map[string]uint64{
			"sourcePayloadMax":       conformance.SourcePayloadMax,
			"canonicalInputMax":      conformance.CanonicalInputMax,
			"inlineJSONPayloadMax":   conformance.InlineJSONPayloadMax,
			"dataHeaderLength":       conformance.DataHeaderLength,
			"completionHeaderLength": conformance.CompletionHeaderLength,
			"commitTrailerLength":    conformance.CommitTrailerLength,
			"sourcePhysicalMax":      conformance.SourcePhysicalMax,
			"inputPhysicalMax":       conformance.InputPhysicalMax,
			"completionPhysicalMax":  conformance.CompletionPhysicalMax,
		},
		BindingHex: map[string]string{
			"attemptId":            hex.EncodeToString(binding.AttemptID[:]),
			"registrationId":       hex.EncodeToString(binding.RegistrationID[:]),
			"planDigest":           hex.EncodeToString(binding.PlanDigest[:]),
			"runtimeProfileDigest": hex.EncodeToString(binding.RuntimeProfileDigest[:]),
		},
		Cases: records,
	}
	return writeJSON(filepath.Join(root, "fixtures", "manifest.json"), manifest)
}

func verifyFixtures(root string) error {
	manifestBytes, err := os.ReadFile(filepath.Join(root, "fixtures", "manifest.json"))
	if err != nil {
		return err
	}
	var manifest fixtureManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return err
	}
	expectedCases := make(map[string]conformance.FixtureCase)
	for _, fixture := range conformance.CandidateFixtures() {
		expectedCases[fixture.Name] = fixture
	}
	if len(manifest.Cases) != len(expectedCases) {
		return fmt.Errorf("manifest has %d cases, generator has %d", len(manifest.Cases), len(expectedCases))
	}
	listedFiles := make(map[string]struct{})
	expectedBinding := conformance.CandidateExpectedBinding()
	for _, record := range manifest.Cases {
		fixture, ok := expectedCases[record.Name]
		if !ok {
			return fmt.Errorf("manifest lists unknown generated case %s", record.Name)
		}
		if record.EndpointRole != fixture.EndpointRole ||
			record.ExpectedDisposition != fixture.ExpectedDisposition ||
			record.RunnerLifecycle != fixture.RunnerLifecycle ||
			record.ExpectedOrdinarySuccess != fixture.ExpectedOrdinarySuccess {
			return fmt.Errorf("fixture %s metadata differs from generator", record.Name)
		}
		contents, err := os.ReadFile(filepath.Join(root, "fixtures", filepath.FromSlash(record.File)))
		if err != nil {
			return err
		}
		listedFiles[filepath.Base(record.File)] = struct{}{}
		digest := sha256.Sum256(contents)
		if len(contents) != record.Bytes || hex.EncodeToString(digest[:]) != record.SHA256 {
			return fmt.Errorf("fixture %s does not match manifest", record.Name)
		}
		if !bytes.Equal(contents, fixture.Bytes) {
			return fmt.Errorf("fixture %s does not match deterministic generator bytes", record.Name)
		}
		drain := conformance.DrainCapPlusOne(context.Background(), io.NopCloser(bytes.NewReader(contents)), conformance.PhysicalMaximum(record.EndpointRole))
		var disposition conformance.Disposition
		var ordinarySuccess bool
		if record.EndpointRole == conformance.RoleCompletion {
			observed := conformance.ObserveCompletion(drain, expectedBinding, record.RunnerLifecycle)
			disposition = observed.Frame.Disposition
			ordinarySuccess = observed.OrdinarySuccess
		} else {
			disposition = conformance.ValidateDataFrame(drain.Retained, record.EndpointRole, expectedBinding, drain.DrainedBytes).Disposition
		}
		if disposition != record.ExpectedDisposition || ordinarySuccess != record.ExpectedOrdinarySuccess {
			return fmt.Errorf("fixture %s observed %s/success=%t, expected %s/success=%t", record.Name, disposition, ordinarySuccess, record.ExpectedDisposition, record.ExpectedOrdinarySuccess)
		}
		delete(expectedCases, record.Name)
	}
	if len(expectedCases) != 0 {
		return fmt.Errorf("manifest omits %d generated cases", len(expectedCases))
	}
	directoryEntries, err := os.ReadDir(filepath.Join(root, "fixtures", "cases"))
	if err != nil {
		return err
	}
	for _, entry := range directoryEntries {
		if entry.IsDir() {
			return fmt.Errorf("unexpected directory in fixture cases: %s", entry.Name())
		}
		if _, ok := listedFiles[entry.Name()]; !ok {
			return fmt.Errorf("unlisted fixture file: %s", entry.Name())
		}
	}
	return nil
}

func writeMeasurements(root string) error {
	if err := os.MkdirAll(filepath.Join(root, "evidence"), 0o755); err != nil {
		return err
	}
	wanted := map[string]bool{
		"source-payload-exact":             true,
		"source-payload-cap-plus-one":      true,
		"input-payload-exact":              true,
		"input-payload-cap-plus-one":       true,
		"completion-json-exact":            true,
		"completion-physical-cap-plus-one": true,
	}
	expected := conformance.CandidateExpectedBinding()
	var records []measurementRecord
	for _, fixture := range conformance.CandidateFixtures() {
		if !wanted[fixture.Name] {
			continue
		}
		for _, chunkSize := range []int{1, 7, 4096, 65536} {
			reader := &chunkReadCloser{reader: bytes.NewReader(fixture.Bytes), chunkBytes: chunkSize}
			started := time.Now()
			drain := conformance.DrainCapPlusOne(context.Background(), reader, conformance.PhysicalMaximum(fixture.EndpointRole))
			var disposition conformance.Disposition
			if fixture.EndpointRole == conformance.RoleCompletion {
				disposition = conformance.ObserveCompletion(drain, expected, conformance.RunnerCleanExit).Frame.Disposition
			} else {
				disposition = conformance.ValidateDataFrame(drain.Retained, fixture.EndpointRole, expected, drain.DrainedBytes).Disposition
			}
			records = append(records, measurementRecord{
				Name:               fixture.Name,
				EndpointRole:       fixture.EndpointRole,
				ChunkBytes:         chunkSize,
				InputBytes:         uint64(len(fixture.Bytes)),
				DrainedBytes:       drain.DrainedBytes,
				RetainedBytes:      drain.RetainedBytes,
				Disposition:        disposition,
				ElapsedNanoseconds: time.Since(started).Nanoseconds(),
			})
		}
	}
	floodLength := conformance.CompletionPhysicalMax * 4
	started := time.Now()
	floodDrain := conformance.DrainCapPlusOne(context.Background(), io.NopCloser(bytes.NewReader(bytes.Repeat([]byte{0xa5}, int(floodLength)))), conformance.CompletionPhysicalMax)
	floodValidation := conformance.ValidateCompletionFrame(floodDrain.Retained, expected, floodDrain.DrainedBytes)
	evidence := measurementEvidence{
		Status:     "observed local harness evidence; not backend or production evidence",
		ObservedAt: time.Now().UTC().Format(time.RFC3339),
		Environment: map[string]string{
			"go":          runtime.Version(),
			"goos":        runtime.GOOS,
			"goarch":      runtime.GOARCH,
			"logicalCpus": fmt.Sprintf("%d", runtime.NumCPU()),
			"macos":       commandOutput("sw_vers", "-productVersion"),
			"darwin":      commandOutput("uname", "-r"),
			"gitRevision": commandOutput("git", "rev-parse", "HEAD"),
			"command":     "go run ./experiments/gate-c-p0-3-protocol-conformance/cmd/p0-3-conformance",
		},
		Records: records,
		Flood: measurementRecord{
			Name:               "completion-output-flood-four-times-cap",
			EndpointRole:       conformance.RoleCompletion,
			ChunkBytes:         32768,
			InputBytes:         floodLength,
			DrainedBytes:       floodDrain.DrainedBytes,
			RetainedBytes:      floodDrain.RetainedBytes,
			Disposition:        floodValidation.Disposition,
			ElapsedNanoseconds: time.Since(started).Nanoseconds(),
		},
	}
	return writeJSON(filepath.Join(root, "evidence", "measurement.json"), evidence)
}

func commandOutput(name string, args ...string) string {
	output, err := exec.Command(name, args...).Output()
	if err != nil {
		return "unavailable: " + err.Error()
	}
	return strings.TrimSpace(string(output))
}

func writeJSON(path string, value any) error {
	contents, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	contents = append(contents, '\n')
	return os.WriteFile(path, contents, 0o644)
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

type chunkReadCloser struct {
	reader     *bytes.Reader
	chunkBytes int
}

func (reader *chunkReadCloser) Read(buffer []byte) (int, error) {
	if len(buffer) > reader.chunkBytes {
		buffer = buffer[:reader.chunkBytes]
	}
	return reader.reader.Read(buffer)
}

func (*chunkReadCloser) Close() error { return nil }
