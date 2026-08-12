package main

import (
	"flag"
	"fmt"
	"os"

	supervisorseam "capsule.local/experiments/broker-live-signing-c6b1-supervisor-seam"
)

func main() {
	fixturePath := flag.String("fixture", "fixtures/supervisor-seam-v0.json", "test-only verified approval fixture")
	outputPath := flag.String("output", "", "optional retained result JSON path")
	flag.Parse()

	fixtureRaw, err := os.ReadFile(*fixturePath)
	if err != nil {
		fatal(err)
	}
	fixture, err := supervisorseam.LoadFixture(*fixturePath)
	if err != nil {
		fatal(err)
	}
	result, err := supervisorseam.RunMatrix(fixture, fixtureRaw, "")
	if err != nil {
		fatal(err)
	}
	if *outputPath != "" {
		if err := supervisorseam.WriteResult(*outputPath, result); err != nil {
			fatal(err)
		}
	}
	fmt.Printf("%s: %d rows; cleanup=%t\n", result.Status, len(result.Rows), result.CleanupVerified)
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
