# Offline measurements

Host: Apple M1 Max, darwin/arm64. Experiment toolchain: Go 1.23.4. All decisive module commands
used `GOPROXY=off`; the package reported 86.1% statement coverage (footprint commands excluded).

## Sustained fuzz

| Target | Duration | Executions | New interesting | Result |
| --- | ---: | ---: | ---: | --- |
| `FuzzExecutionPlanProfile` | 31.246 s wall (30 s requested) | 2,793,965 | 184 (191 total corpus) | PASS |
| `FuzzApprovalProfile` | 31.397 s wall (30 s requested) | 2,887,637 | 82 (172 total corpus) | PASS |

## Benchmarks

Three 2-second samples:

| Target | ns/op samples | bytes/op | allocs/op |
| --- | --- | ---: | ---: |
| ExecutionPlan exact, 519 bytes | 8,321; 9,084; 8,901 | 3,426 | 39 |
| ExecutionPlan raw cap+1, 65,537 bytes | 584.1; 646.3; 664.0 | 208 | 6 |
| Approval exact, 375 bytes | 200,781; 196,609; 69,180 | 8,157-8,158 | 117 |
| Approval envelope cap+1, 513 bytes | 24.85; 23.59; 23.61 | 16 | 1 |

`testing.AllocsPerRun(1000)` independently reproduced 39/6 and 117/1 exact/cap+1 allocations.
The focused test process reported raw `getrusage` peak RSS 12,566,528 bytes on Darwin. The approval
timing variance is retained rather than normalized away; all samples remain bounded and the cap+1
path exits before parse/allocation.

## Stripped binary footprint

Built with `-trimpath -ldflags='-s -w'`, CGO enabled, arm64:

| Reachable surface | Bytes | Delta from stdlib baseline |
| --- | ---: | ---: |
| stdlib `fmt`/`reflect` baseline | 1,519,010 | 0 |
| fxamacker + float16 profile modes | 1,672,114 | +153,104 |
| go-cose Sign1 + MVS-selected fxamacker/float16 | 1,822,226 | +303,216 |
| complete comparison wrapper | 1,822,210 | +303,200 |

The footprint commands deliberately make the relevant exported method sets reachable. These are
comparative linker measurements, not installed product-size promises.

## Retained cross-language replay

With Go module lookup set to `GOPROXY=off`, pnpm set to `--offline`, Swift dependencies restored
from the existing SwiftPM cache, and Git forced through an unbound localhost proxy, the retained
Go/TypeScript/Swift Gate A2 checks were rerun:

- the base profile passed all three producers against all three verifiers (`verified=3` in each);
- the hardening corpus returned `accepted:4,rejected:86` in Go, TypeScript, and Swift;
- both `approval-grant` and `enforcement-transcript` passed all three producers against all three
  verifiers; and
- TypeScript's 14-test base suite, two-test hardening suite, Swift's 12 negative base vectors, and
  both Go suites passed.

This reruns the retained cross-language evidence; it does not turn the Swift experiment into the
production-shaped wrapper still required by ADR-0019.

## Exact commands

```sh
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-go-cache GOPROXY=off go test ./...
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-cbor-fuzz GOPROXY=off \
  go test -run=^$ -fuzz=FuzzExecutionPlanProfile -fuzztime=30s
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-cose-fuzz GOPROXY=off \
  go test -run=^$ -fuzz=FuzzApprovalProfile -fuzztime=30s
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-bench GOPROXY=off \
  go test -run=^$ -bench=. -benchmem -benchtime=2s -count=3
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-go-cache GOPROXY=off go mod verify
GOTOOLCHAIN=local GOCACHE=/tmp/capsule-profile-go-cache GOPROXY=off go list -m all
```
