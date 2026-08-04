# Fork-native governed runtime-bundle result

Date: 2026-08-03

Decision: **LINUX/ARM64 CONSTRUCTION BLOCKED; NO BUILD OR RUNTIME ADMISSION**

Admission effect: none. No release was built, published, or signed; no profile was selected or
admitted; `RUNTIME-001` remains unsupported and execution requiring it must refuse.

## Question and answer

Can the exact merged governed Deno and `rusty_v8` fork commits construct the first clean
fork-native standalone Capsule runtime bundle for the intended Linux/arm64 profile, with connected
prefetch limited to declared digest-pinned inputs and a decisive network-disabled build/test phase?

No, not from the current merged fork state. The Deno governed source line is usable as an exact
source input, but the `rusty_v8` governed builder/publication line supports only Linux/amd64. The
experiment stopped before prefetch or compilation, as required, instead of relabeling an amd64
result as arm64.

## Independently verified fork state

Public refs resolved exactly to the requested heads and merges:

| Fork | Governed head | Merge commit | Upstream anchor | Result |
| --- | --- | --- | --- | --- |
| `dills122/deno` | `9adb0b68b55bca81644827f1e7749a3acb091bed` | `ea18b9dc21ff8ebd19347be7095f47937ee14ec2` | `14eea3160ae5834476aa3b9d317b8d41d991b982` | Exact ancestor and merge-parent checks passed. |
| `dills122/rusty_v8` | `a43ee7486c3e05bce5d6e5db586b3e2e688c33cf` | `a31b8f39dc6933d5635367e8ccb67d70f2cc2385` | `d305e6afa7736f6e298c30ae6646f7709ee9382b` | Exact ancestor and merge-parent checks passed. |

The consumed `rusty_v8` head is the follow-up `a43ee748`, not stale original head
`17698ca`. The follow-up is merged on top of the original governed PR, so that old commit remains
history but is not used as the terminal source identity.

The fork-local Deno verifier passed and observed:

- exact upstream anchor;
- exactly three governed built-in ops;
- exact ordered patch digests `f45fda69...bac37` and `9dd33fd4...061e`;
- fixed nominal answer `{"count":3,"label":"capsule-owned","sum":6}`;
- fixed sealed-global answer;
- exact `op_print` restoration mutation refusal; and
- no admission claim.

The fork-local `rusty_v8` input verifier passed the exact baseline and 20-gitlink source closure.
Independent inspection also bound the `source.lock.json`, `builder.lock.json`, output contract, and
all governed build/prefetch/collection/verification scripts by digest.

## Exact fail-fast blocker

The merged `rusty_v8` governance document explicitly selects:

```text
host: linux/amd64
target: x86_64-unknown-linux-gnu
profile: linux-amd64-release-simdutf-v1
```

The architecture is not a single replaceable label. The following are all amd64-specific:

- the Docker builder platform digest and `--platform linux/amd64` invocation;
- the Rust host toolchain and Cargo target;
- the Chromium Clang archive and V8 Rust toolchain under `Linux_x64`;
- apt.llvm.org amd64 `libclang`/`libLLVM` packages and extracted library path;
- the Chromium amd64 sysroot;
- the GN and Ninja CIPD packages;
- offline build/test target and GN output directory;
- static archive and generated-binding filenames; and
- release manifest profile, provenance builder identity, evidence collector, and verifier.

`governance/v150.2.0/README.md` itself states that Linux/arm64 remains required before Capsule can
replace its retained Linux/arm64 evidence. No arm64 builder image digest, host-tool closure,
aarch64 sysroot/toolchain tuple, arm64 expected output contract, or arm64 workflow job exists.

## Closed intended contract

`manifests/input-contract.json` defines the intended Linux/arm64 contract and refuses construction
while any required source archive, tool, source/license/notice subject, generated build metadata,
SBOM, unsigned provenance, standalone-root subject, or exact output identity is missing. It binds
the exact governed fork commits and prior root/fixture oracles but marks all prior binary/snapshot/
root identities as comparison-only. A fork-native build must independently reproduce or explicitly
supersede them; it may not inherit the official prebuilt V8 archive as though the fork built it.

## Smallest next fork change

Add one reviewable Linux/arm64 sibling profile to `dills122/rusty_v8`, based on follow-up head
`a43ee7486c3e05bce5d6e5db586b3e2e688c33cf`, without weakening the amd64 contract:

1. Add an arm64 builder lock containing an exact Linux/arm64 image digest, host Rust toolchain,
   aarch64 target/sysroot, host-executable GN/Ninja, Clang, libclang/bindgen runtime, V8 Rust
   toolchain, environment, and concurrency.
2. Parameterize or add arm64-specific prefetch, offline build, evidence collection, output names,
   release verification, and a workflow job whose decisive phase uses `--network none`.
3. Retain the exact effective `args.gn`, `build.ninja`, generated build settings, GN target graph,
   Ninja graph/deps, archive members, submodule status, tool versions, complete corresponding
   source, notices, SBOM, and unsigned provenance for `aarch64-unknown-linux-gnu`.
4. Run the fixed upstream version test and publish only a CI artifact; do not sign, release, or
   admit it.

Only after that change merges should Capsule perform the clean empty-cache arm64 build, assemble
the fork-native Deno candidate and 22-entry root, and run reproduction, final-link, descriptor,
syscall-seal, TypeScript emitted-JS fixture, and restoration checks.

## Limitations and confidence

Confidence is high in the blocker because it is asserted by the fork documentation and repeated
through every machine-readable lock and build/output script. No compilation was attempted, so this
result makes no claim about eventual arm64 build success, output identity, standalone bundle
identity, syscall behavior, descriptor behavior, same-host equality, or independent builders.

The prior binary `597baba6...6f5`, snapshot `ef5f1e78...fa0b`, and root
`b0e17261...79283` remain exact retained comparison oracles only. They are not fork-native outputs
from these merged commits.
