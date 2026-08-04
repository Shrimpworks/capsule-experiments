# P0-1 research handoff

- Question: can pinned libkrun consume a finalized unlinked runtime root through direct inherited
  read-only descriptor custody without same-user substitution?
- Defensive scope: owned repository fixtures, local processes, cached pinned OCI images, and one
  owned local libkrun/HVF guest only.
- Decision: **PATCH-CANDIDATE**; the governed raw-only FD-native API passed the controlled local and
  fixed owned-guest corpus. Rerun the final signed installed App Sandbox corpus; do not add a
  privileged helper.
- Exact API/patch: `krun_add_read_only_raw_root_fd` at pinned libkrun commit
  `728df8125077d0db44265f6e997c72b81b65c015`; patch SHA-256
  `48cdbc307b3fa1209fa0ec68fc3f817634af312983d68f0de259db86c0b43333`.
- Confidence: high for observed no-path attachment identity, descriptor ownership/lifetime, local
  alias/mapping negatives, positional-I/O source path, and guest digest; low for installed App
  Sandbox/end-to-end same-UID custody because no valid code-signing identity was available.
- Primary evidence: `RESULTS.md`, `FD_NATIVE_PATCH_REVIEW.md`, and
  `evidence/2026-08-02-fd-native/`.
- Exact residual test: final Developer ID/notarized Supervisor protected-container construction,
  direct runner inheritance, App Sandbox `/dev/fd`/FD-native attachment, task-port/grant denial,
  crash/recovery, and guest digest on exact final bytes.
- Prototype disposition: retain as development-only until the patched installed corpus is
  reconciled; product packages must not import it.
