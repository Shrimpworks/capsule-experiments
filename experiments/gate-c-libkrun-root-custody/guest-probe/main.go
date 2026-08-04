// Development-only guest probe for the P0-1 retained experiment.
package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"os"
)

func main() {
	file, err := os.Open("/dev/vda")
	if err != nil {
		fmt.Fprintf(os.Stderr, "GUEST_ROOT_ERROR operation=open error=%v\n", err)
		os.Exit(71)
	}
	defer file.Close()

	hash := sha256.New()
	length, err := io.Copy(hash, file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "GUEST_ROOT_ERROR operation=read error=%v\n", err)
		os.Exit(72)
	}

	fmt.Printf("GUEST_ROOT_SHA256 digest=%x length=%d\n", hash.Sum(nil), length)
}
