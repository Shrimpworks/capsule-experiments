# Experiments

This directory is reserved for disposable feasibility spikes. Nothing under `experiments/` is a
production Capsule component, security boundary, runtime profile, or source of authoritative
receipt claims.

Each retained experiment must include its own README with:

- security hypothesis and bounded question;
- exact environment, versions, privileges, and entitlements;
- reproducible positive, negative, misuse, and failure-injection checks;
- observations separated from inference;
- pass, conditional-pass, or fail decision;
- contract/ADR consequence;
- removal or replacement condition.

Production packages must not import experiment code. Reusable ideas move into product code only
after review; retained fixtures/evidence can remain for reproducibility.

The ordered spike briefs are in [Feasibility Spikes](../docs/FEASIBILITY_SPIKES.md).
