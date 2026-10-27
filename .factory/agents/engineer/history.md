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

## 2026-10-22 establish-factory-ci-and-provenance/1.1

Attempt: b494d2f8-f24e-49c5-81de-125461fbccd4
Implementer: bc-a02322a9-e6eb-588f-bb2f-47944a1a24f6
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `.github/workflows/ci.yml`); `node src/cli.mjs verify run b494d2f8-f24e-49c5-81de-125461fbccd4 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 1 pass.
Scope: baseline CI job only — `.github/workflows/ci.yml` job `baseline` on pull_request/push, Node 22, four fail-closed commands (`npm ci`, `npm test`, `npm audit --audit-level=high`, `npx openspec validate --all`). No pin/permission enforcement (1.2), scanners, release provenance, branch controls, review, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/1.2

Attempt: dd43c46e-b924-454b-8e90-7311a3646ec3
Implementer: bc-33d9fdda-7d9d-5e59-b875-2d211ac741eb
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `permissions.contents: read`; tag-pinned actions); `node src/cli.mjs verify run dd43c46e-b924-454b-8e90-7311a3646ec3 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 2 pass.
Pins: `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` # v4.4.0; `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` # v4.4.0 (from api.github.com commits/v4 + git ls-remote tags).
Scope: `contents: read`, full-SHA action pins with version comments, no `pull_request_target` / `continue-on-error`. No scanners, release, branch controls, review, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/2.1

Attempt: e44e3bae-3ba6-4d98-a64f-7471ce36f9be
Implementer: bc-b658b85d-4eed-58e3-a1f3-bba903e07794
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `secret-scan` job); `node src/cli.mjs verify run e44e3bae-3ba6-4d98-a64f-7471ce36f9be --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:654955fabac68fa3649be60713bb721c74b62f020a8159bd28787277491b39dd).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 3 pass.
Deps: `secretlint@13.0.7`, `@secretlint/secretlint-rule-preset-recommend@13.0.7` (exact; npm --save-exact).
Shared command: `npx secretlint "**/*"` (package script `secretlint`, `.secretlintrc.json` recommend preset, CI job `secret-scan`).
Scope: secretlint only — temp seeded Slack-bot fixture exits non-zero with masked output; clean temp tree exits zero; no contiguous secret in committed sources. No Semgrep (2.2), release, branch controls, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/2.2

Attempt: 983f8451-bce2-4aa9-bbe7-fb139d2bf2b1
Implementer: bc-e4a15f0c-7617-5bab-887e-59de470e1774
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `sast` job); `node src/cli.mjs verify run 983f8451-bce2-4aa9-bbe7-fb139d2bf2b1 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:9e65b70660ceec7b84a764d8c7de7a063096eab6acb14d61f8c857ea73e94006).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 4 pass.
Tooling: Semgrep `1.182.0` via `python3 -m pip install --user` (exact pin; not an npm/runtime dependency); CI adds `$HOME/.local/bin` to `GITHUB_PATH`.
Shared command: `semgrep --error --metrics=off --config p/javascript` (CI job `sast`, no `continue-on-error`).
Scope: Semgrep SAST only — temp seeded express XSS fixture exits non-zero; no insecure fixture committed. No release, branch controls, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/2.2

Attempt: d1db173b-f29e-407b-ab70-9674892ba8ce
Implementer: bc-4ba8835d-2693-569c-a077-834313f33abd
Red: `node --test test/ci-provenance.test.mjs` exit 1 (fail-closed `scripts/run-semgrep.mjs` / `sast` job not green after lockout); `node src/cli.mjs verify run d1db173b-f29e-407b-ab70-9674892ba8ce --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:9e4c4b8c6dea80a343ccad10026ce188b6f13485b26a177cd4528618b422928b).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 4 pass.
Tooling: `scripts/run-semgrep.mjs` fail-closed wrapper (no download/install; `--skip-semgrep` escape hatch not used in baseline or `sast` CI).
Shared command: `node scripts/run-semgrep.mjs` invokes `semgrep --error --metrics=off --config p/javascript` when the binary is on PATH (CI job `sast`, no `continue-on-error`, no pip installer).
Scope: Semgrep fail-closed SAST — absent binary exits non-zero; `--skip-semgrep` warns and records `SEMGREP_SKIP`; stub proves required argv; installer traps untouched. No release, branch controls, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/3.1

Attempt: ad20dce0-6681-4507-a396-26b6a50c2b9b
Implementer: bc-cb82001b-f989-548b-b689-88467eccb27c
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `.github/workflows/release.yml`); `node src/cli.mjs verify run ad20dce0-6681-4507-a396-26b6a50c2b9b --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:960495617e13d309b1c037d088a47ceafee218cad6950c73c4af7ce25c098ed7).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 5 pass; `npm test` exit 0, 197 pass.
Tooling: `@cyclonedx/cyclonedx-npm@6.0.1` exact devDependency; shared commands `npx @cyclonedx/cyclonedx-npm@6.0.1 --package-lock-only --output-file release/sbom.cdx.json` and `node scripts/annotate-release-sbom.mjs release/sbom.cdx.json` (lockfile `sha256:` digest + `source-revision` metadata properties).
Release workflow: `.github/workflows/release.yml` job `release` on tag `v[0-9]+.[0-9]+.[0-9]+`, `contents: read` only (no `id-token: write`), full-SHA action pins, `npm ci` + CycloneDX + annotate + SBOM artifact upload; no npm publish.
Scope: release SBOM only — no SLSA attestation (3.2), branch controls, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/3.2

Attempt: 82557439-e1d2-4207-b490-1460c136a444
Implementer: bc-b6db62db-72eb-5062-a9c4-75690e46a863
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `id-token: write`, `attestations: write`, and `actions/attest-build-provenance` after annotation); `node src/cli.mjs verify run 82557439-e1d2-4207-b490-1460c136a444 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:f6587be20761f29487ce30aff00eee789ce36b0b0d488b6b012cd05cfeb74e3c).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 6 pass; `npm test` exit 0 (198 pass); `node src/cli.mjs verify run 82557439-e1d2-4207-b490-1460c136a444 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, logDigest sha256:f92652e851c9b91961af0dd084fc37136dba15455628b0e82b7349b80c79d49a, sourceRevision 2428745c0945f4565f06904a97294270c041bbeb — factory chore after product 4c43e39).
Release workflow: `contents: read`, `id-token: write`, `attestations: write`; `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8` (`subject-path: release/sbom.cdx.json`) after SBOM annotation; no SLSA Build L2/L3 claims.
Scope: release SBOM provenance attestation only — no branch controls, npm publish, forge admin API, observability, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/4.1

Attempt: c6790978-0806-44b4-b659-eac3c9ccba3d
Implementer: bc-48a1b099-8bf4-58c4-82d7-6d9ba303bd5d
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `.github/branch-review-controls.json` and `.github/CODEOWNERS`); `node src/cli.mjs verify run c6790978-0806-44b4-b659-eac3c9ccba3d --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:32d84c1d405936ba970fc8916c8893322ad99a0b578f3e61bcb0b13ad2eb8ff6).
Green: `node --test test/ci-provenance.test.mjs` exit 0, 7 pass; `npm test` exit 0 (199 pass); `node src/cli.mjs verify run c6790978-0806-44b4-b659-eac3c9ccba3d --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, logDigest sha256:f5ac87a4622315afda8fcde799d3915483a7614f8fcdaf5c9cfb1a7a897fe843, sourceRevision d8761720b2577511668e936e60ce4caf7762dab7).
Declaration: `.github/branch-review-controls.json` schemaVersion 1, `requiredStatusCheckName` baseline, `requiredApprovingReviewCount` 1, `allowForcePushes` false, `protectedBranch` main, `enforcedByForge` false; `.github/CODEOWNERS` `* @jdanley-bib`; tests scan `.github`, `scripts`, and `src` for forbidden forge admin API patterns.
Scope: branch review declaration only — no forge admin API, npm publish, observability, review, accept, complete, or push.

## 2026-10-22 establish-factory-ci-and-provenance/5.1

Attempt: f615a850-ec61-4c7a-8793-b80f4820f46a
Implementer: bc-533c85e2-3880-5491-b79f-a2eae6b1bd36
Red: `node --test test/ci-provenance.test.mjs` exit 1 (missing `openspec/changes/establish-factory-ci-and-provenance/implementation-notes.md`); pre-notes `npm test` exit 1 (199 pass / 1 fail); `node src/cli.mjs verify run f615a850-ec61-4c7a-8793-b80f4820f46a --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:66a28df3171a7049831c9d08afaab5d17befc054d6df4be460e86f2b254ae4ce).
Green: integration command batch (strict validate, validate --all, npm test ×2, npm ci, npm audit --audit-level=high) all exit 0 with honest notes; `node --test test/ci-provenance.test.mjs` exit 0, 8 pass; `npm test` exit 0 (200 pass); `node src/cli.mjs verify run f615a850-ec61-4c7a-8793-b80f4820f46a --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, logDigest sha256:0dd6f0375ba1585cf9e07c93609aa407d0bebd6bd4293212a5d283408ca76f84, sourceRevision 9ca04f6690ea71f3d8fc969156ba613ed995e706).
Notes: `openspec/changes/establish-factory-ci-and-provenance/implementation-notes.md` records seven command sections in task order (duplicate `npm test` and `npx openspec validate --all` executions).
Scope: integration verification only — no model start, gate/evidence policy change, GitHub admin API, observability, archive, review, accept, complete, or push.

## 2026-10-22 add-cline-ide-adapter/1.1

Attempt: 25d7c140-147c-4c27-bd15-39a69a7d4eb5
Implementer: cline-engineer-1.1
Red: `node src/cli.mjs verify run 25d7c140-147c-4c27-bd15-39a69a7d4eb5 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit); new test failed ENOENT for `.cline/rules/factory.md`.
Green: `node --test test/install.test.mjs` exit 0, 15 pass (pending full `verify run --check unit` after commit).
Scope: Cline adapter install only — `templates/cline/rules/factory.md`, `.cline/skills` destination, `.cline/workflows/factory-*.md` (shared command body + owned marker), install test; no `.clinerules/`, doctor, AGENTS.md, team-style, no-model scan, review, complete, or push.

## 2026-10-22 add-cline-ide-adapter/1.2

Attempt: 9f8f15dc-e453-489d-899c-2634a7928443
Implementer: cline-engineer-1.2
Red: temporary omit of `.cline/skills` from `writeAdapters` destinations; `node src/cli.mjs verify run 9f8f15dc-e453-489d-899c-2634a7928443 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:1809b24294bef490ff2badf1fc819e01043c116675b1a9e1cf8e63808bff7f13); new preserve/upgrade test failed with 1.1 Cline skills test.
Green: restored `.cline/skills`; `node --test test/install.test.mjs` exit 0, 16 pass; production `install.mjs` unchanged after restore.
Scope: install test only — init leaves app.js and `.cline/rules/team-style.md` unchanged; upgrade restores edited `.cline/skills/factory-coordinator/SKILL.md`, keeps CUSTOM-DECISION-KEEP and team-style, does not delete other `.cline/` files; no doctor, AGENTS.md, second queue, CI, review, complete, or push.

## 2026-10-22 add-cline-ide-adapter/1.3

Attempt: a7444fda-e693-4524-8958-4450ddbebfd8
Implementer: cline-engineer-1.3
Red: temporarily removed `The IDE session model does the work.` from `templates/skills/factory-coordinator/SKILL.md`; `node src/cli.mjs verify run a7444fda-e693-4524-8958-4450ddbebfd8 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit); sentence restored before commit.
Green: `node --test test/install.test.mjs` exit 0, 16 pass (pending full `verify run --check unit` after commit).
Scope: install test only — extend no-model scan to `.cline/skills` and `.cline/workflows`; launchPattern unchanged; no CI, doctor, instruction fragment, queue, gates, lockout, review, complete, or push.

## 2026-10-22 add-cline-ide-adapter/1.4

Attempt: ab8b238f-b2fb-4c54-a363-a3a6161b6248
Implementer: cline-engineer-1.4
Red: `node --test test/install.test.mjs` exit 1 (1 failure: AGENTS.md factory section lacked `.cline/rules/factory.md`); `node src/cli.mjs verify run ab8b238f-b2fb-4c54-a363-a3a6161b6248 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green: `node --test test/install.test.mjs` exit 0, 17 pass (pending full `verify run --check unit` after commit).
Scope: instruction fragment + install test only — one line naming `.cline/rules/factory.md` in `templates/fragments/instructions.md`; no new instruction-file target; no CI, doctor, queue, gates, lockout, Semgrep, review, complete, or push.

## 2026-10-22 add-cline-ide-adapter/2.1

Attempt: 0292fa6b-4229-4a3b-ad25-f2160bff8cff
Implementer: cline-engineer-2.1
Red: `node --test test/install.test.mjs` exit 1 (doctor still exited 0 after removing `.cline/rules/factory.md`); `node src/cli.mjs verify run 0292fa6b-4229-4a3b-ad25-f2160bff8cff --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, logDigest sha256:d105b58b4521e8878dc5f20626d502aa2042519b67a87bbefc27a37e05f08daa).
Green: `node --test test/install.test.mjs` exit 0, 18 pass (pending full `verify run --check unit` after commit).
Scope: doctor REQUIRED only — `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md`; install test asserts healthy doctor after init and `missing <path>` on stdout when either file is removed; no every-workflow/every-skill requirement; no CI, Semgrep, Node, Python, queue, gates, lockout, review, complete, or push.

## 2026-10-22 add-cline-ide-adapter/3.1

Attempt: 27e6311a-e7fa-4b6a-b780-424369c3e88e
Implementer: cline-engineer-3.1
Red: missing `openspec/changes/add-cline-ide-adapter/implementation-notes.md`; `node --test test/install.test.mjs` exit 1 (18 pass / 1 fail); `node src/cli.mjs verify run 27e6311a-e7fa-4b6a-b780-424369c3e88e --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit).
Green commands (recorded in notes):
1. `npx openspec validate add-cline-ide-adapter --strict` exit 0
2. `npx openspec validate --all` exit 0
3. `node --test test/install.test.mjs` exit 0
Scope: integration notes only — no second queue; no gate, evidence, or lockout change; no model launch; no archive; no review, complete, or push.

## 2026-10-23 document-approve-principal-flags/1.1

Attempt: b72e52fd-56de-4bba-87b6-1d9dc22c2d0f
Implementer: engineer-doc-flags
Red: `node src/cli.mjs verify run … --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit; timedOut at 120s before timeout bump).
Green: `node src/cli.mjs verify run … --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 8d86911a4411aa86679751a62e869a302d6ff5d9).
Scope: README Gates approve example + `test/readme-approve-example.test.mjs` only for product; unit `timeoutMs` 120000→180000 so npm test can finish under verify. Stopped at verifying — no awaiting-review, accept, approve, or push.

## 2026-10-23 establish-pr-outer-loop/1.1

Attempt: 9abb018f-2cf0-4dfd-82a4-d2441712ec2a
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run 9abb018f-2cf0-4dfd-82a4-d2441712ec2a --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 27dbc480b421b3f7c319bf269b1b5d167e9691e9).
Green: `node src/cli.mjs verify run 9abb018f-2cf0-4dfd-82a4-d2441712ec2a --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision e4a646e83c62a1bc5fb07f4b893c71f821d84911).
Scope: `pr open` only — stub forge, `factory/<change>` branch, `.factory/pull-requests/<change>.json`, create then update same PR, no merge / forge admin API / shell. No body evidence links (1.2), comment, capture, scaffold, help, review accept, or push.

## 2026-10-23 establish-pr-outer-loop/1.2

Attempt: 67cba4f1-3e38-4d87-b81f-d6da87d73341
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run 67cba4f1-3e38-4d87-b81f-d6da87d73341 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 18176f14fbd476677526e79d980e1ca310ff8782).
Green: `node src/cli.mjs verify run 67cba4f1-3e38-4d87-b81f-d6da87d73341 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 5f029cc5ab5f124013a2cf3f2b4e4990408f48f5).
Scope: PR body evidence links only — source revision, attempt ids, approval/check record paths; no check log text or env values. No comment, capture, scaffold, help, review accept, or push.

## 2026-10-23 establish-pr-outer-loop/1.3

Attempt: 09bb15e3-48ff-4c13-b758-2247e580a2eb
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run 09bb15e3-48ff-4c13-b758-2247e580a2eb --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 035e892042efbda3670a075eabd8841808ed5320).
Green: `node src/cli.mjs verify run 09bb15e3-48ff-4c13-b758-2247e580a2eb --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 6753a27786e7edb21ffb4fdfa870a5ad5e2b92d1).
Scope: `pr comment` only — posts the verdict and role already stored on the attempt review record; missing verdict exits non-zero and does not write one. No capture, scaffold, help, review accept, or push.

## 2026-10-23 establish-pr-outer-loop/1.4

Attempt: dc9bb2bf-b730-48ac-8ec8-c8a40fa080fa
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run dc9bb2bf-b730-48ac-8ec8-c8a40fa080fa --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 8f3dcb95be08903e7f614333bcb48aa65cdfe636).
Green: `node src/cli.mjs verify run dc9bb2bf-b730-48ac-8ec8-c8a40fa080fa --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 1dd0042354b45a21f14cb380489e2e49bb798a1c).
Scope: `pr capture` only — stores each forge comment id once (author, url, time, body). A stored comment does not authorize accept or complete; the human gate still requires a scoped approval. No scaffold, help, review accept, or push.

## 2026-10-23 establish-pr-outer-loop/2.1

Attempt: 0ca9be2d-9ad6-42de-991d-ca0e47ebe521
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run 0ca9be2d-9ad6-42de-991d-ca0e47ebe521 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision e0138fd71f5a19324e3e265a4dc001dafa107b2a).
Green: `node src/cli.mjs verify run 0ca9be2d-9ad6-42de-991d-ca0e47ebe521 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision dc0e4a898a7819255bb09e12859670956210066a).
Scope: `ci scaffold` only — writes `.github/workflows/factory-consumer.yml` when absent (Node 24, npm ci, npm test, npm audit --audit-level=high, npx openspec validate --all, contents read). Existing file is left unchanged and the command exits non-zero. init and upgrade do not copy it. This repo's ci.yml and release.yml are unchanged. No Semgrep, pull_request_target, forge admin API, help text, review accept, or push.

## 2026-10-23 establish-pr-outer-loop/2.2

Attempt: b04b6ee2-4f24-498e-beba-dcfa1473350e
Implementer: engineer-pr-loop
Red: `node src/cli.mjs verify run b04b6ee2-4f24-498e-beba-dcfa1473350e --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision b3d33070b4237c782fac71a80db28d26523576d6).
Green: `node src/cli.mjs verify run b04b6ee2-4f24-498e-beba-dcfa1473350e --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision b7e7936920b20b08bcd10e6af1ac4a7d16514995).
Scope: help text only — names `pr open`, `pr comment`, `pr capture`, and `ci scaffold`. No review accept or push.

## 2026-10-27 post-stored-review-comments/1.1

Attempt: 4bb283ff-4db5-4448-bda8-c7f86b09af8b
Implementer: engineer-review-comments
Red: `node src/cli.mjs verify run 4bb283ff-4db5-4448-bda8-c7f86b09af8b --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 4717ebf6965357af8df8e932167e311cd66de893).
Green: `node src/cli.mjs verify run 4bb283ff-4db5-4448-bda8-c7f86b09af8b --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision be4f244bf4ebe5fc9260b42dd09aee9e84bd1a2e).
Scope: accept and reject store `evidence.review.role` as `reviewer` and post one comment through the existing forge port when a pull request record exists. No security-reviewer store, dedupe, missing-record behavior, capture, scaffold, or push.

## 2026-10-27 post-stored-review-comments/1.2

Attempt: 9db45ef7-e006-458c-bd75-994b48509cb8
Implementer: engineer-review-comments
Red: `node src/cli.mjs verify run 9db45ef7-e006-458c-bd75-994b48509cb8 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 435ae88e0ad015ae0b5d5eb4689cdc4b0ad90cf6).
Green: `node src/cli.mjs verify run 9db45ef7-e006-458c-bd75-994b48509cb8 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision ecb659ba0b8e583d84721545f5ab1ae7cb27992b).
Scope: security-checking to awaiting-review stores a supplied verdict on evidence.securityReview with role security-reviewer and posts it once when a pull request record exists. A handoff with no verdict writes nothing and posts nothing. No dedupe, missing-record case, or push.

## 2026-10-27 post-stored-review-comments/1.3

Attempt: 5c15a23a-079b-495c-9efa-0b35050b1923
Implementer: engineer-review-comments
Red: `node src/cli.mjs verify run 5c15a23a-079b-495c-9efa-0b35050b1923 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 791fedcaf47d513c5cbd575ff668528dde901eea).
Green: `node src/cli.mjs verify run 5c15a23a-079b-495c-9efa-0b35050b1923 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 0b042b85d12b2aeb05704e9e7a55e3806d3d3d0b).
Scope: postVerdictComment skips a second post when postedVerdicts already has that attempt id and role. A missing pull request record still stores the verdict and does not call the forge. No push.

## 2026-10-27 produce-security-review-verdict/1.1

Attempt: d023b268-b03e-4d1c-8517-e10a5d70839c
Implementer: engineer-security-verdict
Red: `node src/cli.mjs verify run d023b268-b03e-4d1c-8517-e10a5d70839c --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 1b557805be1c86c3de6ab739c36f154c6c7cd3a2).
Green: `node src/cli.mjs verify run d023b268-b03e-4d1c-8517-e10a5d70839c --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 3aa15b32b6d1a0390cfe2ba353b33b9ba62fae0d).
Scope: security-stage work cannot leave security-checking for awaiting-review without verdict ACCEPT and a securityReviewerId distinct from the implementer. Existing security-evidence check stays first. Ad-hoc attempts with no work item stay optional. No reject transition, posted reviewer line, or push.

## 2026-10-27 produce-security-review-verdict/1.2

Attempt: a752125e-1a82-42fd-82b5-41e3193a4559
Implementer: engineer-security-verdict
Red: `node src/cli.mjs verify run a752125e-1a82-42fd-82b5-41e3193a4559 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 9f6527c07076d8a423517bd043857229866c3add).
Green: `node src/cli.mjs verify run a752125e-1a82-42fd-82b5-41e3193a4559 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 4499dcada153b417d7e854a5233247ce6ecc749e).
Scope: security-checking can go to rejected only for security-stage work, with verdict REJECT and a securityReviewerId distinct from the implementer. evidence.review is written only from awaiting-review. No posted reviewer line or push.

## 2026-10-27 produce-security-review-verdict/1.3

Attempt: b160dc32-e1cb-4933-bcfb-6332851200ca
Implementer: engineer-security-verdict
Red: `node src/cli.mjs verify run b160dc32-e1cb-4933-bcfb-6332851200ca --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 0abd2c9ab41ef13083edd9cc30c02918372cc091).
Green: `node src/cli.mjs verify run b160dc32-e1cb-4933-bcfb-6332851200ca --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 76c6acf96be999efa9471a7b7776ad1a53722f6b).
Scope: evidence.securityReview stores the supplied securityReviewerId, and the existing comment post names that reviewer. No new forge client or push.

## 2026-10-27 scaffold-consumer-ci-on-init/1.1

Attempt: 56e6e0d7-25cb-438f-a6a9-471fe8a5205b
Implementer: engineer-consumer-ci
Red: `node src/cli.mjs verify run 56e6e0d7-25cb-438f-a6a9-471fe8a5205b --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision b6b367ea56c1b9d4fb1372a5792c550886a4704b).
Green: `node src/cli.mjs verify run 56e6e0d7-25cb-438f-a6a9-471fe8a5205b --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision d582596c112ca65ab186cc84175703646adcce6c).
Scope: init writes the absent consumer workflow through writeConsumerWorkflowIfAbsent. ci scaffold still stops on HALT and still throws when the file exists. No Semgrep, consumer SAST, pull_request_target, or push.

## 2026-10-27 scaffold-consumer-ci-on-init/1.2

Attempt: 7328599f-2208-4fcf-8a20-99e7e40692e8
Implementer: engineer-consumer-ci
Red: `node src/cli.mjs verify run 7328599f-2208-4fcf-8a20-99e7e40692e8 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 0c56888c6c7771d8d7cbc0e8606ed87f64b44c1a).
Green: `node src/cli.mjs verify run 7328599f-2208-4fcf-8a20-99e7e40692e8 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 33d011d99137caf9ed57e15f1b064e26b045dcc1).
Scope: init's created list names `.github/workflows/factory-consumer.yml` only when that file is created, including a re-init that only creates the missing workflow. An existing file stays unnamed and unchanged. No Semgrep or consumer SAST.

## 2026-10-27 scaffold-consumer-ci-on-init/1.3

Attempt: 5539df8c-9932-45ec-9c23-c3526aee9fa0
Implementer: engineer-consumer-ci
Red: `node src/cli.mjs verify run 5539df8c-9932-45ec-9c23-c3526aee9fa0 --check unit --red` stored exitCode 1 / passed:false (issuer=cli, kind=unit, worktreeClean:true, sourceRevision 7e4cc505ef5f4e5515ff0125492b34e4d3a13491).
Green: `node src/cli.mjs verify run 5539df8c-9932-45ec-9c23-c3526aee9fa0 --check unit` stored exitCode 0 / passed:true (issuer=cli, kind=unit, worktreeClean:true, sourceRevision f36038850263ad33fd3431ec3069349714360389).
Scope: `ci scaffold <checkout>` writes the consumer workflow into that checkout when the working directory is different. `--path` still wins. No Semgrep, consumer SAST, or forge admin API.



## 2026-10-27 scaffold-consumer-ci-on-init/1.2

Attempt: 7328599f-2208-4fcf-8a20-99e7e40692e8
Implementer: engineer-consumer-ci
Test commit: 61e27f66e002a1f46321304fe5f0d305cf185496 adds init-on-custom-bytes, init with a root HALT file and an existing workflow, upgrade-does-not-create, and scaffold-refuses-overwrite. `node --test test/consumer-ci-scaffold.test.mjs` exited 0 (2 tests). `verify run --check unit --red` ran `npm test` at that commit and exited 0, so no evidence.red was stored. No production change. No Semgrep or consumer SAST. Not finalized.
