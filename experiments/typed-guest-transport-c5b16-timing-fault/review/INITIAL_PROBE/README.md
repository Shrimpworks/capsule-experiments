# Initial C5b16 probe failure

The first exploratory verifier passed the three teardown-delay edges and the
1200-ms spawn-refusal cases, then its 800-ms spawn-delay case failed the test's
assumption that any delay below 1000 ms must still complete normally. Source is
commit 3a9303e plus the scripts copied here; these frozen copies retain that test.
The native assertion did not emit a raw trace, so the exact refusal phase/cause is
unclassified. Do not infer that it diagnoses C5b14B's earlier refusal.

Correction: record raw trace before checking outcomes and permit only ordinary
success or completed conservative recovery for the sub-deadline spawn-delay probe.
Observed refusal phase and remaining setup budget are reported, not retried.
The unchanged normal no-delay case still requires success. No deadline is widened.

The corrected matrix then passed all 38 timing runs and three compiled observer
mutations, but its final host-model metadata read was denied by the tool sandbox.
`metadata-failure.log` retains that failed verifier completion. Metadata collection
was moved before execution so environmental refusal occurs before fixture work.
Final verification explicitly requests host metadata access; no test retry policy
or fixture deadline changes.
