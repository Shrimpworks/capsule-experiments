# Source Validator passive Rust oracle

This standalone crate is a **test-only child-language oracle** for Proposed
ADR-0035 V0. It independently encodes, decodes, hashes, and verifies the same
generated fixed frames as the unwired Go parent oracle.

It does not contain or invoke Oxc, parse or execute JavaScript, launch a child,
open an IPC endpoint, enroll an executable, define a sandbox, or have any state,
Approval, key, runtime, backend, or guest effect. Product packages do not import
it. `sha2` 0.10.9 supplies SHA-256 rather than adding a handwritten primitive;
`serde_json` 1.0.151 is test-only and reads the generated conformance manifest.

Run without package or network access:

```sh
cargo test --manifest-path experiments/mjs-source-validator-passive-contract/Cargo.toml \
  --locked --offline
```

Removal condition: replace this crate only after the eventual enrolled Rust
child owns an independently reviewed production codec and the same retained
known answers, mutation cases, and domain checks.

## Test-only dependency disposition

- Reuse-map decision: standard SHA-256 primitive plus Rust test tooling; **TEST-ONLY** for this
  standalone oracle and **BUILD-NARROWLY** for Capsule's fixed framing.
- Exact direct versions: `sha2` 0.10.9 and dev-only `serde_json` 1.0.151. The complete 22-package
  lock SHA-256 is `a45ad0e2b2311d33b16e46e0bf1f66c1563dd240a35f1f9fe431c7bea5894c98`.
- Retrieval/provenance: this slice resolved and built only from the existing local Cargo cache with
  `--locked --offline`; it fetched no package and makes no independent registry-provenance claim.
- Licenses: the direct crates declare dual MIT/Apache-2.0 licensing. Any future product reuse must
  repeat notice/source/provenance review for its exact production graph; this test crate is not
  artifact admission.
- Authority/footprint: hashing and bounded JSON-manifest parsing in local tests only. No executable
  is shipped, and no network, filesystem outside repository fixtures, process, parser, state, key,
  runtime, backend, or guest authority is gained.
- Bounds/faults: the library accepts only in-memory contract slices; exact frame/source/count caps,
  malformed/trailing/domain/status mutations, and deterministic known answers are retained. A
  panic or test failure fails verification and has no product recovery path.
- Maintenance: Source Validator contract maintainers own updates. Every change must update the exact
  lock digest, rerun offline Go/Rust agreement and the full mutation corpus, and receive explicit
  review. Removal follows the condition above; no compatibility fallback is permitted.
