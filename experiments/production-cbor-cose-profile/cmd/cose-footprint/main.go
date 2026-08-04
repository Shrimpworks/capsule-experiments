// Command cose-footprint measures a minimal reachable go-cose Sign1 value.
package main

import (
	"fmt"
	"reflect"

	cose "github.com/veraison/go-cose"
)

func main() {
	message := cose.NewSign1Message()
	fmt.Print(reflect.TypeOf(message).NumMethod())
}
