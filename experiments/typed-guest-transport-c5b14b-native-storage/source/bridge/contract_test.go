package main

import "testing"

func TestGoMainCannotSatisfyDefaultReaper(t *testing.T) {
	if BridgeContractCheck() != 0 {
		t.Fatal("Go-main contract changed; re-evaluate probe")
	}
}
