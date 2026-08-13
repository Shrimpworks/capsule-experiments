# Handoff

Work item: C5b5 deterministic no-run effect adapter

Scoped status: `PASSED`.

Parent C5b controlled execution: `BLOCKED`.

Question tested: can the frozen C5b3 controller actions be bound to the exact accepted libkrun
ABI/call surface and recovered libkrunfw identity in a deterministic non-runnable adapter without
implementing or activating effects? Yes, in the exact compile-only scope retained here.

Defensive scope: repository-local source, copied immutable interface records, compiler output,
static Mach-O inspection, and dependency-free Node models only. No binary or dylib was loaded or
executed; no process, VM, guest, credential, Keychain, service, installed state, or product state
was accessed or mutated.

Method and evidence: two byte-equal arm64 `MH_OBJECT` builds; exact 13-import/two-export closure;
15 independent action vectors; 19 profile mutations plus absent-profile/unknown-action refusals;
closed archive manifest; and explicit no-effect fields in `manifests/adapter-profile.json` and
`evidence/2026-08-13/`.

Confidence is high for deterministic interface/profile closure and descriptive action ordering.
There is intentionally no confidence claim for real effects, runtime behavior, lifecycle,
containment, or admission because none ran.

Remaining work: retain governed `deno_core` bytes, rebuild the runtime root, review a real effect
implementation separately, create a new immutable composite manifest, and obtain exact owner
authorization before any controlled execution. Do not link this object into a runnable artifact or
infer that a C5b runtime/profile is admitted.
