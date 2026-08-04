// Command fx-footprint measures a minimal reachable fxamacker profile.
package main

import (
	"fmt"
	"reflect"

	"github.com/fxamacker/cbor/v2"
)

func main() {
	enc, err := cbor.CanonicalEncOptions().EncMode()
	if err != nil {
		panic(err)
	}
	dec, err := (cbor.DecOptions{DupMapKey: cbor.DupMapKeyEnforcedAPF}).DecMode()
	if err != nil {
		panic(err)
	}
	fmt.Print(reflect.TypeOf(enc).NumMethod() + reflect.TypeOf(dec).NumMethod())
}
