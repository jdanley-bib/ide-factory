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

## 2026-10-21 enforce-risk-gates-and-security-stage/2.2

Attempt: 049a0a00-f6c2-4187-ab0f-7baadd95180a
Reviewer: bc-aaea9636-54a3-5ec4-a6a4-e09c9e9ccd73
Verdict: ACCEPT
Transition: verifying → security-checking (2026-10-21T20:39Z)
Commands: `node --test test/risk-gates.test.mjs` exit 0 (16 pass); advisory `npm audit --audit-level=high` exit 0 (0 vulns).
Threat review: Scoped match in `hasMatchingScopedApproval` (356d7ad) fail-closes on missing change/task, dirty/unresolved HEAD, wrong action/task/change, stale `sourceRevision`, policy version mismatch, expired/not-yet-valid window, invalid JSON/schema, and approver===implementer. Matching accept/complete authorize; `humanGate: false` on non-sensitive work reaches review without approval. `.factory/checks.json` remains unit-only (no scanner argv). `evidence.security` left empty — no forged threat-review records. Not moved to awaiting-review; complete not run.

## 2026-10-21 enforce-risk-gates-and-security-stage/3.1

Attempt: 934b44b7-55ff-47e4-8ddf-9313707ab641
Reviewer: bc-f9ea047e-5815-5278-b118-08acdd05d9ab
Verdict: ACCEPT
Transition: verifying → security-checking (2026-10-21T20:52Z)
Commands: `node --test test/risk-gates.test.mjs test/orchestration.test.mjs` exit 0 (38 pass); advisory `npm audit --audit-level=high` exit 0 (0 vulns).
Threat review: `requiresSecurityStage` in `validateEvidence` (afa2b0a) rejects `verifying` → `awaiting-review` when `securityProfile === security-sensitive` or a security-patterned check matches; attempt file left unchanged on reject. `verificationProfile` alone does not trigger. Orchestration `stageForState` still routes verifying security-sensitive work to role `security-reviewer` / `nextState: security-checking` (tests lock bypass rejection + routing). `.factory/checks.json` remains unit-only (no scanner argv). `evidence.security` left empty — no forged threat-review records. Not moved to awaiting-review; complete not run.

## 2026-10-21 enforce-risk-gates-and-security-stage/3.2

Attempt: 30dbe229-266c-4a72-922e-ceebdc47f490
Reviewer: bc-04f1ac01-db6f-5b20-bb30-7d820a48f997
Implementer: bc-ce850c12-8e69-57a8-a2f1-f6cdd422ec79
Verdict: ACCEPT
Product: 6f7ee25
Commands: `node --test test/risk-gates.test.mjs` exit 0 (25 pass).
Threat review: `assertPassingCliSecurityEvidence` (6f7ee25) gates `security-checking` → `awaiting-review` on passing CLI records bound to attempt id and clean HEAD; default required kind is `threat-review` when no check is security-patterned; red rows and caller-supplied `security` payloads fail closed; `verify` routes security-patterned kinds into `evidence.security`; `complete` also refuses security-required work lacking that evidence. Shipped `.factory/checks.json` stays unit-only (no scanner argv); tests use temporary registry mappings only. Bootstrap sets machine `securityProfile` to dependency-basic so this attempt is not forced through a live threat-review mapping. `evidence.security` left empty — no forged or labeled threat-review records. Attempt state not transitioned; coordinator routes to distinct reviewer.
