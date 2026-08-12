package main

import (
	"flag"
	"fmt"
	"os"

	supervisorseam "capsule.local/experiments/broker-live-signing-c6b1-supervisor-seam"
)

func main() {
	fixturePath := flag.String("fixture", "fixtures/supervisor-seam-v0.json", "test-only verified approval fixture")
	resultPath := flag.String("result", "evidence/2026-08-11/result.json", "retained matrix result")
	flag.Parse()
	fixtureRaw, err := os.ReadFile(*fixturePath)
	if err != nil {
		fatal(err)
	}
	fixture, err := supervisorseam.LoadFixture(*fixturePath)
	if err != nil {
		fatal(err)
	}
	result, err := supervisorseam.LoadAndValidateResult(*resultPath, fixture, fixtureRaw)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("verified %s: %d rows\n", result.Status, len(result.Rows))
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
