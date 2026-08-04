# Capsule Experiments Archive

This repository preserves completed, non-production Capsule feasibility spikes,
one-time harnesses, and retained experiment evidence. The active product,
canonical architecture, schemas, and implementation live in
[`shrimpworks/capsule-corp`](https://github.com/shrimpworks/capsule-corp) after
the planned organization transfer; until then, use
[`dills122/capsule-corp`](https://github.com/dills122/capsule-corp).

Nothing in this repository is a supported security boundary, production
component, runtime profile, backend, release artifact, or authorization
mechanism. Results apply only to the exact versions, fixtures, environments,
and limitations recorded by each experiment.

## Archive snapshot

- Source repository: `dills122/capsule-corp`
- Source commit: `566e3234b79fee9470822cd386f41b4d776af70d`
- Archived path: `experiments/`
- Snapshot date: 2026-08-04
- Tracked files: 744

`SOURCE_FILES.txt` lists every path copied from the source commit.
`SHA256SUMS` binds the archived file bytes. The original relative layout is
preserved so historical documentation can link to exact archived paths.

## Working rule

Future disposable research and spike implementations belong here when they do
not need to participate in Capsule's normal build. Capsule itself should retain
only the resulting decision, security claim boundary, production conformance
fixtures, and links to immutable evidence.

Archived experiments may be rerun defensively against their named local
fixtures and owned test environments. They must not be imported by Capsule
product packages or treated as current product behavior.

