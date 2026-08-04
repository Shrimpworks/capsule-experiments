package preflight

import (
	"crypto/sha256"
	"encoding/hex"
	"math/rand"
	"os"
	"path/filepath"
	"testing"
)

func TestValidateProfileExactAndMutations(t *testing.T) {
	exact := ExactProfile()
	if err := ValidateProfile(exact); err != nil {
		t.Fatalf("exact profile rejected: %v", err)
	}

	mutations := []Profile{
		{VCPUs: 2, RAMMiB: 256, DiskFormat: "raw", RootReadOnly: true},
		{VCPUs: 1, RAMMiB: 128, DiskFormat: "raw", RootReadOnly: true},
		{VCPUs: 1, RAMMiB: 256, DiskFormat: "qcow2", RootReadOnly: true},
		{VCPUs: 1, RAMMiB: 256, DiskFormat: "raw"},
	}
	for field := 0; field < 7; field++ {
		profile := exact
		switch field {
		case 0:
			profile.Network = true
		case 1:
			profile.Vsock = true
		case 2:
			profile.VirtioFS = true
		case 3:
			profile.GPU = true
		case 4:
			profile.Sound = true
		case 5:
			profile.Input = true
		case 6:
			profile.NestedVirt = true
		}
		mutations = append(mutations, profile)
	}
	for index, mutation := range mutations {
		if err := ValidateProfile(mutation); err == nil {
			t.Errorf("mutation %d accepted: %+v", index, mutation)
		}
	}
}

func TestValidateProfileDeterministicPropertyCorpus(t *testing.T) {
	random := rand.New(rand.NewSource(0xCA5C01E))
	accepted := 0
	for index := 0; index < 10_000; index++ {
		profile := Profile{
			VCPUs:        random.Intn(5),
			RAMMiB:       []int{0, 64, 128, 256, 512}[random.Intn(5)],
			DiskFormat:   []string{"", "raw", "qcow2", "vmdk"}[random.Intn(4)],
			RootReadOnly: random.Intn(2) == 1,
			Network:      random.Intn(2) == 1,
			Vsock:        random.Intn(2) == 1,
			VirtioFS:     random.Intn(2) == 1,
			GPU:          random.Intn(2) == 1,
			Sound:        random.Intn(2) == 1,
			Input:        random.Intn(2) == 1,
			NestedVirt:   random.Intn(2) == 1,
		}
		if ValidateProfile(profile) == nil {
			accepted++
			if profile != ExactProfile() {
				t.Fatalf("non-exact profile accepted: %+v", profile)
			}
		}
	}
	t.Logf("deterministic profiles accepted=%d/10000", accepted)
}

func TestOpenVerifiedRawBlock(t *testing.T) {
	directory := t.TempDir()
	valid := filepath.Join(directory, "root.raw")
	contents := []byte("bounded raw fixture")
	if err := os.WriteFile(valid, contents, 0o444); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(contents)
	digest := hex.EncodeToString(hash[:])
	file, identity, err := OpenVerifiedRawBlock(valid, 1024, digest)
	if err != nil {
		t.Fatalf("valid block rejected: %v", err)
	}
	_ = file.Close()
	if identity.Size != int64(len(contents)) || identity.SHA256 != digest {
		t.Fatalf("wrong identity: %+v", identity)
	}

	symlink := filepath.Join(directory, "root-link.raw")
	if err := os.Symlink(valid, symlink); err != nil {
		t.Fatal(err)
	}
	if _, _, err := OpenVerifiedRawBlock(symlink, 1024, digest); err == nil {
		t.Error("symlink accepted")
	}
	if _, _, err := OpenVerifiedRawBlock(directory, 1024, digest); err == nil {
		t.Error("directory accepted")
	}
	if _, _, err := OpenVerifiedRawBlock(valid, 4, digest); err == nil {
		t.Error("oversized file accepted")
	}
	if _, _, err := OpenVerifiedRawBlock(valid, 1024, string(make([]byte, 64))); err == nil {
		t.Error("non-hex digest accepted")
	}
	if _, _, err := OpenVerifiedRawBlock(valid, 1024, hex.EncodeToString(make([]byte, 32))); err == nil {
		t.Error("digest mismatch accepted")
	}

	writable := filepath.Join(directory, "writable.raw")
	if err := os.WriteFile(writable, contents, 0o666); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(writable, 0o666); err != nil {
		t.Fatal(err)
	}
	if _, _, err := OpenVerifiedRawBlock(writable, 1024, digest); err == nil {
		t.Error("group/world-writable image accepted")
	}
}

func FuzzValidateProfile(f *testing.F) {
	f.Add(uint8(1), uint16(256), uint8(0), uint16(0))
	f.Add(uint8(0), uint16(0), uint8(255), uint16(0xffff))
	f.Fuzz(func(t *testing.T, vcpus uint8, ram uint16, format uint8, flags uint16) {
		formats := []string{"raw", "qcow2", "vmdk", ""}
		profile := Profile{
			VCPUs:        int(vcpus),
			RAMMiB:       int(ram),
			DiskFormat:   formats[int(format)%len(formats)],
			RootReadOnly: flags&1 != 0,
			Network:      flags&(1<<1) != 0,
			Vsock:        flags&(1<<2) != 0,
			VirtioFS:     flags&(1<<3) != 0,
			GPU:          flags&(1<<4) != 0,
			Sound:        flags&(1<<5) != 0,
			Input:        flags&(1<<6) != 0,
			NestedVirt:   flags&(1<<7) != 0,
		}
		if ValidateProfile(profile) == nil && profile != ExactProfile() {
			t.Fatalf("non-exact profile accepted: %+v", profile)
		}
	})
}
