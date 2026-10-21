# History

Append dated notes. Do not truncate.

## 2026-10-21 enforce-verification-evidence/4.1

Attempt: dad29b9c-88bc-4ad3-8ee9-c1b51e4fe665
Reviewer: bc-6880a005-5532-5942-8e01-c14e1872901f
Verdict: ACCEPT
Commands: `npm test` exit 0 (68 pass); `npm audit --audit-level=high` exit 0.
Build was not claimed. Check results were not written through attempt transition.

## 2026-10-21 persist-bounded-run-sessions/3.4

Attempt: c923e6ab-933a-44a2-a41e-4969af7b9380
Reviewer: bc-96987f34-07ea-5d89-8044-753b42bcde59
Verdict: ACCEPT
Transition: verifying → security-checking (2026-10-21T19:06Z)
Commands: `node --test test/orchestration.test.mjs` exit 0 (17 pass); advisory `npm audit --audit-level=high` exit 0 (0 vulns).
Threat review: Rejecting auto-reopen of sticky `unchanged-state` in `openOrResumeRunSession` (039d456) closes a bypass where attempt/work-item advancement could emit a new stage request without explicit `--new-run`. Sticky closed sessions still short-circuit in `orchestrateRun` with exit 0 and no request; `--new-run` alone creates a zeroed session via `createRunSession`. `stageForState` security-reviewer routing (securityProfile or security-patterned checks) unchanged; new orchestration test locks one security-reviewer request at exit 2 after sticky unchanged-state + `--new-run` with remaining agent-step budget. No security-stage enforcement or new tooling in scope; `evidence.security` left empty per approved unit-only checks registry (no forged threat-review/dependency-audit records).
