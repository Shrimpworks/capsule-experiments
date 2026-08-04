# Patch governance and review

Status: experiment-owned queue; no product or runtime-profile admission.

## Ordered queue

### 0001: physical built-in allowlist

- Target: original `deno_core` 0.409.0 `ops_builtin.rs` from crate `16b44f6f...778b4`.
- Digest: `f45fda69db3875dbd730aa9568cb88ff6cc35a25c8d82edb5fa3b521c19bac37`.
- Mechanism: replace the sole 99-entry pre-registration slice with three bootstrap-required ops
  and remove the now-unused type-op import.
- Evidence: Phase A threshold, reverse-application check, runtime registry/metadata equality,
  ten omitted-metadata samples, final-link symbol allowlist, fixed fixtures, and restored-`op_print`
  rejection.
- Risk: omitted source definitions remain present and can be restored by later upstream changes;
  the final-link regex and runtime registry assertion are mandatory rebase tests.

### 0002: canonical snapshot module order

- Target: patched `deno_core` 0.409.0 `modules/module_map_data.rs`.
- Digest: `9dd33fd423ce98f030d80eba5cb386d5236b7ca103aa45b58ce5b36125d8061e`.
- Mechanism: sort the existing serialized `by_name` vector by module name before bincode
  serialization; no snapshot format or post-build byte rewrite is added.
- Evidence: retained pre-patch divergence, reverse-application check, equal snapshots under fixed
  ASLR/path/locale/time inputs, and exact reproduction of `ef5f1e78...fa0b`.
- Risk: upstream serialization changes can invalidate the ordering assumption; any rebase requires
  a new ordinary-divergence control and format review.

### Restoration mutation: `op_print`

- Digest: `e0e98557b709437d464464922a3c4d4cc45af1832d32108d584cfe771125ee40`.
- Purpose: deliberately produce a four-op registry and prove that the wrapper rejects it before
  fixed-fixture execution.
- It is a test mutation only and must never enter the candidate queue.

## Ownership plan

Runtime engineering owns patch rebases and exact build reproduction. Security architecture owns
the prohibited-power contract, Phase A review threshold, and restoration corpus. Release/supply
chain owns source publication, SBOM/provenance generation, and archive identities. Each rebase must
record original and target versions/commits, patch digest, reviewed diff, source/output identities,
all positive and mutation results, upstream issue/PR status, and removal condition.

Upstream generalizations should be proposed where maintainable, but an upstream merge is not
itself sufficient: Capsule removes a patch only after a released exact source replaces its
mechanism and the full bounded corpus reproduces on the replacement.
