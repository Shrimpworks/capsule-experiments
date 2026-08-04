package main

import (
	"encoding/json"
	"fmt"
	"os"

	hardening "capsule.local/experiments/gate-a2-profile-hardening"
)

func main() {
	profile, err := hardening.NewProfile()
	fail(err)
	if len(os.Args) < 2 {
		fail(fmt.Errorf("usage: hardening corpus PATH | corpus-check PATH | emit KIND | verify KIND ENVELOPE..."))
	}
	switch os.Args[1] {
	case "corpus":
		if len(os.Args) != 3 {
			fail(fmt.Errorf("corpus requires output path"))
		}
		corpus, err := profile.Corpus()
		fail(err)
		encoded, err := corpus.JSON()
		fail(err)
		fail(os.WriteFile(os.Args[2], append(encoded, '\n'), 0o600))
		fmt.Printf("corpus=%s cases=%d\n", os.Args[2], len(corpus.Cases))
	case "corpus-check":
		if len(os.Args) != 3 {
			fail(fmt.Errorf("corpus-check requires input path"))
		}
		raw, err := os.ReadFile(os.Args[2])
		fail(err)
		var corpus hardening.Corpus
		fail(json.Unmarshal(raw, &corpus))
		accepted, rejected := 0, 0
		for _, testCase := range corpus.Cases {
			wire, err := hardening.DecodeBase64URL(testCase.Wire)
			fail(err)
			err = profile.Verify(testCase.Profile, wire)
			if testCase.Expectation == "accept" && err != nil {
				fail(fmt.Errorf("positive rejected %s: %w", testCase.Name, err))
			}
			if testCase.Expectation == "reject" && err == nil {
				fail(fmt.Errorf("negative accepted %s", testCase.Name))
			}
			if err == nil {
				accepted++
			} else {
				rejected++
			}
		}
		fmt.Printf("go-corpus=accepted:%d,rejected:%d\n", accepted, rejected)
	case "emit":
		if len(os.Args) != 3 {
			fail(fmt.Errorf("emit requires profile kind"))
		}
		wire, err := profile.Sign(hardening.Kind(os.Args[2]))
		fail(err)
		fmt.Println(hardening.EncodeBase64URL(wire))
	case "verify":
		if len(os.Args) < 4 {
			fail(fmt.Errorf("verify requires profile kind and envelopes"))
		}
		for _, encoded := range os.Args[3:] {
			wire, err := hardening.DecodeBase64URL(encoded)
			fail(err)
			fail(profile.Verify(hardening.Kind(os.Args[2]), wire))
		}
		fmt.Printf("go-verified=%s:%d\n", os.Args[2], len(os.Args)-3)
	default:
		fail(fmt.Errorf("unknown command %q", os.Args[1]))
	}
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
