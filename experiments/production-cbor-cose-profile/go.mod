module capsule.local/capsule/experiments/production-cbor-cose-profile

go 1.23.0

require (
	capsule.local/capsule v0.0.0
	github.com/fxamacker/cbor/v2 v2.9.2
	github.com/veraison/go-cose v1.3.0
)

require github.com/x448/float16 v0.8.4 // indirect

replace capsule.local/capsule => ../..
