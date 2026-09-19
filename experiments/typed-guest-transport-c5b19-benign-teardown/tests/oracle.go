// This package is a read-only, offline experiment oracle. It has no process,
// signal, wait, or live transport authority.
package oracle

import (
	"bytes"
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
