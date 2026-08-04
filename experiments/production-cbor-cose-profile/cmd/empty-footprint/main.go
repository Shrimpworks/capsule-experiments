// Command empty-footprint is the stdlib-only baseline for cmd/footprint.
package main

import (
	"fmt"
	"reflect"
)

func main() {
	fmt.Print(reflect.TypeOf((*int)(nil)).NumMethod())
}
