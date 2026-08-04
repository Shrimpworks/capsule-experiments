# Source and provenance

This archive was mechanically copied from the tracked `experiments/` tree at
Capsule commit `566e3234b79fee9470822cd386f41b4d776af70d` on 2026-08-04. Before the
Capsule cleanup branch merged, the `supervisor-owner-lock-installed-g3`
experiment advanced on `main`; that complete subtree was refreshed from Capsule
commit `810cbcc03eb7a03f678668af5f7e34391107aad7` on the same date.

The copy preserves tracked file bytes, executable modes, symlinks, and relative
paths. Ignored local build outputs, caches, credentials, signing material, and
other untracked files were not copied.

Individual experiments retain their recorded upstream identities, licenses,
notices, and limitations. This archive does not relicense bundled or referenced
third-party material. Consult each experiment's README, RESULTS, provenance,
SBOM, and license evidence before reuse.

The source commit remains the rollback point until the corresponding Capsule
cleanup pull request is merged. If the archive verification fails, do not delete
or rewrite the source experiment tree.

## Fork-native Linux/arm64 follow-up

On 2026-08-04, branch `codex/fork-native-arm64-rebuild` added the defensive
fork-native Linux/arm64 reconstruction result under
`experiments/gate-c-fork-native-deno-runtime-bundle/`, based on archive commit
`3e9c9cbc3e0314439771151f1fd99c2b3a5a50b9`. The follow-up consumes exact public
`Shrimpworks/deno` and `Shrimpworks/rusty_v8` refs, retains only experiment code
and evidence, and does not import code into either fork or Capsule product
packages. `SOURCE_FILES.txt` and `SHA256SUMS` were refreshed to bind the complete
831-file `experiments/` tree after this addition. Retained `.log` files are
marked non-text so Git preserves their exact captured bytes.
