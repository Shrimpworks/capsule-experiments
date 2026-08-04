// Command footprint exists only to make the comparison harness's exported
// method set reachable for a reproducible stripped-binary footprint measure.
package main

import (
	"fmt"
	"reflect"

	profile "capsule.local/capsule/experiments/production-cbor-cose-profile"
)

func main() {
	p, err := profile.New()
	if err != nil {
		panic(err)
	}
	fmt.Print(reflect.TypeOf(p).NumMethod())
}
