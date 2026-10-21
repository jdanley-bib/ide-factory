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

## 2026-10-21 enforce-risk-gates-and-security-stage/4.1

Attempt: 18d745da-e9df-445c-a5a5-9ab639d96f4b
Reviewer: bc-daa18683-6b21-5890-a651-4ed360ffc333
Implementer: bc-ad5b4df3-f20c-5aa7-8b8f-a3d9cc4a5073
Verdict: ACCEPT
Product: c72a5cc
Commands: `node --test test/install.test.mjs` exit 0 (14 pass).
Threat review: Template `security-sensitive.humanGate` is true and `release.humanGate` remains true (c72a5cc). Init copies `profiles.json` via `writeIfMissing`, so re-init leaves an existing file byte-for-byte unchanged (install tests cover both). This repo's `.factory/profiles.json` is untouched (`security-sensitive.humanGate` still false at HEAD 6ee0264). Scope is template + install tests only; no scanner argv, no forged security evidence, no attempt transition.

## 2026-10-21 enforce-risk-gates-and-security-stage/4.2

Attempt: f6d2af51-ad7a-435f-9c0e-16e92bcc9924
Reviewer: bc-48e201b4-4a68-5185-9464-4dd05771a55b
Implementer: bc-7e555273-1c59-5f81-a461-d70b73089dc6
Verdict: ACCEPT
Product: 6ce9d47
Commands: `node --test test/risk-gates.test.mjs` exit 0 (26 pass).
Threat review: Five factory-run skill copies (`.cursor`, `.github`, `.agents`, `.claude`, `templates`) describe `human-gate` as the stop for a true profile `humanGate`, not the release profile alone (6ce9d47). Loop sections use `--until human-gate` and do not pass `--new-run` (`--new-run` remains only under New session, human only). Risk-gates skill-copy unit test locks the wording. Scope is skill text + test only; no scanner argv, no forged security evidence, no attempt transition.

## 2026-10-21 enforce-risk-gates-and-security-stage/5.1

Attempt: c55fda80-405c-41b0-ae1c-743da4435908
Reviewer: bc-4bc55479-78ad-5095-900b-66e5a3a91307
Implementer: bc-f2d26bc7-6fcf-5b41-a1e2-967cfaac57bc
Verdict: ACCEPT
Product: 11ccb4b
Commands: `npx openspec validate enforce-risk-gates-and-security-stage --strict` exit 0; `node --test test/risk-gates.test.mjs` exit 0 (27 pass).
Threat review: Integration notes (11ccb4b) honestly record strict OpenSpec validate, `npm test` (146 pass), and `doctor: ok`; focused risk-gates test locks those three command strings. Diff is notes + engineer history + one assertion test only — no transactional finalization, lockout resolution, leases, CI, provenance, observability, or archive. Distinct from implementer. `evidence.security` left empty — no forged check evidence. Attempt state not transitioned.
