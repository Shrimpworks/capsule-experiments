# Fork-native governed runtime-bundle research handoff

Date: 2026-08-03

Parent/orchestrator task: `019fc2de-552d-77a0-aa47-35ac39d02edc`

## Question and defensive scope

Defensively validate the first clean fork-native governed Deno/`rusty_v8` runtime bundle using
only the Capsule repository, exact merged commits in the user-owned `dills122/deno` and
`dills122/rusty_v8` forks, fixed benign Capsule fixtures, controlled local inspection/builders,
and owned isolated network-disabled build/test environments. No unrelated system, identity,
credential, user data, arbitrary workload, backend, guest, deployment, or signing service was
accessed. This is build/profile evidence only.

## Method

- Synced Capsule from `origin/main` at `91c4aa4`, including merged PRs #60 and #61, before creating
  `codex/fork-native-deno-runtime-bundle`.
- Read the mandated Capsule architecture, technical design, threat model, feasibility, Gate C,
  ADR, retained Deno/V8/package/root/TypeScript evidence, and the fork-local governance handoffs.
- Queried and cloned only the two named forks.
- Verified exact heads, merge commits and parents, upstream ancestry, tree identities, governed
  Deno source/patch/fixture oracles, `rusty_v8` 20-gitlink source lock, and builder/tool/output
  locks.
- Applied the required fail-fast architecture check before prefetch or compilation.

## Result

**LINUX/ARM64 CONSTRUCTION BLOCKED; NO BUILD OR RUNTIME ADMISSION.**

The Deno governed head is exact and passes its fork-local source/fixture/restoration verifier. The
merged `rusty_v8` follow-up head is exact and closes the source/build-publication contract only for
Linux/amd64. It has no Linux/arm64 builder profile. The experiment therefore did not run prefetch,
build, tests, root assembly, or reproduction, and did not substitute amd64.

## Exact refs and architecture

- Deno head `9adb0b68b55bca81644827f1e7749a3acb091bed`; merge
  `ea18b9dc21ff8ebd19347be7095f47937ee14ec2`; anchor
  `14eea3160ae5834476aa3b9d317b8d41d991b982`.
- `rusty_v8` follow-up head `a43ee7486c3e05bce5d6e5db586b3e2e688c33cf`; merge
  `a31b8f39dc6933d5635367e8ccb67d70f2cc2385`; anchor
  `d305e6afa7736f6e298c30ae6646f7709ee9382b`.
- Stale `rusty_v8` original head `17698caedb8721c132a3e2f08f7ab0ae212f313a` was not used as
  the terminal identity.
- Requested build architecture: Linux/arm64, `aarch64-unknown-linux-gnu`.
- Only supported governed fork architecture: Linux/amd64,
  `x86_64-unknown-linux-gnu`.

No new artifact identities exist. Prior exact binary, snapshot, root, and TypeScript identities are
retained only in `manifests/known-answers.json` as non-fork-native comparison oracles.

## Retained evidence

- Decision and exact blocker: `RESULTS.md`.
- Closed intended material/output contract: `manifests/input-contract.json`.
- Prior known answers and their role limits: `manifests/known-answers.json`.
- Ref/ancestry/tree/lock observations: `evidence/2026-08-03/ref-verification.json`.
- Reusable offline verifier: `scripts/verify.sh`.
- Canonical reconciliation: Capsule project, feasibility, Gate C plan, evidence ledger, governed
  Deno plan, and control-evidence matrix.

## Verification and confidence

Focused verification checks JSON structure and exact retained identities, canonical evidence-file
digests, architecture fail-closed state, fork heads/parents/ancestry/trees, the Deno fork-local
verifier, the `rusty_v8` source-lock verifier, and stale-head rejection. Repository-wide required
verification is recorded in the pull-request handoff.

Confidence is high that current merged fork inputs cannot construct the requested arm64 bundle.
Confidence intentionally does not extend to the success or byte identity of a future arm64 build.

## Recommended next decision

Authorize the smallest `dills122/rusty_v8` follow-up: add a fully digest-pinned Linux/arm64 sibling
builder/publication profile based on `a43ee748`, with connected digest-checked prefetch and a
network-disabled build/test/evidence phase. After that merges, rerun this Capsule experiment from
empty output/cache state. Do not publish/sign a release or alter `RUNTIME-001` in that fork task.
