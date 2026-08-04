# Gate C Deno-family runtime-authority experiment

Status: **DENO-FAMILY-NO-GO** on 2026-08-02.

Owner: the Gate C P0-0 runtime-authority campaign. Remove or replace this experiment only after an
admitted runtime construction and its retained evidence supersede the disposition.

This development-only experiment defensively tests Capsule's unchanged dependency-free JS/TS v0
runtime-authority contract. It uses fixed benign Capsule fixtures, exact read-only public Deno
inputs, controlled local processes, and an owned isolated Linux/arm64 Docker environment. It does
not admit a runtime or backend, execute user bytes, or claim a hostile-code boundary.

The experiment compares:

1. official full Deno v2.9.4 under the strictest applicable flags and an external container layer;
2. a minimal Capsule-owned `deno_core` 0.409.0 prototype with no module loader, no product ops,
   inspector disabled, and V8 `--jitless`.

Neither construction passes. Full Deno retains authority routes that its flags do not remove,
including the initial static graph, blob/data Workers, Node compatibility, runtime-managed web
stores, and SIGUSR1 inspector activation. The smaller `deno_core` construction still physically
registers 99 built-in core ops before middleware disables 96 of them; disabled fast-call behavior
is not a structural omission. TypeScript is also absent from `deno_core` and must be bound as a
separate approved transformation. See [RESULTS.md](RESULTS.md) for the decision and
[COMPARISON.md](COMPARISON.md) for measurements.

## Layout

- `deno-core/`: non-production Rust prototype and locked dependency graph.
- `typescript-surface/`: locked `deno_ast` transpiling dependency-surface marker; no transformer.
- `full-deno/`: exact full-Deno probe driver.
- `fixtures/`: fixed benign JS/TS/input probes.
- `evidence/2026-08-02/`: retained raw traces and exact identity/summary records.
- `scripts/`: source/input identity and prototype verification.
- `container/`: measurement-only Linux/arm64 image definition.

## Reproduce the local prototype

The exact upstream inputs must already be present. The scripts never select a release dynamically.

```sh
./experiments/gate-c-deno-runtime-authority/scripts/check-inputs.sh \
  /path/to/deno /path/to/deno_src.tar.gz /path/to/librusty_v8.a.gz

./experiments/gate-c-deno-runtime-authority/scripts/verify.sh
```

The initial locked Cargo fetch required the network. The retained final Linux/arm64 rebuild used
the independently hashed local V8 archive and `cargo build --locked --offline --release`. The
measurement container uses a digest-pinned Rust base but live Debian package indices for `strace`
and GNU `time`; it is measurement evidence, not an admissible builder.

## Scope boundary

This experiment is confined to Capsule-owned fixtures and the named local development environment.
It must not be repurposed for arbitrary untrusted workloads or third-party systems. Deno permissions
are evaluated only as supplemental enforcement and are never treated as Capsule's hostile-code
boundary.
