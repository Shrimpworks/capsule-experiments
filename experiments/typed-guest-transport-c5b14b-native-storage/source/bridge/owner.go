package main

/*
#include "api.h"
*/
import "C"

import (
	"bytes"
	"capsule.experiments/c5b14b/store"
	"crypto/sha256"
	"errors"
	"os"
	"sync"
	"unsafe"
)

var bridgeMu sync.Mutex
var owner *store.Store
var uncertain bool
var delivered []byte
var faultEffect, faultEdge, faultMode, activeEffect uint32

func inject(at store.Edge) error {
	edges := map[store.Edge]uint32{store.BeforePublish: 1, store.AfterPublish: 2, store.AfterDirectorySync: 3}
	if faultMode == 0 || activeEffect != faultEffect || edges[at] != faultEdge {
		return nil
	}
	mode := faultMode
	faultMode = 0
	if mode == 2 {
		os.Exit(73)
	}
	return errors.New("fixed publication fault")
}

//export BridgeOpen
func BridgeOpen(create C.int) C.int {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if create != 0 && create != 1 {
		return -1
	}
	if owner != nil {
		if create != 0 {
			return -1
		}
		if owner.Close() != nil {
			return -1
		}
		owner = nil
	}
	var err error
	if create == 1 {
		owner, err = store.Initialize("attempt-state")
		if err == nil {
			err = owner.Close()
			owner = nil
		}
	}
	if err == nil {
		owner, err = store.Open("attempt-state", inject)
	}
	uncertain = err != nil
	delivered = nil
	if err != nil {
		return -1
	}
	return 0
}

func requestFrom(q *C.struct_c5b14b_effect_request) (store.Request, error) {
	var v store.Request
	if q == nil {
		return v, store.ErrRefused
	}
	for i := 0; i < 16; i++ {
		v.Binding.Registration[i] = byte(q.registration_id[i])
		v.Binding.Attempt[i] = byte(q.attempt_id[i])
	}
	for i := 0; i < 32; i++ {
		v.Binding.Plan[i] = byte(q.plan_sha256[i])
		v.Binding.Profile[i] = byte(q.profile_sha256[i])
		v.FrameSHA256[i] = byte(q.frame_sha256[i])
	}
	v.Effect = uint32(q.effect)
	v.Sequence = uint32(q.sequence)
	v.Failure = uint32(q.failed_sequence)
	v.Outcome = uint32(q.observed_outcome)
	v.Step = uint32(q.recovery_step)
	v.Resume = uint32(q.durable_resume_step)
	// Native completion operations carry digest only; fixture core carries its exact bounds.
	if q.maximum_bytes != 0 || q.frame_bytes != 0 {
		return v, store.ErrRefused
	}
	framed := v.Effect == 12 || v.Effect == 13 || v.Effect == 22 || v.Effect == 23
	if framed {
		if v.FrameSHA256 != sha256.Sum256(store.FixtureResult()) {
			return v, store.ErrRefused
		}
		v.MaximumBytes = 4096
		v.FrameBytes = uint32(len(store.FixtureResult()))
	} else if v.FrameSHA256 != ([32]byte{}) {
		return v, store.ErrRefused
	}
	if v.Failure != 0 {
		if v.Outcome < 1 || v.Outcome > 3 {
			return v, store.ErrRefused
		}
		v.Outcome = 3 // Conservative normalization; never upgrade certainty after response loss.
	}
	return v, nil
}

//export BridgeApply
func BridgeApply(q *C.struct_c5b14b_effect_request, r *C.struct_bridge_reply) C.int {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if r == nil {
		return -1
	}
	*r = C.struct_bridge_reply{}
	delivered = nil
	v, err := requestFrom(q)
	if err != nil || owner == nil {
		return -1
	}
	if uncertain {
		if v.Effect < 14 {
			return -1
		}
		if owner.Close() != nil {
			return -1
		}
		owner = nil
		owner, err = store.Open("attempt-state", inject)
		if err != nil {
			return -1
		}
		uncertain = false
	}
	activeEffect = v.Effect
	var cursor store.Cursor
	var result []byte
	var facts uint64
	switch v.Effect {
	case 2:
		err = owner.BeforeSpawn(v)
	case 16:
		err = owner.BeforeTeardown(v)
	case 17, 18, 19, 20:
		err = owner.Checkpoint(v)
	case 12:
		observed := make([]byte, len(store.FixtureResult()))
		if C.bridge_observed_completion((*C.uchar)(unsafe.Pointer(&observed[0])), C.int(len(observed))) != 1 || !bytes.Equal(observed, store.FixtureResult()) {
			return -1
		}
		result, err = owner.CommitCompletion(v, store.Observation{Binding: v.Binding, Scope: store.FixtureObservationScope, Terminal: true, Absent: true, RootRemoved: true, Completion: observed})
		facts = 1 << 12
	case 13:
		result, err = owner.Deliver(v)
		facts = 1 << 13
	case 14:
		err = owner.Fence(v)
		facts = 1 << 14
	case 15:
		cursor, err = owner.LookupFenced(v)
		facts = 1 << 15
	case 21:
		err = owner.RecordUnresolved(v)
		facts = 1 << 17
	case 22:
		err = owner.ReopenCompletion(v)
		facts = 1<<18 | 1<<12
	case 23:
		result, err = owner.Replay(v)
		facts = 1<<19 | 1<<12
	case 24:
		cursor, err = owner.LookupRecovery(v)
		facts = 1 << 15
		if cursor.Fresh {
			facts = 1 << 20
			r.fresh = 1
		}
	default:
		return -1
	}
	if err != nil {
		uncertain = errors.Is(err, store.ErrFenced) || errors.Is(err, store.ErrIndeterminate)
		return -1
	}
	if v.Effect == 13 || v.Effect == 23 {
		delivered = bytes.Clone(result)
	}
	r.facts = C.uint64_t(facts)
	r.failure = C.uint32_t(cursor.Failure)
	r.step = C.uint32_t(cursor.Step)
	r.resume = C.uint32_t(cursor.Resume)
	return 0
}

//export BridgeFact
func BridgeFact(selector C.int) C.int {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if selector == 8 {
		return C.int(faultMode)
	}
	if owner == nil {
		return -1
	}
	v, err := owner.View()
	if err != nil {
		return -1
	}
	var b bool
	switch selector {
	case 1:
		b = v.SpawnIntent
	case 2:
		b = v.Fenced
	case 3:
		b = v.Unresolved
	case 4:
		b = v.Completed
	case 5:
		return C.int(v.Step)
	case 6:
		return C.int(v.Resume)
	case 7:
		return C.int(v.Generation)
	default:
		return -1
	}
	if b {
		return 1
	}
	return 0
}

//export BridgeCopyDelivery
func BridgeCopyDelivery(out *C.uchar, capacity C.int) C.int {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if owner == nil || uncertain {
		return -1
	}
	view, err := owner.View()
	if err != nil || !view.Completed {
		delivered = nil
		return -1
	}
	if out == nil || int(capacity) != len(store.FixtureResult()) || len(delivered) != int(capacity) {
		return -1
	}
	copy(unsafe.Slice((*byte)(unsafe.Pointer(out)), int(capacity)), delivered)
	return capacity
}

//export BridgeSetFault
func BridgeSetFault(effect, edge, mode C.int) C.int {
	bridgeMu.Lock()
	defer bridgeMu.Unlock()
	if effect < 2 || effect > 24 || edge < 1 || edge > 3 || mode < 1 || mode > 2 {
		return -1
	}
	faultEffect = uint32(effect)
	faultEdge = uint32(edge)
	faultMode = uint32(mode)
	return 0
}
