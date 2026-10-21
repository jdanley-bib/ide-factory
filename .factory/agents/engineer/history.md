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
