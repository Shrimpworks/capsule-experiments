//go:build darwin

package main

import "testing"

func TestPlatformRequirementNegativeCases(t *testing.T) {
	result := runProbe()
	if err := validateProbe(result); err != nil {
		t.Fatal(err)
	}
}

func TestMalformedRequirementsFailClosed(t *testing.T) {
	for _, requirement := range []string{"", "identifier", "anchor and and"} {
		if status := codeRequirementStatus(requirement); status == 0 {
			t.Fatalf("malformed requirement %q was accepted", requirement)
		}
	}
}
