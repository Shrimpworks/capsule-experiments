# Experiment archive

Capsule keeps product code, canonical architecture and security decisions, and production
conformance fixtures in this repository. Completed disposable spikes, one-time harnesses, and their
raw retained evidence live in the separate public
[`Shrimpworks/capsule-experiments`](https://github.com/Shrimpworks/capsule-experiments)
repository.

## Initial migration

- Capsule source commit: `566e3234b79fee9470822cd386f41b4d776af70d`
- Archived source path: `experiments/`
- Base archive commit: `0d8233b55f153b27a901a9ec45a3834208e3aa86`
- G3 evidence refresh: `3e9c9cbc3e0314439771151f1fd99c2b3a5a50b9`
- Scope: 38 completed experiment trees, 746 tracked source/evidence files
- Remote verification: GitHub returned the complete, untruncated archive tree and the remote
  `main` ref matched the archive commit before Capsule deleted any source file

The archive root retains `SOURCE_FILES.txt`, `SHA256SUMS`, and `SOURCE.md`. Ignored build outputs,
caches, credentials, signing material, and untracked local files were not copied.

## Repository boundary

Keep here:

- canonical project, architecture, threat-model, roadmap, and ADR decisions;
- product implementation and tests;
- schemas, generated known answers, and cross-language conformance fixtures needed by normal CI;
- concise evidence conclusions and exact archive links.

Keep in `capsule-experiments`:

- disposable platform probes and spike implementations;
- one-time comparison harnesses and measurement scripts;
- raw experiment logs, source inventories, patch prototypes, and non-product SBOM/provenance
  bundles;
- bounded adversarial fixtures used only by their archived harness.

Capsule product packages must never import the archive. Evidence links in canonical documents pin
an exact archive commit instead of following its moving default branch. A result copied into the
archive does not become a supported control or production claim.

## Future experiment delivery

A future research task may use a temporary worktree while it is running. Before integration:

1. retain reusable product contracts and conformance fixtures in Capsule;
2. publish disposable code/evidence to `capsule-experiments` with exact source and environment
   identities;
3. verify the archive commit and file manifest;
4. update Capsule's canonical decision and evidence ledger with a commit-pinned link; and
5. remove the disposable tree from the Capsule change before merging it.

If archive publication or verification fails, keep the source tree and stop the cleanup. Never
delete the only retained copy of security evidence.
