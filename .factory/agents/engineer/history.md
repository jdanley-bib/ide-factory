# History

(none yet)

## 2026-10-21 enforce-verification-evidence/1.1

Attempt: b5589489-cdb4-422e-9e8b-d7a7c31d2f32
Implementer: bc-5566208d-f7e0-5f94-99d8-aea8b155e704
Red: `node --test test/verification-evidence.test.mjs` exit 1, 6 assertion failures against a non-enforcing stub.
Green: same command exit 0, 6 pass.

## 2026-10-21 enforce-verification-evidence/1.2

Attempt: 26f6eab8-6ce2-47f6-baad-d2b23494c4da
Implementer: bc-de8fbe90-77d8-5fae-a8fe-bc5d82ad70f4
Red: `node --test test/install.test.mjs` exit 1, checks.json missing after init.
Green: same command exit 0, 10 pass.

## 2026-10-21 enforce-verification-evidence/2.1

Attempt: 89275f35-8d19-45fa-b922-448c8679960e
Implementer: bc-875dcaed-920d-5d98-a11a-c8753b51b2fe
Red: `node --test test/verification-evidence.test.mjs` exit 1, 5 assertion failures (unknown verify command).
Green: same command exit 0, 11 pass.

## 2026-10-21 enforce-verification-evidence/2.2

Attempt: 157decc0-c73a-4736-961d-5691cfb2473f
Implementer: bc-41c68f83-a9cd-56d8-8cf7-8468331ec1d5
Red: schemaVersion undefined and validateCheckRecord did not throw.
Green: `node --test test/verification-evidence.test.mjs` exit 0, 14 pass.

## 2026-10-21 enforce-verification-evidence/2.3

Attempt: cbf4d3cf-e258-4add-807c-d808e4aa6fe3
Implementer: bc-97d51a74-7206-58c4-98a9-811f09ee30fd
Red: worktreeClean undefined !== true.
Green: `node --test test/verification-evidence.test.mjs` exit 0, 17 pass.

## 2026-10-21 enforce-verification-evidence/2.4

Attempt: 7baf2e09-17b8-4525-b3bf-0bd480db79d3
Implementer: bc-85961530-c22e-5116-9db0-e5e703ea3eb3
Red: verify under HALT still exited 0.
Green: `node --test test/verification-evidence.test.mjs` exit 0, 18 pass.

## 2026-10-21 enforce-verification-evidence/3.1

Attempt: 1222a024-5505-4908-aa20-6a5194266804
Implementer: bc-2f3adb83-a334-538b-91b2-f3771b0efd8b
Red: verify import usage exit 1 !== 0.
Green: `node --test test/verification-evidence.test.mjs` exit 0, 27 pass.

## 2026-10-21 enforce-verification-evidence/4.1

Attempt: dad29b9c-88bc-4ad3-8ee9-c1b51e4fe665
Implementer: bc-1fa3e1cb-9266-5ee6-b7d9-2c07a3acd782
Red: verify --check unit --red exit 1, and assertion expected reject for caller verification.
Green: `node --test test/orchestration.test.mjs` exit 0, 9 pass.

## 2026-10-21 enforce-verification-evidence/4.2

Attempt: 1b6bdd69-d6b1-408e-aa05-c10d9ed94a7d
Implementer: bc-38d8d8c1-19e9-530e-982b-87c7e9f5d6fe
Red: forged passed:true was accepted before the gate; attempt-only dirt blocked a pass.
Green: orchestration and verification-evidence tests exit 0, 44 pass.

## 2026-10-21 enforce-verification-evidence/4.3

Attempt: afb8638d-2e0c-4707-8f18-3209896f130a
Implementer: bc-0ef4d2fe-2a82-51e1-a793-9bfaedd232d4
Red: expected issuer hand-written, actual cli.
Green: `node --test test/orchestration.test.mjs` exit 0, 16 pass.

## 2026-10-21 enforce-verification-evidence/5.1

Attempt: 8152331d-3d0a-49ec-9726-4448883624c9
Implementer: bc-c7302652-ec5f-552a-9db8-1d1448116c75
Red: missing implementation notes file.
Green: strict validate exit 0, npm test exit 0 (77 pass), doctor exit 0.

## 2026-10-21 persist-bounded-run-sessions/1.1

Attempt: 1dd1b142-2dc7-4317-a6f6-eea9e5019472
Implementer: bc-4ee1c51e-7df4-5fc9-b731-b6c83c54f755
Red: `node --test test/run-session.test.mjs` exit 1 (3 assertion failures vs stub); `node src/cli.mjs verify run 1dd1b142-2dc7-4317-a6f6-eea9e5019472 --check unit --red` stored exitCode 1 / passed:false.
Green: `node --test test/run-session.test.mjs` exit 0, 3 pass.

## 2026-10-21 persist-bounded-run-sessions/1.2

Attempt: c25f30f4-06f7-4c2e-a65e-90261f9ca384
Implementer: bc-f41b503f-dbea-5dd2-93db-3f0f9f724e58
Red: `node --test test/run-session.test.mjs` exit 1 (2 assertion failures: no session file on first run / resume); `node src/cli.mjs verify run c25f30f4-06f7-4c2e-a65e-90261f9ca384 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 5 pass.
Scope: create/resume only — no budgets/tripwires/stuck/host enforcement.

## 2026-10-21 persist-bounded-run-sessions/1.3

Attempt: 11409764-fcdc-4ef3-ae0e-22916ac1ef69
Implementer: bc-54489461-09a6-5be8-a344-270b204b7df9
Red: `node --test test/run-session.test.mjs` exit 1 (2 assertion failures: unmatched open / high-water still exited 2 with request); `node src/cli.mjs verify run 11409764-fcdc-4ef3-ae0e-22916ac1ef69 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 7 pass.
Scope: ledger tripwire only — appends stay best-effort; no budget/stuck/host enforcement.

## 2026-10-21 persist-bounded-run-sessions/2.1

Attempt: 7b2f2844-928e-4eb7-8461-674bc47ed750
Implementer: bc-c00819ae-5928-5ff4-a321-77696732de1f
Red: `node --test test/run-session.test.mjs` exit 1 (maxAgentSteps stayed 20; `--max-agent-steps` unwired); `node src/cli.mjs verify run 7b2f2844-928e-4eb7-8461-674bc47ed750 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs test/orchestration.test.mjs` exit 0, 24 pass.
Scope: agent-step budget across processes only — persist increment before request; first-request `--max-tasks 1` still exit 2; no completed-task/wall-clock/failure/unchanged/host enforcement.

## 2026-10-21 persist-bounded-run-sessions/2.2

Attempt: c7fa68b1-97c2-49f7-8fab-9b7dbd1a3c7e
Implementer: bc-516efcf5-e89c-5c53-a7c7-515b03e50b57
Red: `node --test test/run-session.test.mjs` exit 1 (baselineDoneIds [] !== ['1.1']); `node src/cli.mjs verify run c7fa68b1-97c2-49f7-8fab-9b7dbd1a3c7e --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 9 pass.
Scope: completed-task budget only — baselineDoneIds at create; count newly finalized during session; stop max-tasks with no request; already-done at creation excluded. No wall-clock/failure/unchanged/host; no review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/2.3

Attempt: 143ad813-9542-4662-acfd-844349500751
Implementer: bc-5d39ce56-0b0f-5900-a10e-a4fd698b91f0
Red: `node --test test/run-session.test.mjs` exit 1 (2 failures: wall-clock exit 2 with request; clock regression exit 2); `node src/cli.mjs verify run 143ad813-9542-4662-acfd-844349500751 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 11 pass.
Scope: wall-clock budget and clock integrity only — elapsed ≥ maxWallClockMs stops code 0 wall-clock/no request; now < startedAt stops code 1 invalid-session/no request; no failure/unchanged/host enforcement; no review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/2.4

Attempt: 7b08cfdc-a44c-45d0-bdc0-546cbd4cb87a
Implementer: bc-f1976f28-d282-5a0f-9c75-89cbb2e817b2
Red: `node --test test/run-session.test.mjs` exit 1 (1 failure: timed-out at maxFailures exit 2 with request, expected 0 max-failures); `node src/cli.mjs verify run 7b08cfdc-a44c-45d0-bdc0-546cbd4cb87a --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 13 pass.
Scope: failure budget only — distinct timed-out or non-passing verification records increment failureCount and countedFailureIds; evidence.red excluded; at maxFailures stop code 0 max-failures/no request; no unchanged/host/invalid-budget; no review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/2.5

Attempt: 7e1f372e-1f51-456d-a365-68946f0be648
Implementer: bc-454b4c19-6657-5629-9670-5d0bfd19a75f
Red: `node --test test/run-session.test.mjs` exit 1 (3 failures: invalid budgets exit 2 with session/request; bare `--max-agent-steps` truthiness; config defaultMaxFailures 0); `node src/cli.mjs verify run 7e1f372e-1f51-456d-a365-68946f0be648 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 18 pass.
Scope: invalid-budget and corrupt-session only — zero/negative/non-integer CLI or config budgets exit 1 invalid-budget/no zeroed session/no request; bare boolean CLI flags rejected; corrupt JSON or missing counter unchanged/no request; no unchanged/host/review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/3.1

Attempt: 1fe9b9fc-4fa7-4721-8bed-1b85f057acd4
Implementer: bc-3f374696-0140-575c-8c29-0678fad461f9
Red: `node --test test/run-session.test.mjs` exit 1, 4 fail (unchanged-state, sticky bytes, --new-run); `node src/cli.mjs verify run 1fe9b9fc-4fa7-4721-8bed-1b85f057acd4 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 23 pass; `node --test test/orchestration.test.mjs` exit 0, 16 pass.
Scope: unchanged-state fingerprint (action/role/task/attempt/state/work-item status), sticky closed sessions without file rewrite, `--new-run`, resume budget tighten-only — no host/HALT/default/skill/review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/3.2

Attempt: 30e9c0f2-5077-43b7-9143-ac9eff1d5874
Implementer: bc-4e3daf72-7186-5143-ba6c-b11288bcacad
Red: `node --test test/run-session.test.mjs` exit 1, 4 fail (max-tokens at ceiling, host-usage-unavailable, config+env ceiling, invalid host/ceiling); `node src/cli.mjs verify run 30e9c0f2-5077-43b7-9143-ac9eff1d5874 --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 28 pass.
Scope: optional `--max-tokens`/`--max-cost` or config ceilings; compare only CLI/env-exposed host metrics; missing metric for configured ceiling → exit 1 `host-usage-unavailable`; at ceiling → exit 0 `max-tokens`/`max-cost` with stored observed value; no ceiling → omit host fields; positive ceilings and non-negative exposed metrics validated fail-closed — no HALT/complete/review/commit/push.

## 2026-10-21 persist-bounded-run-sessions/3.3

Attempt: d21c6018-7133-4b58-a5f2-3a53c613c50d
Implementer: bc-f3b5c95b-9398-5acb-99cd-3c40bc7f48a5
Red: `node --test test/run-session.test.mjs` exit 1, 2 fail (complete fingerprint not persisted; repeat complete not unchanged-state); HALT cases already green; `node src/cli.mjs verify run d21c6018-7133-4b58-a5f2-3a53c613c50d --check unit --red` stored exitCode 1 / passed:false (issuer=cli).
Green: `node --test test/run-session.test.mjs` exit 0, 32 pass.
Scope: complete request persists scribe fingerprint without incrementing agentSteps; repeat complete → unchanged-state; HALT before create and on existing session (regression tests only) — no skill/default/review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/3.4

Attempt: c923e6ab-933a-44a2-a41e-4969af7b9380
Implementer: bc-71e04e8a-ab36-5609-b0b5-5a71762974c2
Red: temporary mutation in `openOrResumeRunSession` made `--new-run` resume sticky closed sessions; `node --test test/orchestration.test.mjs` exit 1, 1 fail (`security-reviewer route in fresh session…`: `0 !== 2`, stdout `Run stopped (unchanged-state) for demo.`, no security-reviewer request); `node src/cli.mjs verify run c923e6ab-933a-44a2-a41e-4969af7b9380 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, logDigest sha256:300575144b9fbd16c2771ba6b43c52032b4f7a5166cf867de36271bdf3720896). Mutation removed before handoff; rejected earlier auto-reopen of sticky `unchanged-state` (spec requires `--new-run`).
Green: `node --test test/orchestration.test.mjs` exit 0, 17 pass; `node --test test/run-session.test.mjs` exit 0, 32 pass.
Scope: orchestration regression test only (`--new-run` after sticky unchanged-state → one security-reviewer request); no production delta retained — no security enforcement/tools/review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/4.1

Attempt: e63c39e8-9c29-419e-af8e-769c141de8d5
Implementer: bc-6845af6a-3531-51c0-a362-d67febcb6b98
Red: `node --test test/install.test.mjs` exit 1, 1 fail (`init writes positive run-budget defaults in config`: missing defaultMaxAgentSteps); `node src/cli.mjs verify run e63c39e8-9c29-419e-af8e-769c141de8d5 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, logDigest sha256:e5744152b721e296a5662b006ef14a7cec92ab11ea29238804638b9a7f980946).
Green: `node --test test/install.test.mjs` exit 0, 12 pass.
Scope: config template run-budget defaults and install tests only — templates/factory/config.json gains defaultMaxAgentSteps/defaultMaxTasks/defaultMaxWallClockMs/defaultMaxFailures; re-init config bytes unchanged; repo `.factory/config.json` untouched; no skill/review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/4.2

Attempt: 98c38e90-8523-4cfa-a251-fe216a73532e
Implementer: bc-2ed30185-e5cb-59d0-8dc8-c48b94715190
Red: `node --test test/run-session.test.mjs` exit 1, 1 fail (factory-run skills missing bounded stop names); `node src/cli.mjs verify run 98c38e90-8523-4cfa-a251-fe216a73532e --check unit --red` stored exitCode 1 / passed:false (issuer=cli, logDigest sha256:cbad5b1ae6ed16e903d65e835104dbad0939d4cbc64ae8ce4dd0d04356691a74).
Green: `node --test test/run-session.test.mjs` exit 0, 33 pass; `npm test` exit 0, 113 pass.
Scope: five factory-run SKILL copies + run-session skill test only — loop resumes without `--new-run`; human-only new session section; no review/complete/commit/push.

## 2026-10-21 persist-bounded-run-sessions/failure-baseline

Attempt: d450408a-cfe6-4852-b36f-4c1dc5e651e9
Implementer: bc-9b81fa19-3ec7-5143-a288-69feae5e339d
Red: `node --test test/run-session.test.mjs` exit 1, 1 fail (`--new-run baselines historical failure ids`: `--new-run` stopped with max-failures instead of orchestration request).
Green: `node --test test/run-session.test.mjs` exit 0, 34 pass.

## 2026-10-21 persist-bounded-run-sessions/5.1

Attempt: 6cedaaba-b3b2-4540-a2b2-b5a8eda64ff6
Implementer: bc-ae8483c8-42ea-5aa9-8256-d83a75f8468b
Red: missing `openspec/changes/persist-bounded-run-sessions/implementation-notes.md`; `node --test test/run-session.test.mjs` 34 pass / 1 fail; `node src/cli.mjs verify run … --check unit --red` stored evidence.red exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `npx openspec validate persist-bounded-run-sessions --strict` exit 0; `npm test` exit 0 (115 pass); `node src/cli.mjs doctor` exit 0; `node --test test/run-session.test.mjs` exit 0, 35 pass.
Scope: integration notes only — no model start, risk gate, transactional complete, lockout, CI, provenance, review, or complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/1.1

Attempt: e55c9c0c-2ab7-4af7-9a4b-a0a6746f176d
Implementer: bc-08b83f75-6cbc-5040-906d-abdcc6efdcf2
Red: `node --test test/risk-gates.test.mjs` exit 1 (ERR_MODULE_NOT_FOUND for `src/lib/risk-gates.mjs`); `node src/cli.mjs verify run e55c9c0c-2ab7-4af7-9a4b-a0a6746f176d --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs` exit 0, 5 pass.
Scope: scoped-approval validator only (`validateScopedApproval` / `writeScopedApproval`) — no approve CLI wiring, human-gate, security stage, lockout, CI, provenance, or complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/1.2

Attempt: 1185d1bd-ff1f-437d-a8af-065599d8d07a
Implementer: bc-623988f2-aed4-5dd5-b3bd-dffc0338625c
Red: `node --test test/risk-gates.test.mjs` exit 1 (3 failures: JSON not written; omitted scope and dirty tree still exit 0); `node src/cli.mjs verify run 1185d1bd-ff1f-437d-a8af-065599d8d07a --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs` exit 0, 8 pass.
Scope: scoped `approve` CLI only — JSON via validator, decisions append, refuse missing scope / dirty non-run-state; no human-gate, security stage, lockout, CI, provenance, or complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/2.1

Attempt: d989d087-25f9-408b-a6d1-0f593b01c5db
Implementer: bc-2f1a688c-749e-5c38-a804-97a84aec8aa6
Red: `node --test test/risk-gates.test.mjs` exit 1 (4 failures: accept request still emitted; complete succeeded without approval; missing/non-boolean gate not fail-closed); `node src/cli.mjs verify run d989d087-25f9-408b-a6d1-0f593b01c5db --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs` exit 0, 12 pass.
Scope: fail-closed human gate only — `humanGate: true` / missing profile / non-boolean blocks accept (`run` exit 0 `human-gate`, no request, session open) and `complete` (nonzero, item undone); no valid-matching approval matrix (2.2), security stage, lockout, CI, provenance, or transactional complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/2.2

Attempt: 049a0a00-f6c2-4187-ab0f-7baadd95180a
Implementer: bc-28a08772-dc3e-5db8-81b6-131c8bce22d8
Red: `node --test test/risk-gates.test.mjs` exit 1 (2 failures: matching accept still human-gate; matching complete still rejected); `node src/cli.mjs verify run 049a0a00-f6c2-4187-ab0f-7baadd95180a --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs` exit 0, 16 pass.
Scope: matching scoped approval authorizes accept/complete; wrong action/task, stale revision, expired window, or policy version mismatch reject; `humanGate: false` non-sensitive reaches review without approval. `.factory/active-change.json` treated as factory run-state so `run` does not self-invalidate the gate. No security-stage, scanner argv, checkbox, review, complete, or push.

## 2026-10-21 enforce-risk-gates-and-security-stage/3.1

Attempt: 934b44b7-55ff-47e4-8ddf-9313707ab641
Implementer: bc-a95794d1-0bea-5a09-b8af-429f21713938
Red: `node --test test/risk-gates.test.mjs test/orchestration.test.mjs` exit 1 (3 failures: security-sensitive verifying→awaiting-review still allowed); `node src/cli.mjs verify run 934b44b7-55ff-47e4-8ddf-9313707ab641 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs test/orchestration.test.mjs` exit 0, 38 pass.
Scope: mandatory security stage only — security-sensitive (securityProfile or security-patterned checks) rejects verifying→awaiting-review and stays verifying; verificationProfile alone does not require the stage; next run still requests security-reviewer. No security evidence gate (3.2), scanner argv, checkbox, review, complete, or push.

## 2026-10-21 enforce-risk-gates-and-security-stage/3.2

Attempt: 30dbe229-266c-4a72-922e-ceebdc47f490
Implementer: bc-ce850c12-8e69-57a8-a2f1-f6cdd422ec79
Red: `node --test test/risk-gates.test.mjs` exit 1 (5 failures: missing CLI security gate / security bucket / complete skip); `node src/cli.mjs verify run 30dbe229-266c-4a72-922e-ceebdc47f490 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/risk-gates.test.mjs` exit 0, 25 pass; with orchestration 44 pass.
Scope: security-checking→awaiting-review requires passing CLI security record bound to attempt/clean HEAD; default kind threat-review when no security-patterned check; red and caller-supplied security payloads rejected; verify routes security-patterned kinds to evidence.security; complete refuses security-required work lacking that evidence. No shipped scanner argv, checkbox, review, complete, or push.

## 2026-10-21 enforce-risk-gates-and-security-stage/4.1

Attempt: 18d745da-e9df-445c-a5a5-9ab639d96f4b
Implementer: bc-ad5b4df3-f20c-5aa7-8b8f-a3d9cc4a5073
Red: `node --test test/install.test.mjs` exit 1 (1 failure: security-sensitive.humanGate false !== true); `node src/cli.mjs verify run 18d745da-e9df-445c-a5a5-9ab639d96f4b --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/install.test.mjs` exit 0, 14 pass.
Scope: profile template only — `security-sensitive.humanGate` true, `release.humanGate` remains true; new init writes both; re-init leaves existing profiles.json byte-for-byte unchanged. Did not edit this repo's `.factory/profiles.json`. No checkbox, review, complete, or push.

## 2026-10-21 enforce-risk-gates-and-security-stage/4.2

Attempt: f6d2af51-ad7a-435f-9c0e-16e92bcc9924
Implementer: bc-7e555273-1c59-5f81-a461-d70b73089dc6
Red: `node --test test/risk-gates.test.mjs` exit 1 (1 failure: five factory-run skills still say human-gate (release profile)); `node src/cli.mjs verify run f6d2af51-ad7a-435f-9c0e-16e92bcc9924 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:b098bfc917385bc18729be2a8f38f55a6e8275effd27c841d7825ced28ea6cf9).
Green: `node --test test/risk-gates.test.mjs` exit 0, 26 pass.
Scope: five factory-run SKILL copies + risk-gates skill test only — human-gate described as true profile `humanGate` stop, not release profile alone; loop still does not pass `--new-run`. No checkbox, review, complete, or push.

## 2026-10-21 enforce-risk-gates-and-security-stage/5.1

Attempt: c55fda80-405c-41b0-ae1c-743da4435908
Implementer: bc-f2d26bc7-6fcf-5b41-a1e2-967cfaac57bc
Red: missing `openspec/changes/enforce-risk-gates-and-security-stage/implementation-notes.md`; `node --test test/risk-gates.test.mjs` 26 pass / 1 fail; `node src/cli.mjs verify run c55fda80-405c-41b0-ae1c-743da4435908 --check unit --red` stored evidence.red exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:4b6c06f7dc5b3f960482b7ebfdb96a626d68e91233961cfbf13aa52ea4d8edfa).
Green: `npx openspec validate enforce-risk-gates-and-security-stage --strict` exit 0; `npm test` exit 0 (146 pass); `node src/cli.mjs doctor` exit 0; `node --test test/risk-gates.test.mjs` exit 0, 27 pass.
Scope: integration notes only — no model start, transactional complete, lockout, lease, CI, provenance, observability, review, checkbox, or push.

## 2026-10-21 make-finalization-recoverable/1.1

Attempt: 25abe23f-bfaf-4489-b0cc-8e014bacc45f
Implementer: bc-dbaa9b47-88a9-5be9-b262-7585198dac69
Red: `node --test test/finalization-recovery.test.mjs` exit 1 (ERR_MODULE_NOT_FOUND for `src/lib/finalization-recovery.mjs`); `node src/cli.mjs verify run 25abe23f-bfaf-4489-b0cc-8e014bacc45f --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/finalization-recovery.test.mjs` exit 0, 8 pass.
Scope: journal validation and atomic creation only — schema v1 bind/allowlist/planDigest; corrupt, unsupported, path-traversing, identity-mismatched, revision-mismatched fail closed without marking done. No replay, fault injection, lockout, lease, complete wiring, review, or push.

## 2026-10-21 make-finalization-recoverable/1.2

Attempt: 46a2aac4-ca25-4b93-a9db-ee047d77be5c
Implementer: bc-e0b69195-d4e8-574f-a362-216d96aaf86f
Red: `node --test test/finalization-recovery.test.mjs` exit 1 (missing export `buildFinalizationPlan`); `node src/cli.mjs verify run 46a2aac4-ca25-4b93-a9db-ee047d77be5c --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:e5c0b609c549019138f96282e7cad459345c6d4ac4854f3befd01ed0570e1082).
Green: `node --test test/finalization-recovery.test.mjs` exit 0, 10 pass.
Scope: planned target generation only — deterministic plan for checkbox, scribe marker, identity, finalized attempt, intended index, ready journal, and atomic work-item done as final correctness-critical write; frozen completionDate/finalizedAt. No replay, fault injection, lockout, lease, complete wiring, review, or push.

## 2026-10-21 make-finalization-recoverable/2.1

Attempt: 3a56eca2-2a84-440c-b064-87222e4e7a3c
Implementer: bc-00133855-88d8-53b4-9d4d-a6a578edb96b
Red: `node --test test/finalization-recovery.test.mjs` exit 1 (missing exports compareAndApplyTarget/recoverFinalization); `node src/cli.mjs verify run 3a56eca2-2a84-440c-b064-87222e4e7a3c --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:b5b6b7b1f602b75b0e5806041f16fd05c2a3f8846666af6026f42aec0fa70945).
Green: `node --test test/finalization-recovery.test.mjs` exit 0, 17 pass.
Scope: compare-and-apply recovery only — skip after-digest, apply before-digest, conflict otherwise; recoverFinalization resumes finalized+unfinished journal and repeats already-committed without duplicating checkbox/scribe/attempt history; journal apply bytes aligned to validated create shape. No fault injection, lockout, lease, complete wiring, review, or push.

## 2026-10-21 make-finalization-recoverable/2.2

Attempt: 53b91f30-220d-425e-8f86-e9b3dbbc18ab
Implementer: bc-f9136866-3cd3-54a7-b04b-49280da24f59
Red: `node --test test/finalization-recovery.test.mjs` exit 1 (missing exports finalizationFaultBoundaries/runJournaledFinalization); orchestration finalized+unfinished journal exited 0 max-tasks instead of needs-complete; `node src/cli.mjs verify run 53b91f30-220d-425e-8f86-e9b3dbbc18ab --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:060bfc130d40aa90e99a93627df3f3f12f68cc50da5f1da0a54a489baa4a1ea7).
Green: `node --test test/finalization-recovery.test.mjs test/orchestration.test.mjs` exit 0, 40 pass.
Scope: library-only fault hook at journal and every pre-commit/ready-journal/before-commit boundary; table-driven recovery invariants; orchestration needs-complete for finalized+matching unfinished journal. No lockout, lease, complete wiring, review, or push.

## 2026-10-21 make-finalization-recoverable/3.1

Attempt: 7fb6a76f-7c65-4252-aa20-95c69f0257be
Implementer: bc-aaa7940c-be3e-5ebc-8f9a-52dc1d4ee4e7
Red: `node --test test/govern.test.mjs test/finalization-recovery.test.mjs` exit 1 (6 failures: created.json/print id, resolve path, blocking/unblock, idempotent/conflict, legacy basename+digest, governance skill resolve docs); `node src/cli.mjs verify run 7fb6a76f-7c65-4252-aa20-95c69f0257be --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:0f93a6d1d868aa2339a65d1500f945205897ef9ab8d76e43e5f167048bfced53).
Green: `node --test test/govern.test.mjs test/finalization-recovery.test.mjs` exit 0, 27 pass; `npm test` exit 0, 172 pass.
Scope: versioned lockout create/resolve with immutable schema v1 created.json/resolved.json; compatibility create alias; distinct resolver+reason; idempotent exact repeat and conflict rejection; legacy markdown resolve by basename+digest without mutation; shared hasActiveLockout blocking; five factory-governance skill copies. No lease, review, accept, complete, or push.

## 2026-10-21 make-finalization-recoverable/4.1

Attempt: 42a06afe-b7f8-44c0-ab0d-94b797b650ce
Implementer: bc-a4e7d563-f44e-5b02-90bd-aae81e6abc87
Red: `node --test test/writer-lease.test.mjs` exit 1 (ERR_MODULE_NOT_FOUND for `src/lib/writer-lease.mjs`); `node src/cli.mjs verify run 42a06afe-b7f8-44c0-ab0d-94b797b650ce --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:3d545b810c2375b32266627534ec00e921ddb10dca24c6a5cba5273d69d6d291).
Green: `node --test test/writer-lease.test.mjs` exit 0, 7 pass.
Scope: schema v1 writer lease primitives only — atomic mkdir acquire, LEASE_HELD exclusion without mutation, matching-id release on success/handled error, read-only wrapper that neither acquires nor removes. No heartbeat, stale takeover, corrupt refusal, HALT bypass, CLI dispatch wiring, review, accept, complete, or push.

## 2026-10-21 make-finalization-recoverable/4.2

Attempt: 29c52e9a-6ec4-4fdd-a733-7b7248bce462
Implementer: bc-03a962db-89ec-5031-86e3-ffbba1993901
Red: `node --test test/writer-lease.test.mjs` exit 1 (6 failures: heartbeat, five-minute stale takeover, owner-loss, corrupt/unsupported LEASE_RECOVERY, CLI wrap/cliCommandKey, release/takeover); `node src/cli.mjs verify run 29c52e9a-6ec4-4fdd-a733-7b7248bce462 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:c98e8af0e566fa12a790234f983e4926ad27d01034db7dc5537a3a2b510a9f2d).
Green: `node --test test/writer-lease.test.mjs test/orchestration.test.mjs test/govern.test.mjs` exit 0, 41 pass.
Scope: fake-clock one-minute heartbeat, five-minute expiry with one-winner atomic stale-directory rename takeover, owner-loss rejection, corrupt/unsupported LEASE_RECOVERY without delete, HALT lease bypass, top-level CLI wrap of all mutating commands without nested acquisition, read-only unleased, release rename TOCTOU fix vs successor. No review, accept, complete, or push.

## 2026-10-21 make-finalization-recoverable/5.1

Attempt: 9247289a-042d-4ef4-8e9c-1f98d80ee70f
Implementer: bc-c064be93-5bd6-54d5-aebc-9344f8749e47
Red: missing `openspec/changes/make-finalization-recoverable/implementation-notes.md`; `node --test test/finalization-recovery.test.mjs` 20 pass / 1 fail; `node src/cli.mjs verify run 9247289a-042d-4ef4-8e9c-1f98d80ee70f --check unit --red` stored evidence.red exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:3a52394a372624272647300b38fcb975201f2ca977cb127ae2f382d093ae79a9).
Green: `npx openspec validate make-finalization-recoverable --strict` exit 0; `npm test` exit 0 (187 pass); `node src/cli.mjs doctor` exit 0; `node --test test/finalization-recovery.test.mjs` exit 0, 21 pass.
Scope: integration notes only — no model start, CI, provenance, observability, gate/evidence policy change, archive, review, checkbox, or push.

## 2026-10-21 make-finalization-recoverable/4.2 follow-up (publication race)

Implementer: bc-4b9faad8-5f00-549e-adc3-cfb57b7969bf
Context: clean full-suite verify exposed flaky 4.2 stale-takeover loser getting LEASE_RECOVERY instead of LEASE_HELD (line ~383); root cause was writer.lease visible between mkdir and owner.json write, plus vanished-directory reads during concurrent stale rename.
Red: `node --test test/writer-lease.test.mjs` — new atomic-publication regression failed with `gaps=2 contender=LEASE_RECOVERY` (existing concurrent stale-takeover test also red under stress).
Green: `node --test test/writer-lease.test.mjs` exit 0, 16 pass; stress 100× exit 0; `node --test test/writer-lease.test.mjs test/orchestration.test.mjs test/govern.test.mjs` exit 0, 43 pass.
Scope: staging-directory rename publication + missing lease dir → LEASE_HELD; preserve corrupt/unsupported fail-closed and one-winner stale rename. No attempt mutation, review, complete, or push.

## 2026-10-21 make-finalization-recoverable integration follow-up (complete → journaled finalization)

Implementer: bc-ce055288-021d-5690-a0f0-6825d222923c
Context: audit found `completeWorkItem` still used legacy done-first writes and never called `runJournaledFinalization`; journal lacked durable commit bytes for process-restart recovery without an in-memory plan. Blocks true 5.1 acceptance. Did not mutate accepted attempt 5.1.
Red: `node --test test/finalization-recovery.test.mjs` exit 1 — 20 pass / 4 fail (missing journal.commit; completeWorkItem ignored faultHook / did not journal).
Green: `node --test test/finalization-recovery.test.mjs` exit 0, 24 pass; `node --test test/finalization-recovery.test.mjs test/orchestration.test.mjs` exit 0, 44 pass; `npm test` exit 0, 192 pass.
Scope: persist `finalizedAt`+`commit` on journal; resume from journal without rebuilding plan; wire `completeWorkItem` to journaled finalization with library-only faultHook; allow accepted/finalize-failed/finalized+journal retries; dirty-worktree resume only with matching journal HEAD; ledger after commit only. No review, complete, push, archive, or branch change.
