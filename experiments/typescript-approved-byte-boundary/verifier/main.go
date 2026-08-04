package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
)

const maxFileBytes = 262144

type record struct {
	Schema      string `json:"schema"`
	Transformer struct {
		Identity            string `json:"identity"`
		NodeVersion         string `json:"nodeVersion"`
		AmaroVersion        string `json:"amaroVersion"`
		SourceArchiveSHA256 string `json:"sourceArchiveSha256"`
		DistributionSHA256  string `json:"distributionSha256"`
		ExecutableSHA256    string `json:"executableSha256"`
	} `json:"transformer"`
	Options struct {
		Digest          string `json:"digest"`
		InputMediaType  string `json:"inputMediaType"`
		OutputMediaType string `json:"outputMediaType"`
		Mode            string `json:"mode"`
	} `json:"options"`
	Source struct {
		Bytes  int    `json:"bytes"`
		SHA256 string `json:"sha256"`
	} `json:"source"`
	Emitted struct {
		Bytes  int    `json:"bytes"`
		SHA256 string `json:"sha256"`
	} `json:"emitted"`
	SourceMap struct {
		Disposition string `json:"disposition"`
	} `json:"sourceMap"`
	Diagnostics struct {
		Policy string `json:"policy"`
		Count  int    `json:"count"`
	} `json:"diagnostics"`
}

func digest(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func verify(value record, source, emitted []byte) error {
	if len(source) > maxFileBytes || len(emitted) > maxFileBytes {
		return errors.New("CAP")
	}
	if value.Schema != "capsule.typescript-transformation-record.v0" ||
		value.Source.Bytes != len(source) || value.Source.SHA256 != digest(source) ||
		value.Emitted.Bytes != len(emitted) || value.Emitted.SHA256 != digest(emitted) {
		return errors.New("BYTE_BINDING")
	}
	if value.Transformer.NodeVersion != "22.22.1" || value.Transformer.AmaroVersion != "1.1.5" ||
		value.Transformer.SourceArchiveSHA256 != "87104b07e7acee748bcc5391e1bc69cf3571caa0fdfb8b1d6b5fd3f9599b7849" ||
		value.Transformer.DistributionSHA256 != "261da057fb25ff2912dd6abb7842fc915ddf7947a2cb3c8cce90875d2b9bb667" ||
		value.Transformer.ExecutableSHA256 != "245e0321af97d3c21dd4e7104457334dfe3c3ba7982d0db75363e354565f8cbb" ||
		value.Transformer.Identity != "3bc25a01c3059776070a5354e7c6560d06f031ef0336c6a96d34c41f5577aec5" {
		return errors.New("TRANSFORMER_BINDING")
	}
	if value.Options.Digest != "cbd7337986e8145ff812da60b79703c7b7a31929d5c9212fae48e4568249de7b" ||
		value.Options.InputMediaType != "application/capsule.typescript-source;v=0;module=esm" ||
		value.Options.OutputMediaType != "application/capsule.javascript-source;v=0;module=esm" ||
		value.Options.Mode != "strip" {
		return errors.New("OPTIONS_BINDING")
	}
	if value.SourceMap.Disposition != "absent" || value.Diagnostics.Policy != "reject-any" || value.Diagnostics.Count != 0 {
		return errors.New("DISPOSITION_BINDING")
	}
	return nil
}

func main() {
	if len(os.Args) != 4 {
		fmt.Fprintln(os.Stderr, "usage: verifier RECORD SOURCE EMITTED")
		os.Exit(2)
	}
	recordBytes, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(recordBytes))
	decoder.DisallowUnknownFields()
	var value record
	if err := decoder.Decode(&value); err != nil {
		panic(err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		panic("trailing JSON")
	}
	source, err := os.ReadFile(os.Args[2])
	if err != nil {
		panic(err)
	}
	emitted, err := os.ReadFile(os.Args[3])
	if err != nil {
		panic(err)
	}
	if err := verify(value, source, emitted); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
