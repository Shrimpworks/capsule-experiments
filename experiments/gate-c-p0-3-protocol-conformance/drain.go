package conformance

import (
	"context"
	"errors"
	"io"
)

type DrainObservation struct {
	Retained      []byte      `json:"-"`
	DrainedBytes  uint64      `json:"drainedBytes"`
	RetainedBytes uint64      `json:"retainedBytes"`
	SawEOF        bool        `json:"sawEof"`
	Disposition   Disposition `json:"disposition"`
}

type drainResult struct {
	observation DrainObservation
	err         error
}

// DrainCapPlusOne continuously drains the supplied endpoint. It retains at most cap+1 bytes,
// so an arbitrarily large peer stream cannot cause unbounded growth. EOF only ends transport;
// callers must separately require a valid completion trailer.
func DrainCapPlusOne(ctx context.Context, reader io.ReadCloser, cap uint64) DrainObservation {
	resultChannel := make(chan drainResult, 1)
	go func() {
		resultChannel <- drainAll(reader, cap)
	}()

	select {
	case result := <-resultChannel:
		if result.err != nil {
			result.observation.Disposition = ReaderDied
		}
		return result.observation
	case <-ctx.Done():
		_ = reader.Close()
		result := <-resultChannel
		result.observation.Disposition = ReaderStall
		return result.observation
	}
}

func drainAll(reader io.ReadCloser, cap uint64) drainResult {
	defer reader.Close()
	observation := DrainObservation{Disposition: Accept}
	buffer := make([]byte, 32*1024)
	retainLimit := cap + 1
	for {
		count, err := reader.Read(buffer)
		if count > 0 {
			observation.DrainedBytes += uint64(count)
			remaining := retainLimit - uint64(len(observation.Retained))
			if remaining > 0 {
				keep := uint64(count)
				if keep > remaining {
					keep = remaining
				}
				observation.Retained = append(observation.Retained, buffer[:keep]...)
			}
		}
		if err != nil {
			observation.RetainedBytes = uint64(len(observation.Retained))
			if errors.Is(err, io.EOF) {
				observation.SawEOF = true
				return drainResult{observation: observation}
			}
			return drainResult{observation: observation, err: err}
		}
		if count == 0 {
			continue
		}
	}
}

type RunnerLifecycle string

const (
	RunnerCleanExit RunnerLifecycle = "clean-exit"
	RunnerCrash     RunnerLifecycle = "crash"
)

type CompletionObservation struct {
	Drain           DrainObservation `json:"drain"`
	Frame           Validation       `json:"frame"`
	RunnerLifecycle RunnerLifecycle  `json:"runnerLifecycle"`
	OrdinarySuccess bool             `json:"ordinarySuccess"`
}

func ObserveCompletion(drain DrainObservation, expected ExpectedBinding, lifecycle RunnerLifecycle) CompletionObservation {
	observation := CompletionObservation{Drain: drain, RunnerLifecycle: lifecycle}
	if drain.Disposition != Accept {
		observation.Frame = reject(drain.Disposition, "transport drain did not end normally")
		return observation
	}
	observation.Frame = ValidateCompletionFrame(drain.Retained, expected, drain.DrainedBytes)
	observation.OrdinarySuccess = observation.Frame.Disposition == Accept && observation.Frame.Committed && lifecycle == RunnerCleanExit
	if observation.Frame.Disposition == Accept && lifecycle != RunnerCleanExit {
		observation.Frame.Detail = "frame committed, but runner lifecycle independently failed"
	}
	return observation
}
