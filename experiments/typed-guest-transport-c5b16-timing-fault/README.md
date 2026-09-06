# C5b16 native timing/fault baseline

Status: IN_PROGRESS — TRENDING_GOOD; installed/guest/product: BLOCKED.
Owner: Capsule maintainer. One-time defensive local experiment, never a product import.

Versioned derivative of C5b14B, with fixed-capacity monotonic phase recording and
bounded one-use publication delay. See PLAN.md for acceptance, scope and limits.
Existing one-second clocks, four-second child alarm, seven-second harness alarm,
and durable-before-effect ordering remain exact. No guest or interpreter runs.

Run `node scripts/verify.mjs` for the full inherited native regression corpus and
`node scripts/timing-verify.mjs` for timing evidence and observer mutations.
Authoring uses explicit `--record` to retain new reviewed evidence; ordinary runs
refuse material drift and check retained observations without equating new durations.

Replace only with a separately versioned experiment and retain old evidence.
