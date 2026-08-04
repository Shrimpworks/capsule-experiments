package preflight

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"syscall"
)

const (
	ProfileVCPUs  = 1
	ProfileRAMMiB = 256
)

// Profile is deliberately narrower than libkrun's API. It models only the
// exact development profile evaluated by this experiment.
type Profile struct {
	VCPUs        int
	RAMMiB       int
	DiskFormat   string
	RootReadOnly bool
	Network      bool
	Vsock        bool
	VirtioFS     bool
	GPU          bool
	Sound        bool
	Input        bool
	NestedVirt   bool
}

func ExactProfile() Profile {
	return Profile{
		VCPUs:        ProfileVCPUs,
		RAMMiB:       ProfileRAMMiB,
		DiskFormat:   "raw",
		RootReadOnly: true,
	}
}

func ValidateProfile(profile Profile) error {
	if profile.VCPUs != ProfileVCPUs {
		return fmt.Errorf("vcpus: require %d", ProfileVCPUs)
	}
	if profile.RAMMiB != ProfileRAMMiB {
		return fmt.Errorf("ramMiB: require %d", ProfileRAMMiB)
	}
	if profile.DiskFormat != "raw" {
		return errors.New("diskFormat: require raw")
	}
	if !profile.RootReadOnly {
		return errors.New("rootReadOnly: required")
	}
	if profile.Network || profile.Vsock || profile.VirtioFS || profile.GPU ||
		profile.Sound || profile.Input || profile.NestedVirt {
		return errors.New("optional devices: forbidden")
	}
	return nil
}

type BlockIdentity struct {
	Size   int64
	SHA256 string
}

// OpenVerifiedRawBlock rejects path indirection and non-regular inputs before
// hashing the exact opened file. libkrun v1.19.4 later consumes a pathname, so
// callers must also keep the file and its parent in a non-attacker-writable
// component-owned directory until VM creation finishes.
func OpenVerifiedRawBlock(path string, maxBytes int64, expectedSHA256 string) (*os.File, BlockIdentity, error) {
	if maxBytes <= 0 {
		return nil, BlockIdentity{}, errors.New("maxBytes must be positive")
	}
	if len(expectedSHA256) != sha256.Size*2 {
		return nil, BlockIdentity{}, errors.New("expected SHA-256 must be 64 hex characters")
	}
	if _, err := hex.DecodeString(expectedSHA256); err != nil {
		return nil, BlockIdentity{}, errors.New("expected SHA-256 is not hexadecimal")
	}

	before, err := os.Lstat(path)
	if err != nil {
		return nil, BlockIdentity{}, fmt.Errorf("lstat: %w", err)
	}
	if !before.Mode().IsRegular() {
		return nil, BlockIdentity{}, errors.New("block image must be a regular file without symlink traversal")
	}
	if before.Size() <= 0 || before.Size() > maxBytes {
		return nil, BlockIdentity{}, fmt.Errorf("block image size %d outside 1..%d", before.Size(), maxBytes)
	}
	if before.Mode().Perm()&0o022 != 0 {
		return nil, BlockIdentity{}, errors.New("block image must not be group/world writable")
	}

	fd, err := syscall.Open(path, syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, BlockIdentity{}, fmt.Errorf("open nofollow: %w", err)
	}
	file := os.NewFile(uintptr(fd), path)
	if file == nil {
		_ = syscall.Close(fd)
		return nil, BlockIdentity{}, errors.New("open returned invalid file")
	}
	closeOnError := true
	defer func() {
		if closeOnError {
			_ = file.Close()
		}
	}()

	after, err := file.Stat()
	if err != nil {
		return nil, BlockIdentity{}, fmt.Errorf("fstat: %w", err)
	}
	if !os.SameFile(before, after) || !after.Mode().IsRegular() || after.Size() != before.Size() {
		return nil, BlockIdentity{}, errors.New("block image identity changed during open")
	}

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return nil, BlockIdentity{}, fmt.Errorf("hash: %w", err)
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if actual != expectedSHA256 {
		return nil, BlockIdentity{}, fmt.Errorf("SHA-256 mismatch: got %s", actual)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, BlockIdentity{}, fmt.Errorf("rewind: %w", err)
	}

	closeOnError = false
	return file, BlockIdentity{Size: after.Size(), SHA256: actual}, nil
}
