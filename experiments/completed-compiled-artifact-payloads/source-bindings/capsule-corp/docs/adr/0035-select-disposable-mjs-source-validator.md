# ADR-0035: Select a disposable `.mjs` Source Validator

- Status: Accepted
- Date: 2026-08-04
- Supported macOS profile replacement reviewed: 2026-08-04
- R0 launcher/resource refinement accepted: ADR-0036 on 2026-08-04
- Internal-alpha gating refined: ADR-0040 on 2026-08-05
- Refines: ADR-0010, ADR-0018, ADR-0029, and ADR-0034

## Context

ADR-0034 requires a bounded, non-executing ECMAScript module-request validator
before plan construction, while preserving an independent runtime no-loader
boundary. M1 correctly stopped a hand-written scanner after the valid program
`const of = 9; of / import("evil") / divisor;` demonstrated a false negative.
Scanner guesses also risk confusing ordinary `obj.import.meta`, the valid object
method `({ import() {} })`, template interpolation, comments, strings, and regular
expressions with ECMAScript grammar.

ADR-0040 later removes this host parser from the owner-only internal-alpha admission path while
preserving this decision as post-alpha defense-in-depth. The internal alpha approves exact bytes
and relies on the admitted guest's physical no-loader and host-authority omission.

The parser cannot simply move into an existing authority component. The daemon is
public-facing and can skip its own check if compromised. The Approval Broker owns
Approval/content-key operations. The Execution Supervisor alone owns hostile-guest
lifecycle and must not absorb rich source parsing or a new responsibility without
an ADR. A governed V8 runtime is not yet admitted, and compile-only V8 exposes
static module requests but not a complete observation of dynamic import and
`import.meta`.

The retained parse-only
[`mjs-parser-boundary` experiment](https://github.com/Shrimpworks/capsule-experiments/tree/0d8233b55f153b27a901a9ec45a3834208e3aa86/experiments/mjs-parser-boundary)
compared exact locked Oxc, deno_ast/SWC,
rusty_v8/V8, and tree-sitter candidates. It did not execute JavaScript. Oxc 0.140.0
was the only tested candidate to match all 33 local expected outcomes after both
parser diagnostics and semantic early-error checking. After merged PR #87 became
the base, it also matched all 28 canonical M1 HOLD outcomes in place: 22
module/ordinary grammar cases and six free CommonJS-reference cases. This is
bounded engineering evidence, not product admission or an arbitrary-hostile-input
proof.

## Decision

### Exact parser candidate

Select, provisionally, these exact crates at `0.140.0`:

- `oxc_parser` and `oxc_ast` for module parsing and typed nodes;
- `oxc_ast_visit` for the narrow visitor;
- `oxc_semantic` with `with_check_syntax_error(true)` for ECMAScript early errors;
  and
- the supporting `oxc_allocator` and `oxc_span` crates.

This consumes the `.mjs` import/module-validation row in
[`ECOSYSTEM_REUSE_AND_ADOPTION.md`](../ECOSYSTEM_REUSE_AND_ADOPTION.md). Its
recommendation is **SPIKE-FIRST**, with the parser in the planning/approval-
understanding TCB and with no execution, network, filesystem, storage, key, or
guest authority. The dependency-policy disposition as of 2026-08-04 is:

- exact candidate: crates.io Oxc 0.140.0, Rust 1.95.0, complete Cargo lock SHA-256
  `505669a07338603876bc96c242f8d5af386d3a13139e70110a8b52f39bae69ac`;
- primary sources checked: <https://github.com/oxc-project/oxc>,
  <https://oxc.rs>, registry package metadata, and the exact docs.rs 0.140.0 API;
- graph/footprint: six direct Oxc crates, 65 locked transitive packages,
  24,449,903 cached source bytes, and a 1,854,528-byte macOS arm64 release probe;
- licenses/provenance: every registry checksum and declared license expression is
  retained in the commit-pinned
  [`supply-chain.json`](https://github.com/Shrimpworks/capsule-experiments/blob/0d8233b55f153b27a901a9ec45a3834208e3aa86/experiments/mjs-parser-boundary/evidence/supply-chain.json);
  a complete
  notice/source-offer review,
  independently signed artifact provenance, and production SBOM are unknown and
  block adoption;
- maintenance: the package identifies Boshen and Oxc contributors and the public
  repository, but Capsule has not selected a vulnerability-monitoring owner,
  response SLA, or release cadence; those are admission blockers;
- required behavior: regular-expression grammar, module AST, visiting, semantic
  early-error and unresolved-reference analysis; no formatter, transformer,
  resolver, loader, runtime, network, or package-selection surface is included in
  the proposed child protocol;
- bounds/faults: one copied input at most 262,144 bytes, one fixed result, parent
  deadline/kill/reap, and fail-closed diagnostics/crash/protocol behavior; exact
  production CPU/memory/output/queue ceilings remain V2 work;
- replay: locked offline build, 33 local cases, 28 canonical M1 HOLD cases,
  Test262-derived provenance, restoration mutations, deterministic repetitions,
  and fixed crash/hang controls are retained; and
- upgrade/removal: every version change reruns the whole graph/corpus/fault/
  performance/artifact review, active installations accept only an enrolled
  version, rollback uses a still-enrolled prior artifact, and direct SWC with all
  recoverable errors plus an early-error pass is the named removal contingency.

The resulting decision remains **SPIKE-FIRST / engineering-candidate GO**, not
`ADOPT-PINNED`. Unknown admission items fail closed.

The complete production graph and artifact remain lockfile- and
release-manifest-bound. Every parser panic, parser diagnostic, semantic diagnostic,
invalid UTF-8 input, input above 262,144 bytes, deadline, crash, protocol error,
artifact mismatch, or unsupported result refuses. Only a valid module AST with
zero forbidden nodes returns an allow classification.

The policy visitor recognizes exactly:

1. static import declarations, including side-effect imports and attributes;
2. named/all/namespace export declarations with a source;
3. import expressions, regardless of whether the specifier is literal or
   computed; and
4. the `import.meta` meta-property.

The semantic graph additionally counts unresolved references to the unavailable
CommonJS bindings `require`, `module`, `exports`, `__dirname`, and `__filename`.
A same-named local binding is ordinary JavaScript and does not count. This is a
closed source-profile check, not a claim that arbitrary identifier analysis proves
runtime semantics.

Ordinary local exports, strings, comments, regular expressions, object methods
named `import`, and ordinary property chains are not those nodes. The validator
does not evaluate constant strings or generated code. In particular,
`eval("import('./evil.mjs')")` is string data at parse time; eval/generated-code
policy and unconditional runtime no-loader enforcement are separate layers.

### New process boundary

Place the parser only in a small, one-shot, stateless **Source Validator** process.
This ADR records the new process/responsibility but does not implement it.

The process has one method-specific operation, provisionally
`ValidateMjsSourceV0`. Its parent supplies a defensive copy of exact `main.mjs`
bytes and fixed method/version metadata over a bounded local channel. The child
returns only a fixed typed result: method/version, source SHA-256 and byte length,
parse status, policy status, bounded integer counts for the four forbidden node
categories, and a bounded count of free CommonJS binding references. It returns no
source, caller path, arbitrary diagnostic text,
specifier, package, loader choice, or authority-bearing identifier.

The production child must be launched from one enrolled, assessed, immutable
artifact by a fixed descriptor owned by the selected low-authority launcher. It has
no persistent Capsule product store, keys, network, inherited ambient file descriptors,
caller-selected paths, environment, package cache, import map, runtime, backend,
guest, or execution authority. Its OS profile must enforce copied input/output,
the accepted memory/resource policy, and kill-on-deadline. The exact artifact,
launcher topology, launch descriptor, protocol bytes, and sandbox profile require
retained evidence before acceptance.

### Supported macOS profile correction and accepted R0 refinement

The [supported-profile replacement review](../MJS_SOURCE_VALIDATOR_MACOS_PROFILE_REPLACEMENT.md)
closes the design question without unblocking product implementation.

Apple's supported App Sandbox composition does not allow a daemon or Broker to
spawn a directly inherited command-line helper with fewer static sandbox rights
than the parent. A directly launched embedded tool receives the launching
component's sandbox capabilities and is therefore `NO_GO` for this exact parser
boundary. It could expose daemon state or Broker/key-adjacent authority to parser
memory corruption.

Accepted ADR-0036 selects two separately App-Sandboxed, role-specific private XPC
launchers: one embedded for the daemon and one embedded for the Approval Broker.
Each owns only its matching fresh parser child, fixed pipes, resource observation,
process-group kill, drain, reap, and cleanup. The two services, parser signing
identities, method identities, and artifact profiles are distinct. There is no
shared/generic service, cross-role accepted result/cache/state, app group,
Keychain group, global Mach lookup exception, Supervisor route, or generic
XPC/JSON/Codable bus. Exact private-XPC packaging and reachability remain a signed
installed evidence gate; unsupported reachability stops rather than widening the
bus.

App Sandbox grants each launcher and inherited parser child read/write access to
its private container. ADR-0036 accepts that container as residual scratch
authority and narrows "no store" to no persistent Capsule product state, cache,
source/diagnostic log, or reusable result. Mandatory cleanup and residue evidence
apply after every request, crash, launcher restart, update, and startup. Cleanup is
defense/evidence, not confidentiality or secure-erasure proof.

The resource result remains independently blocking at the product-evidence level.
`RLIMIT_AS`/`RLIMIT_RSS`
cannot be lowered on the observed host; `RLIMIT_DATA`, stack, and memlock limits
are narrower resources. A bounded unprivileged probe of the public-SDK
`task_set_phys_footprint_limit` interface returned `KERN_NO_ACCESS` for its own
task. ADR-0036 therefore replaces the unavailable hard ceiling with a quantified
reactive physical-footprint watermark: one direct child per launcher request,
bounded per-role and combined concurrency/input/output, one fixed sampling
interval, and fail-closed process-group kill/drain/reap. It explicitly makes no
hard-peak, exact-memory-cap, or host-availability claim. Threshold, cadence,
baseline, overshoot, and kill-latency values must come from the later signed
corpus; this ADR does not choose them.

Any resumed artifact uses the exact role-specific v1 identities in ADR-0036 and
the [passive v1 boundary](../protocol/MJS_SOURCE_VALIDATOR_PASSIVE_BOUNDARY_V1.md).
Each profile binds its complete signed launcher/parser bundle, entitlements,
Hardened Runtime and launch/library constraints, code identities, installed
placement, resource policy, supported-host matrix, and consumer role. V0/V1/V2
bytes and identities remain historical and unchanged. A separately authorized
signing task is required before installed evidence; neither ADR authorizes use of
any developer's signing identity.

Both of these checks are mandatory and independent:

1. the daemon invokes the validator over its exact decoded bytes before plan
   construction, providing early contract/usability refusal; and
2. the Approval Broker invokes a fresh validator over the exact bytes fetched
   from Supervisor-retained registration state before rendering or any Approval-
   key operation.

The daemon cannot supply a prior result to the Broker. The Supervisor does not
invoke or host the parser; it continues to enforce byte caps, strict identity,
hashes, canonical source-manifest binding, atomic custody, and defensive readback.
The Broker binds the returned digest and length to the bytes it supplied and
renders the fixed category facts. Any disagreement refuses.

### Layering and authority consequence

The Source Validator is an approval-correctness and contract dependency, not
execution authority and not the runtime security boundary. A compromised parser
could lie about facts or cause denial of service. It must be unable to sign an
approval, alter retained registration state, or launch a guest. Broker compromise
is still within the Broker's documented approval authority; process separation
reduces parser memory-corruption and crash reach only once the sandbox and
descriptor properties are proven.

Every admitted runtime profile must independently install no filesystem, network,
package, import-map, or fallback loader and must refuse every static or dynamically
constructed module request, including one produced through eval or generated code.
Skipping or compromising both pre-approval checks must not create module-loading
authority. Runtime admission remains blocked on its own adversarial evidence.

### Alternatives rejected

- **Daemon in-process:** rejects. It adds the parser graph to a public process and
  does not create an independent authority check.
- **Execution Supervisor in-process:** rejects. It expands the sole guest-
  lifecycle authority owner with rich parsing and a new responsibility.
- **Approval Broker in-process:** rejects. It puts hostile-input parser memory
  corruption in the key-bearing process.
- **deno_ast 0.53.3 / SWC:** rejects the exact tested high-level mode. It accepted
  four corpus cases that must be parse errors, and its locked graph was larger
  than Oxc's. A future direct SWC retry must explicitly drain all recoverable
  errors and supply a proven early-error pass.
- **rusty_v8/V8 150.2.0 compile-only:** rejects. `GetModuleRequests` observes
  static requests, while dynamic-import and import-meta host callbacks are not a
  compile-only complete policy observation; its footprint is disproportionate.
- **tree-sitter 0.26.11 / JavaScript 0.25.0:** rejects. Its recovery-oriented
  grammar accepted three invalid corpus programs even when `has_error()` was
  checked, and it is not an ECMAScript early-error validator.

## Consequences

Positive consequences:

- policy facts come from typed grammar nodes, not hand-written lexical guesses;
- the parser is absent from the daemon, Supervisor, and Broker address spaces;
- one-shot failure can map to refusal and recovery through process replacement;
- the daemon and Broker examine separately copied bytes; and
- runtime no-loader enforcement remains independently necessary.

Costs and risks:

- the approved architecture gains an enrolled executable, protocol, sandbox,
  dependency graph, lifecycle, timeout, and recovery surface;
- two invocations add bounded latency and availability dependence;
- parser/sandbox compromise can still falsify approval facts or deny service;
- Oxc updates require explicit version, corpus, mutation, supply, performance,
  and artifact-evidence review; and
- product code cannot be claimed until the implementation plan and
  conformance/fault gates are complete.

## Status and evidence limits

This ADR's parser/process architecture is Accepted. Acceptance records the architecture owner's
choice; it does not admit a product validator or advance control evidence. The retained experiment
establishes bounded engineering evidence only. The first V0 passive conformance slice fixes the exact
request/result/candidate/artifact-profile bytes, consumes M1's merged fixtures additively, and
classifies the new passive fields; see the
[`v0` passive contract](../protocol/MJS_SOURCE_VALIDATOR_PASSIVE_CONTRACT.md). It does not implement
a product validator, admit the parser graph, enroll an executable or artifact profile, define a
sandbox or endpoint, replace or modify M1's merged bytes, admit a runtime/backend/guest, or prove
the runtime no-loader boundary.

The bounded V1 follow-up retains an unwired 1,146,656-byte macOS arm64 executable at SHA-256
`ba2a6b38be6b4eea8c067887cf80988756e2f4a551d128bf2dabdaf7f2ecb600`, built with Rust 1.95.0
from a 74-dependency lock. Its source/checksum/license/notice/SBOM/provenance manifests, exact V0
and M1 results, restoration mutations, and two-clean-directory same-host reproduction are retained
under `artifacts/mjs-source-validator-v1/`. Its V0 artifact profile is explicitly not enrolled:
the provenance and assessment are unsigned, reproduction is not independent, and no vulnerability
owner/SLA or installation-authority signature exists. V2 confinement and every consumer remain
unimplemented. This evidence therefore narrows V1 without admitting a product profile.

The next retained V2 checkpoint is `BLOCKED`. A strict macOS test bootstrap fixes copied I/O,
argv, empty environment, cwd, descriptor closure, enforceable rlimits, wall deadline, kill/reap,
and fault refusal, but `RLIMIT_AS` returns `EINVAL` before the V1 artifact executes. An explicitly
unbounded diagnostic mutation proves the remaining mechanics and later clean invocation while also
proving ambient file reads, socket creation, cwd metadata writes, and a 512 MiB mapping remain.
Apple's supported embedded-tool App Sandbox child entitlements change the exact V1 Mach-O bytes;
deprecated custom sandboxing is not accepted as a substitute. The retained V1 object and profile
remain unchanged and not enrolled. The direct-child V2 path stays blocked historical evidence and
does not activate a consumer.

The subsequent supported-profile design slice is `PASSED` in its research scope
and leaves the product parent `BLOCKED`. ADR-0036 completes R0 by selecting two role-specific
private launchers, accepting each private container as residual scratch authority, and replacing
the unavailable hard ceiling with an evidence-derived reactive footprint policy. It also fixes the
new v1 role/version/ownership boundary and stop conditions. It does not sign/build/install/enroll
an artifact, prove private-XPC reachability, select numeric resource values, or activate a consumer.

Product Source Validator admission requires the sequential gates in
[`MJS_SOURCE_VALIDATOR_IMPLEMENTATION_PLAN.md`](../MJS_SOURCE_VALIDATOR_IMPLEMENTATION_PLAN.md):
passive v1 contracts/fixtures, unsigned construction, separately authorized signing/install,
confinement/resource/residue evidence, then independent daemon and Broker consumers. The retained
mapping and V0 result frames remain passive historical oracles; product language validation stays
`BLOCKED` until those gates pass. Runtime no-loader admission remains independently mandatory.
