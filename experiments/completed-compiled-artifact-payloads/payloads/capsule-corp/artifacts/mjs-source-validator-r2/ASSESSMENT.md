# R2 assessment

## Decision

**PASSED — scoped unsigned construction only.** Two role-specific XPC bundles and two role-specific
parser children are reconstructible offline and byte-identical across two clean same-host build
directories. Their complete retained files, role identities, fixed inactive policies, dependency
graph, notice inventory, SBOM, static dynamic-library closure, and unsigned provenance verify.

## What did not pass or activate

The Source Validator product boundary remains **BLOCKED**. These bytes are not signed with an Apple
identity, installed, enrolled, reachable from either product parent, or authorized to spawn. The
canonical resource policy is inactive, so the launchers refuse after exact predecode. R2 makes no
claim about XPC authentication, App Sandbox confinement, reactive footprint values, overshoot,
cleanup, update composition, parser-child residue, or host availability.

## Next exact boundary

R3 may use these exact bundle bytes only under the separately authorized
[R3 execution packet](../../docs/SOURCE_VALIDATOR_R3_EXECUTION_PACKET.md) for an Apple Development
signing and installed private-XPC reachability experiment. Any source, lock, compiler, target, bundle layout,
plist, policy, launcher, or parser change creates a new artifact identity and requires R2 replay.
R4 remains responsible for deriving active resource values and proving monitored spawn, kill,
drain, reap, cleanup, mixed-update refusal, and residue behavior before any consumer exists.
