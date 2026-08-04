# Gate C P0-0 governed Bun closure follow-up

Status: **governed-construction branch NO-GO; alternate-runtime pivot required**. Nothing in this
directory is product code, an admitted runtime profile, or permission to execute user or
runtime/backend bytes.

This follow-up started from the retained stock Bun 1.3.14 failure in the parent directory. It asked
whether the narrowest governed source construction plus exact launcher/kernel enforcement could
preserve ADR-0003's dependency-free Bun first slice while structurally removing process creation,
executable replacement, native loading, inspector, Worker, macro/preload/config/environment-file,
and package-install/dynamic-resolution authority.

Owner: the Gate C P0-0 orchestrator task. Removal/replacement condition: retain until an alternate
runtime investigation is reconciled into an ADR-0003 update or superseding decision with its own
exact construction and mutation evidence.

The original task's explicit fail-fast rule first applied because the exact source checkout was
present but the local build inputs were not. A user-authorized follow-up then added a retained
Linux/arm64 builder and proved the exact stock release baseline could build and run Capsule's owned
fixture.

The next authorized construction review has now applied the fail-fast rule on the merits. An honest
mandatory profile has a conservative lower bound of 40 hand-authored source files plus 10 generated
outputs, with two more generated LUTs likely. The surface spans independent registries, loaders,
globals, native sinks, configuration, resolution, build identity, and mutation backstops. This is
not the small reviewable construction patch required by P0-0, so no governed diff or binary was
produced and the build/probe/mutation stages did not start. See
[CONSTRUCTION_REVIEW.md](CONSTRUCTION_REVIEW.md).

Run the read-only input check against the retained exact checkout with:

```sh
./experiments/gate-c-bun-runtime-authority/governed-closure/check-inputs.sh \
  /private/tmp/capsule-gate-c-p0-0-bun-src-network
```

See [RESULTS.md](RESULTS.md) for the cumulative decision and [SOURCE_MAP.md](SOURCE_MAP.md) for the
pinned construction map. [TOOLCHAIN.md](TOOLCHAIN.md) documents the stock release prerequisite.
Retain this evidence until an alternate-runtime decision supersedes ADR-0003's Bun-first
implementation choice.
