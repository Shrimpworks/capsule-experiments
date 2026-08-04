package hardening

import "testing"

func TestGeneratedCorpus(t *testing.T) {
	profile, err := NewProfile()
	if err != nil {
		t.Fatal(err)
	}
	corpus, err := profile.Corpus()
	if err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) < 60 {
		t.Fatalf("corpus unexpectedly small: %d", len(corpus.Cases))
	}
	seen := map[string]bool{}
	for _, testCase := range corpus.Cases {
		t.Run(testCase.Name, func(t *testing.T) {
			if seen[testCase.Name] {
				t.Fatalf("duplicate corpus name %q", testCase.Name)
			}
			seen[testCase.Name] = true
			wire, err := DecodeBase64URL(testCase.Wire)
			if err != nil {
				t.Fatal(err)
			}
			err = profile.Verify(testCase.Profile, wire)
			if testCase.Expectation == "accept" && err != nil {
				t.Fatalf("positive rejected: %v", err)
			}
			if testCase.Expectation == "reject" && err == nil {
				t.Fatal("negative accepted")
			}
		})
	}
}

func TestBothProfilesSignAndRejectCrossObject(t *testing.T) {
	profile, err := NewProfile()
	if err != nil {
		t.Fatal(err)
	}
	for _, kind := range []Kind{ApprovalGrantKind, EnforcementTranscriptKind} {
		wire, err := profile.Sign(kind)
		if err != nil {
			t.Fatal(err)
		}
		if err := profile.Verify(kind, wire); err != nil {
			t.Fatalf("%s rejected: %v", kind, err)
		}
		other := ApprovalGrantKind
		if kind == ApprovalGrantKind {
			other = EnforcementTranscriptKind
		}
		if err := profile.Verify(other, wire); err == nil {
			t.Fatalf("%s accepted as %s", kind, other)
		}
	}
}

func FuzzVerifyNeverPanics(f *testing.F) {
	profile, err := NewProfile()
	if err != nil {
		f.Fatal(err)
	}
	corpus, err := profile.Corpus()
	if err != nil {
		f.Fatal(err)
	}
	for index, testCase := range corpus.Cases {
		wire, err := DecodeBase64URL(testCase.Wire)
		if err != nil {
			f.Fatal(err)
		}
		f.Add(byte(index), wire)
	}
	f.Fuzz(func(_ *testing.T, selector byte, wire []byte) {
		kind := ApprovalGrantKind
		if selector&1 == 1 {
			kind = EnforcementTranscriptKind
		}
		// The wrapper must apply its raw bound before ordinary CBOR work and
		// return an error, never panic, for arbitrary bytes.
		_ = profile.Verify(kind, wire)
	})
}
