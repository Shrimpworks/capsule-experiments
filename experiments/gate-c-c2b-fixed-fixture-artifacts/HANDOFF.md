# Handoff

## Current state

The localized fixture/candidate mismatch is fixed on the real owned Deno fork.
Draft source PR: [`Shrimpworks/deno#2`](https://github.com/Shrimpworks/deno/pull/2).
Exact commit: `29b71f06c2df5ab06721ccbb7bc744fb8104356e`.

The candidate runtime artifacts reproduced byte-for-byte in two clean,
network-disabled builds:

- binary: 68,496,520 bytes,
  `e781a90236cdf1272a9a16189c6be033164fa25a5aa9e52376ef998982ec0a77`;
- snapshot: 699,988 bytes,
  `4e8965217d5a6675a880326eee6f690bbeec7e7cb243decf2f3e9f453a871a2c`;
- two-file bundle: 20,981,992 bytes,
  `ad908b8289c86f25c3413713fa3e60c4c8bb91fec0d52763e870d7a186865ee6`.

The build-only immutable supplement remains
`capsule.governed-deno-core.c2b-fixed-fixture/c1-c2a-v1`, SHA-256
`41350bcfc854338ded5e62f77475daf86486351356104dbbf647a8f8b5f11946`.
Any byte change requires a new version and identity.

The current v2 runtime-build evidence identity is
`capsule.c2b-fixed-fixture.runtime-build-evidence/c1-c2a-v2`, self-digest
`732301bf8553b0c59b3fe0e4f2b9e070dcc3a1b478e742dc13bd438873b7e488`.
The prior v1 evidence self-digest
`6a673b88dc99e8939bc46ec88fb4f869caf7a9ff5909aa445e62afc5a3a83f87`
remains retained and is not reinterpreted.

## Required next authorization

Dispatch a separate user-visible `Shrimpworks/capsule-corp` branch and draft PR
to define and validate this passive immutable supplement in the canonical
versioned object model, schemas, fixtures, field-authority rules, and docs. The
PR must relate unchanged C1/C2A identities to the exact Deno commit and output
identities above, retain `runtimeAdmission=false`, and must not represent the
supplement as a C1/C2A successor or general workload interface.

Only after that canonical PR is reviewed may the experiment continue to raw
root/init/launcher/libkrun/runner composition and a composed development-profile
identity. Guest execution remains a later, separate authorization.

## C2B-only matrix

| Case | Current disposition |
| --- | --- |
| libkrun/HVF VM creation and boot | `NOT_RUN`; C2B-only |
| Actual guest kernel and libkrunfw handoff | `NOT_RUN`; C2B-only |
| Guest `/dev/hvc*` transport behavior | `NOT_RUN`; C2B-only |
| Read-only raw-root behavior under the guest kernel | `NOT_RUN`; C2B-only |
| Trusted init/launcher behavior in the owned guest | `NOT_RUN`; C2B-only |
| Completion commit-last visibility across the guest boundary | `NOT_RUN`; C2B-only |
| Guest teardown, descendant cleanup, and context reset | `NOT_RUN`; C2B-only |
| Repeated-run isolation and lifecycle fault restoration | `NOT_RUN`; C2B-only |

## Exact later owned-guest authorization request

> Authorize one controlled C2B owned-guest experiment consuming only the exact
> reviewed canonical fixed-fixture development profile and every digest-bound
> artifact it names. Permit libkrun/HVF launch solely for the retained benign
> C1/C2A fixture, exact descriptor/framing tests, completion commit-last
> observation, teardown/cleanup, and the enumerated guest-only mutation matrix.
> Continue to forbid arbitrary/user workloads, caller paths/argv/env, loader or
> module requests, credentials, signing/notarization, release publication,
> installation/service changes, runtime selection/admission, and unrelated
> systems, identities, or data. Preserve `RUNTIME-001` and `VMM-001` as
> unsupported. Stop and call back before widening source, artifact, profile, or
> execution authority.

This packet is not current guest authorization. It becomes actionable only
after the canonical binding PR and composed-profile artifact work are reviewed.
