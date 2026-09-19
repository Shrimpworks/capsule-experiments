// This package is a read-only, offline experiment oracle. It has no process,
// signal, wait, or live transport authority.
package oracle

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
)

type cancelBindings struct {
	Attempt      [16]byte
	Approval     [16]byte
	Registration [16]byte
}

var errCancellationFrame = errors.New("C5B19_CANCEL_FRAME")

// validateCancellationFrame accepts only the one exact harness event frozen
// in the Gate-2 packet. Matching a PID, path, timestamp, or substitute binding
// is intentionally not an option.
func validateCancellationFrame(frame []byte, frozen cancelBindings) error {
	if frozen.Attempt == [16]byte{} || frozen.Approval == [16]byte{} ||
		frozen.Registration == [16]byte{} || frozen.Attempt == frozen.Approval ||
		frozen.Attempt == frozen.Registration || frozen.Approval == frozen.Registration {
		return errCancellationFrame
	}
	if len(frame) != 57 || !bytes.Equal(frame[:8], []byte{'C', '5', 'C', 'N', 1, 1, 0, 57}) ||
		!bytes.Equal(frame[8:24], frozen.Attempt[:]) ||
		!bytes.Equal(frame[24:40], frozen.Approval[:]) ||
		!bytes.Equal(frame[40:56], frozen.Registration[:]) || frame[56] != 1 {
		return errCancellationFrame
	}
	return nil
}

var errProcessObservation = errors.New("C5B19_PROCESS_OBSERVATION")

// deriveProcessIdentity is an offline binding calculation only. Its digest
// does not grant PID-targeting or signal authority; that requires exact live
// same-parent custody and an exclusive unreaped child in the Supervisor.
func deriveProcessIdentity(attempt [16]byte, pid uint32, sequence, tick uint64, fixtureDigest [32]byte) ([32]byte, error) {
	if attempt == [16]byte{} || pid == 0 || pid > 1<<31-1 || sequence == 0 || tick == 0 || fixtureDigest == [32]byte{} {
		return [32]byte{}, errProcessObservation
	}
	var fields [20]byte
	binary.BigEndian.PutUint32(fields[0:4], pid)
	binary.BigEndian.PutUint64(fields[4:12], sequence)
	binary.BigEndian.PutUint64(fields[12:20], tick)
	hash := sha256.New()
	hash.Write([]byte("capsule.c5b19.process-identity/v1\x00"))
	hash.Write(attempt[:])
	hash.Write(fields[:])
	hash.Write(fixtureDigest[:])
	var identity [32]byte
	copy(identity[:], hash.Sum(nil))
	return identity, nil
}

type obligationBindings struct {
	Installation [16]byte
	TrustEpoch   [32]byte
	Supervisor   [32]byte
	Attempt      [16]byte
	Approval     [16]byte
	Registration [16]byte
	Plan         [32]byte
	Profile      [32]byte
	Runner       [32]byte
	Preparation  [16]byte
}

var errObligationBinding = errors.New("C5B19_OBLIGATION_BINDING")

// encodeObligationPreimage builds the immutable, cleanup-only v1 obligation
// preimage. Changing policy, trigger mask or bindings requires a new packet.
func encodeObligationPreimage(b obligationBindings) ([]byte, error) {
	ids := [5][16]byte{b.Installation, b.Attempt, b.Approval, b.Registration, b.Preparation}
	digests := [5][32]byte{b.TrustEpoch, b.Supervisor, b.Plan, b.Profile, b.Runner}
	for i, id := range ids {
		if id == [16]byte{} {
			return nil, errObligationBinding
		}
		for j := 0; j < i; j++ {
			if id == ids[j] {
				return nil, errObligationBinding
			}
		}
	}
	for i, digest := range digests {
		if digest == [32]byte{} {
			return nil, errObligationBinding
		}
		for j := 0; j < i; j++ {
			if digest == digests[j] {
				return nil, errObligationBinding
			}
		}
	}
	preimage := make([]byte, 0, 295)
	preimage = append(preimage, []byte("capsule.c5b19.obligation/v1\x00")...)
	preimage = append(preimage, 0, 1)
	preimage = append(preimage, b.Installation[:]...)
	preimage = append(preimage, b.TrustEpoch[:]...)
	preimage = append(preimage, b.Supervisor[:]...)
	preimage = append(preimage, b.Attempt[:]...)
	preimage = append(preimage, b.Approval[:]...)
	preimage = append(preimage, b.Registration[:]...)
	preimage = append(preimage, b.Plan[:]...)
	preimage = append(preimage, b.Profile[:]...)
	preimage = append(preimage, b.Runner[:]...)
	preimage = append(preimage, b.Preparation[:]...)
	var clocks [24]byte
	binary.BigEndian.PutUint64(clocks[0:8], 1000)
	binary.BigEndian.PutUint64(clocks[8:16], 1000)
	binary.BigEndian.PutUint64(clocks[16:24], 1200)
	preimage = append(preimage, clocks[:]...)
	preimage = append(preimage, 0x07)
	return preimage, nil
}
