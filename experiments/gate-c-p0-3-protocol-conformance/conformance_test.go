package conformance

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"
)

func TestRetainedFixtureCorpus(t *testing.T) {
	expected := CandidateExpectedBinding()
	for _, fixture := range CandidateFixtures() {
		fixture := fixture
		t.Run(fixture.Name, func(t *testing.T) {
			drain := DrainCapPlusOne(context.Background(), io.NopCloser(bytes.NewReader(fixture.Bytes)), PhysicalMaximum(fixture.EndpointRole))
			if drain.DrainedBytes != uint64(len(fixture.Bytes)) {
				t.Fatalf("drained %d bytes, expected %d", drain.DrainedBytes, len(fixture.Bytes))
			}
			var validation Validation
			if fixture.EndpointRole == RoleCompletion {
				observation := ObserveCompletion(drain, expected, fixture.RunnerLifecycle)
				validation = observation.Frame
				if observation.OrdinarySuccess != fixture.ExpectedOrdinarySuccess {
					t.Fatalf("ordinary success = %t, expected %t", observation.OrdinarySuccess, fixture.ExpectedOrdinarySuccess)
				}
			} else {
				validation = ValidateDataFrame(drain.Retained, fixture.EndpointRole, expected, drain.DrainedBytes)
			}
			if validation.Disposition != fixture.ExpectedDisposition {
				t.Fatalf("disposition %s, expected %s: %s", validation.Disposition, fixture.ExpectedDisposition, validation.Detail)
			}
		})
	}
}

func TestOutputFloodIsContinuouslyDrainedWithCapPlusOneRetention(t *testing.T) {
	floodLength := CompletionPhysicalMax * 4
	flood := bytes.Repeat([]byte{0xa5}, int(floodLength))
	drain := DrainCapPlusOne(context.Background(), io.NopCloser(bytes.NewReader(flood)), CompletionPhysicalMax)
	if drain.DrainedBytes != floodLength {
		t.Fatalf("drained %d bytes, expected entire flood %d", drain.DrainedBytes, floodLength)
	}
	if drain.RetainedBytes != CompletionPhysicalMax+1 {
		t.Fatalf("retained %d bytes, expected cap-plus-one %d", drain.RetainedBytes, CompletionPhysicalMax+1)
	}
	if validation := ValidateCompletionFrame(drain.Retained, CandidateExpectedBinding(), drain.DrainedBytes); validation.Disposition != Oversize {
		t.Fatalf("flood disposition %s, expected %s", validation.Disposition, Oversize)
	}
}

func TestReaderStallClosesEndpointAndFailsClosed(t *testing.T) {
	reader, writer := io.Pipe()
	defer writer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	drain := DrainCapPlusOne(ctx, reader, CompletionPhysicalMax)
	if drain.Disposition != ReaderStall {
		t.Fatalf("disposition %s, expected %s", drain.Disposition, ReaderStall)
	}
	if observation := ObserveCompletion(drain, CandidateExpectedBinding(), RunnerCleanExit); observation.OrdinarySuccess {
		t.Fatal("reader stall became ordinary success")
	}
}

func TestReaderDeathFailsClosedAfterPartialProgress(t *testing.T) {
	reader := &errorReadCloser{data: []byte("partial"), err: errors.New("injected reader death")}
	drain := DrainCapPlusOne(context.Background(), reader, CompletionPhysicalMax)
	if drain.Disposition != ReaderDied {
		t.Fatalf("disposition %s, expected %s", drain.Disposition, ReaderDied)
	}
	if drain.DrainedBytes != 7 {
		t.Fatalf("drained %d bytes, expected partial progress", drain.DrainedBytes)
	}
}

func TestEOFAndRunnerExitNeverSubstituteForCommit(t *testing.T) {
	frame, err := EncodeCompletion(CandidateBinding(), StatusSucceeded, []byte(`{"ok":true}`))
	if err != nil {
		t.Fatal(err)
	}
	withoutTrailer := frame[:len(frame)-CommitTrailerLength]
	drain := DrainCapPlusOne(context.Background(), io.NopCloser(bytes.NewReader(withoutTrailer)), CompletionPhysicalMax)
	if !drain.SawEOF {
		t.Fatal("fixture should observe EOF")
	}
	observation := ObserveCompletion(drain, CandidateExpectedBinding(), RunnerCleanExit)
	if observation.Frame.Disposition != MissingCommit || observation.OrdinarySuccess {
		t.Fatalf("EOF/runner exit result = %+v", observation)
	}
}

type errorReadCloser struct {
	data []byte
	err  error
	done bool
}

func (reader *errorReadCloser) Read(buffer []byte) (int, error) {
	if reader.done {
		return 0, reader.err
	}
	reader.done = true
	return copy(buffer, reader.data), nil
}

func (*errorReadCloser) Close() error { return nil }
