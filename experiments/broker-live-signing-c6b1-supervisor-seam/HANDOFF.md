# C6b1b integration handoff

Scoped construction status: `PASSED`.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Product admission and every installed/security-composition dependency: `BLOCKED`.

Canonical Capsule input: `Shrimpworks/capsule-corp` commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193` with exact file hashes retained in the fixture.

Retained result:

- stable post-verifier interface `capsule.c6b1b.verified-approval-input/v0`;
- six-row approval/attempt response-loss, replay, reopen, and concurrency matrix;
- complete machine-readable result and archive hashes;
- Supervisor-only experiment store with no Broker durable authority; and
- verified disposal of all generated roots.

Capsule integration should add only a commit-pinned archive pointer and the narrow conclusion that
the test-only construction passed. It must not copy this model into product code, claim installed
durability, accept a Proposed ADR, or unblock product consumers by itself.

Next dependencies remain C6b1a construction, then separately authorized C6b1c identity/profile
readback and C6b1d installed signing evidence. The stable fixture interface allows those tasks to
compose without a branch or implementation dependency.
