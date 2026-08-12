# C6b1b test-only Supervisor approval/attempt seam

Date: 2026-08-11

Scoped status: `PASSED` for the deterministic, repository-local construction and execution of this
test-only Supervisor durability model.

Parent owner-only hostile-`.mjs` internal alpha: `IN_PROGRESS — TRENDING_GOOD`.

Installed Broker signing, authenticated IPC, protected product state, product consumers, and
product admission: `BLOCKED`.

## Question

Can a self-contained experiment demonstrate the Supervisor-side durability and replay behavior
needed by the later Broker signing harness without making the Broker a durable authority owner or
activating any product path?

The exact behaviors under test are:

- the Supervisor durable `SubmitApprovalV0` commit is the only approval-authority linearization
  point;
- exact and mathematically equivalent envelopes over one canonical payload and resolved signer
  authorization return the same `ApprovalID`;
- response loss before an approval commit creates no authority, while response loss after commit
  reopens to exactly one approval;
- one atomic transaction consumes one usable approval and creates one `AttemptID`;
- response loss before consume/create leaves the approval usable and creates no attempt;
- response loss after consume/create reopens to one consumed approval and one attempt;
- exact replay and concurrency return the same `AttemptID`; and
- no Broker journal, cache, recovery ledger, product listener, lifecycle effect, backend, runtime,
  VM, or guest participates.

## Defensive and authorized scope

This is defensive, local-only Capsule experiment work. It uses public checked-in fixture bytes,
test doubles, a process-local model, and owned disposable temporary directories. It does not sign,
install, prompt, authenticate a platform peer, access Keychain or LocalAuthentication, use an
identity/profile/credential, register a service, open a product store, run a lifecycle driver,
start a backend/runtime/VM/guest, or access unrelated data.

Every matrix scenario creates a fresh generated directory under the caller's temporary directory,
requires mode `0700`, writes one experiment-only store as mode `0600`, records observations in
memory, and removes the generated root. The retained `productStateAccessed: false` field means the
harness has no product path or product-state input and did not deliberately access one. It is not
an OS-wide filesystem-audit claim.

## Exact inputs

The fixture pins `Shrimpworks/capsule-corp` commit
`88f3a2c1f968b1aa604ce14a2db4389822e5b193` and the exact hashes of:

- the passive five-method authenticated-local-IPC manifest, native contract, and oracles;
- the public historical ordinary ApprovalGrant envelope, payload, and protected header.

See [`fixtures/supervisor-seam-v0.json`](fixtures/supervisor-seam-v0.json) for the complete paths
and hashes. The historical ApprovalGrant is time-expired. It is retained here only as deterministic
public input for post-verification replay/store mechanics; this experiment does not claim current
grant admission, cryptographic verification, live signing, or key authorization.

The fixture carries two envelope encodings whose `R` value, protected header, and canonical
payload are byte-identical and whose P-256 `S` values sum to the P-256 group order. The loader
mechanically validates that complementary relationship. Both are explicitly admitted by a
test-only verifier projection. The seam does not implement or pretend to implement COSE or P-256
verification.

## Stable fixture interface

The collision-free interface name is:

```text
capsule.c6b1b.verified-approval-input/v0
```

It starts after strict public-key verification and ends before Supervisor durable admission. A
producer supplies:

- copied exact canonical payload, protected-header, and envelope bytes;
- a test-verifier acceptance disposition;
- resolved registration, plan, installation, epoch, Supervisor, purpose, and audience bindings;
- the resolved signer-authorization identity digest; and
- a nonzero signed `AttemptNonce` that is separate from Supervisor-issued `ApprovalID` and
  `AttemptID` domains.

The replay key is exact canonical payload bytes plus resolved signer-authorization identity. The
envelope/signature digest is retained as evidence only. This interface gives a later C6b1a unsigned
Broker harness a stable handoff shape without importing this experiment, copying future unknown
bytes, or depending on an unmerged branch. C6b1a remains responsible for its own deterministic
projection/payload/display construction; installed C6b1d evidence remains responsible for real
verification, key authorization, UI, and signing.

Only the two complete allowlisted fixture projections can reach this seam. Caller-invented bytes
are rejected with zero authority state.

## Model and authority boundary

The Go model is deliberately small and independent of Capsule product packages:

- `Submit` looks up canonical payload replay before inserting one `usable` approval;
- the first committed envelope digest remains retained when an equivalent signature replays;
- `RequestAttempt` either returns an already linked attempt or atomically writes one `created`
  attempt and changes its approval to `consumed` with the same `AttemptID`;
- store reopen rejects consumed-without-attempt, attempt-without-approval, duplicate identifiers,
  duplicate payload/nonce identities, or mismatched copied bindings;
- commits use a mode-`0600` temporary file, file sync, atomic rename, and directory sync; and
- injected response loss occurs immediately before that commit or after the completed commit.

The file mechanic is only an experiment oracle. It provides no claim about Capsule's selected
product engine, protected owner lock, APFS power-loss behavior, rollback, backup/restore,
multi-process locking, continuity, or installed durability.

The Broker has no store type, path, journal, cache, or recovery operation in this experiment. All
durable bytes belong to the object named `Supervisor` in the experiment seam.

## Matrix

| Row | Fault or mutation | Exact oracle | Result |
| --- | --- | --- | --- |
| `submit-response-loss-before-commit` | Response lost immediately before approval commit | Reopen has zero approvals/attempts; retry creates one usable approval. | `PASSED` |
| `submit-response-loss-after-commit` | Response lost after approval commit | Reopen has one approval; exact retry returns the same `ApprovalID` with no mutation. | `PASSED` |
| `submit-equivalent-envelope-replay` | Complementary P-256 signature over the same protected header/payload | Replay returns the same `ApprovalID`; retained first-envelope digest and record count do not change. | `PASSED` |
| `request-attempt-response-loss-before-commit` | Response lost immediately before atomic consume/create | Reopen has one usable approval and zero attempts; retry creates one attempt. | `PASSED` |
| `request-attempt-response-loss-after-commit` | Response lost after atomic consume/create | Reopen has one consumed approval linked to one attempt; retry returns the same `AttemptID`. | `PASSED` |
| `request-attempt-concurrent-replay` | Sixteen concurrent exact requests | All calls return the same `AttemptID`; reopen has one consumed approval and one attempt. | `PASSED` |

The retained machine-readable result is
[`evidence/2026-08-11/result.json`](evidence/2026-08-11/result.json). It records intermediate
authority counts immediately after the injected fault or first commit, final state digests,
identity convergence, environment, cleanup, limitations, and all exclusion flags.

## Reproduction

Requirements: Go 1.23 or newer. The retained run used Go 1.23.4 on Darwin/arm64 and required no
network, elevated privilege, entitlement, identity, or credential.

```sh
cd experiments/broker-live-signing-c6b1-supervisor-seam
GOCACHE=/tmp/capsule-c6b1b-go-cache ./scripts/verify.sh
```

The verifier:

1. runs every test;
2. executes the matrix in new disposable roots;
3. independently validates the retained result's input bindings, ordered rows, intermediate
   states, replay results, cleanup, and exclusions;
4. validates the newly generated result by the same oracle; and
5. verifies every retained file digest listed in `SHA256SUMS` (all experiment files except the
   checksum list itself).

The race-focused command is:

```sh
GOCACHE=/tmp/capsule-c6b1b-go-cache go test -race ./...
```

## Observations, inference, and decision

Observed in this harness:

- every listed row passed;
- before-commit loss retained the pre-commit authority world;
- after-commit loss retained the post-commit authority world;
- equivalent payload replay preserved one approval identity;
- consume/create never reopened split;
- sixteen callers converged on one attempt identity;
- corrupt cross-link mutation was rejected on reopen;
- all created experiment roots were absent after cleanup; and
- no excluded capability is present in the program's interfaces or result.

Inference limited to this construction: the stable post-verifier interface is sufficient for the
future C6b1a/C6b1d evidence producer to exercise Supervisor replay and failure convergence without
giving the Broker a durable journal. This does not establish installed behavior or prove a product
store.

Decision: C6b1b construction is `PASSED`. It preserves Accepted ADR-0043's Supervisor authority
boundary and Proposed ADR-0024's atomicity/replay shape without accepting ADR-0024 or Proposed
ADR-0021 and without creating a new architecture decision.

## Limitations and replacement condition

- The fixture is a test-verifier projection, not an installed signed admission.
- The store is a local experiment model, not Capsule product code.
- No authenticated XPC listener, message-derived peer identity, protected owner, runtime-integrity
  assessor, lifecycle driver, or product response delivery exists here.
- No real process kill or power interruption occurs; reopen models loss of process memory around
  an explicitly selected commit boundary.
- No Keychain/Secure Enclave/LocalAuthentication/UI/update/rotation/restore behavior is tested.
- The deterministic IDs are test identities and provide no randomness or rollback claim.

This seam is replaced, not promoted, when a reviewed product Supervisor consumer preserves the
same authority ordering through passed installed IPC, protected-store, and signing evidence. The
archive remains useful as a compact regression oracle and must never be imported by Capsule
product packages.
