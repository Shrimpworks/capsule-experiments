package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	gatea2 "capsule.local/experiments/gate-a2-cbor-cose"
)

type vectors struct {
	PayloadHex          string            `json:"payloadHex"`
	ProtectedHex        string            `json:"protectedHex"`
	Valid               string            `json:"valid"`
	ValidComplementaryS string            `json:"validComplementaryS"`
	Negative            map[string]string `json:"negative"`
}

func main() {
	profile, err := gatea2.NewProfile()
	fail(err)
	command := "emit"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	switch command {
	case "emit":
		wire, err := profile.Sign()
		fail(err)
		fmt.Println(gatea2.EncodeBase64URL(wire))
	case "verify":
		if len(os.Args) < 3 {
			fail(fmt.Errorf("verify requires at least one base64url envelope"))
		}
		for _, encoded := range os.Args[2:] {
			wire, err := gatea2.DecodeBase64URL(encoded)
			fail(err)
			fail(profile.Verify(wire))
		}
		fmt.Printf("verified=%d\n", len(os.Args)-2)
	case "vectors":
		wire, err := profile.Sign()
		fail(err)
		complement, err := profile.ComplementSignature(wire)
		fail(err)
		payload, err := profile.Payload()
		fail(err)
		protected, err := profile.Protected()
		fail(err)
		negative, err := profile.NegativeVectors()
		fail(err)
		encodedNegative := make(map[string]string, len(negative))
		keys := make([]string, 0, len(negative))
		for name := range negative {
			keys = append(keys, name)
		}
		sort.Strings(keys)
		for _, name := range keys {
			encodedNegative[name] = gatea2.EncodeBase64URL(negative[name])
		}
		out, err := json.MarshalIndent(vectors{
			PayloadHex:          gatea2.Hex(payload),
			ProtectedHex:        gatea2.Hex(protected),
			Valid:               gatea2.EncodeBase64URL(wire),
			ValidComplementaryS: gatea2.EncodeBase64URL(complement),
			Negative:            encodedNegative,
		}, "", "  ")
		fail(err)
		fmt.Println(string(out))
	default:
		fail(fmt.Errorf("unknown command %q", command))
	}
}

func fail(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
