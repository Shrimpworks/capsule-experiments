# C3b/E1 App Group preflight handoff

- Exact preflight slice: `PASSED`.
- Developer-portal registration path for the frozen macOS-style App Group ID: `NO_GO`.
- Frozen App Group identity candidate: retained; platform claim `BLOCKED` on signed execution.
- E1 identity-separation matrix: `BLOCKED` pending exact profile/signature preflight and a new
  owner authorization.
- Installed owner-lock G3/I2B and product admission: `BLOCKED`.
- ADR-0045: `Proposed`.

Merge this correction normally, then pin its immutable archive commit in Capsule. Preserve E0's
exact macOS-style ID. The next step is an inert profile/signature projection gate; do not retry
App Group registration or launch the probes from this correction.
