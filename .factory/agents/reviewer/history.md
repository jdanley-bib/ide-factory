# History

(none yet)

## 2026-10-21 enforce-verification-evidence/1.1

Attempt: b5589489-cdb4-422e-9e8b-d7a7c31d2f32
Reviewer: bc-95126116-33e0-559f-bba4-afc32961d522
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 6 pass.

## 2026-10-21 enforce-verification-evidence/1.2

Attempt: 26f6eab8-6ce2-47f6-baad-d2b23494c4da
Reviewer: bc-48306195-c681-53d1-bb90-74f316facc41
Verdict: ACCEPT
Re-ran `node --test test/install.test.mjs` exit 0, 10 pass.

## 2026-10-21 enforce-verification-evidence/2.1

Attempt: 89275f35-8d19-45fa-b922-448c8679960e
Reviewer: bc-11032359-83ed-5a05-8df9-de76d8c8c10e
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 11 pass.

## 2026-10-21 enforce-verification-evidence/2.2

Attempt: 157decc0-c73a-4736-961d-5691cfb2473f
Reviewer: bc-4f81c0ca-61e8-5c6a-bca4-f1751b8900cc
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 14 pass.

## 2026-10-21 enforce-verification-evidence/2.3

Attempt: cbf4d3cf-e258-4add-807c-d808e4aa6fe3
Reviewer: bc-9d5e57e0-bb71-5867-b282-e90176755ecf
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 17 pass.

## 2026-10-21 enforce-verification-evidence/2.4

Attempt: 7baf2e09-17b8-4525-b3bf-0bd480db79d3
Reviewer: bc-fa50139d-bda1-5ab0-9d60-12a69924b84d
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 18 pass. HALT file absent.

## 2026-10-21 enforce-verification-evidence/3.1

Attempt: 1222a024-5505-4908-aa20-6a5194266804
Reviewer: bc-227934b1-e5ac-5b9e-aefe-83ac22c0d2f7
Verdict: ACCEPT
Re-ran `node --test test/verification-evidence.test.mjs` exit 0, 27 pass.

## 2026-10-21 enforce-verification-evidence/4.1

Attempt: dad29b9c-88bc-4ad3-8ee9-c1b51e4fe665
Reviewer: bc-4c651fb3-c393-57f7-aabb-e46df3950c2a
Verdict: ACCEPT
Re-ran `node --test test/orchestration.test.mjs` exit 0, 9 pass.

## 2026-10-21 enforce-verification-evidence/4.2

Attempt: 1b6bdd69-d6b1-408e-aa05-c10d9ed94a7d
Reviewer: bc-e75cbc03-fdaf-5be3-a7eb-2c7c2693c339
Verdict: ACCEPT
Re-ran `node --test test/orchestration.test.mjs` exit 0, 16 pass.

## 2026-10-21 enforce-verification-evidence/4.3

Attempt: afb8638d-2e0c-4707-8f18-3209896f130a
Reviewer: bc-7e305b58-af31-51d3-84e9-a3946635754d
Verdict: ACCEPT
Re-ran `node --test test/orchestration.test.mjs` exit 0, 16 pass.

## 2026-10-21 enforce-verification-evidence/5.1

Attempt: 8152331d-3d0a-49ec-9726-4448883624c9
Reviewer: bc-3897f2e7-ff02-5b9e-9735-d9dced3845f6
Verdict: ACCEPT
Re-ran strict validate exit 0, doctor exit 0, npm test exit 0 (77 pass).

## 2026-10-21 persist-bounded-run-sessions/1.1

Attempt: 1dd1b142-2dc7-4317-a6f6-eea9e5019472
Reviewer: bc-08118c0e-bda9-592a-9c98-e05854379b0f
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 3 pass. CLI red present; unit pass at 0d986a7; validator/parser scope only.

## 2026-10-21 persist-bounded-run-sessions/1.2

Attempt: c25f30f4-06f7-4c2e-a65e-90261f9ca384
Reviewer: bc-8fee5780-6f98-59d5-beed-7f231e6437d5
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 5 pass. CLI red present; clean-head unit pass at c156c80; create/resume scope only.

## 2026-10-21 persist-bounded-run-sessions/1.3

Attempt: 11409764-fcdc-4ef3-ae0e-22916ac1ef69
Reviewer: bc-67734fc6-6f8d-5584-bd6b-c5c22e08b94e
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 7 pass. CLI red present; clean-head unit pass at 219d57e; unmatched-open and high-water fail closed; best-effort ledger remains.

## 2026-10-21 persist-bounded-run-sessions/2.1

Attempt: 7b2f2844-928e-4eb7-8461-674bc47ed750
Reviewer: bc-573b4a1c-04a3-5fb7-acfa-9b11d80786b9
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs test/orchestration.test.mjs` exit 0, 24 pass. CLI red present; clean-head unit pass at 760a29a; N then N+1 max-agent-steps; persist-before-emit; `--max-tasks 1` first request exit 2.

## 2026-10-21 persist-bounded-run-sessions/2.2

Attempt: c7fa68b1-97c2-49f7-8fab-9b7dbd1a3c7e
Reviewer: bc-dc822b6e-2be9-5e5b-9cab-b51e43611b85
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 9 pass. CLI red present (exit 1, baselineDoneIds mismatch); clean-head unit pass at ba2aa77; baselineDoneIds at create excludes pre-done work; one in-session finalize then cap exits 0 with `max-tasks` and no request.

## 2026-10-21 persist-bounded-run-sessions/2.3

Attempt: 143ad813-9542-4662-acfd-844349500751
Reviewer: bc-0c0d3d98-fab4-5b94-ae4c-443263567189
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 11 pass. Simulated red: parent orchestrate + new tests → 2 fail. Clean-head unit pass at 5186a5b; expired wall-clock exits 0 with no request; clock regression exits 1 `invalid-session` with no request; checks before syncTasks/agent-step path.

## 2026-10-21 persist-bounded-run-sessions/2.4

Attempt: 7b08cfdc-a44c-45d0-bdc0-546cbd4cb87a
Reviewer: bc-69422a87-2e2a-57e0-ab15-b4ab19eea163
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 13 pass. Simulated red: parent run-session/orchestrate + new tests → 1 fail (max-failures got exit 2). CLI red present; clean-head unit pass at 5604e17; red evidence excluded from failure count; timed-out verification at cap exits 0 with `max-failures` and no request; distinct record ids via `countedFailureIds`.

## 2026-10-21 persist-bounded-run-sessions/2.5

Attempt: 7e1f372e-1f51-456d-a365-68946f0be648
Reviewer: bc-0373c28a-15e3-5030-bfba-132a9a544054
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 18 pass. Simulated red: parent orchestrate/run-session at ef3370 + new tests → 3 fail (invalid budgets exit 2 with session/request; bare flag; config defaultMaxFailures 0). CLI red present; clean-head unit pass at ec98e49; invalid-budget exit 1 before openOrResumeRunSession; corrupt/missing-counter bytes unchanged no request.

## 2026-10-21 persist-bounded-run-sessions/3.1

Attempt: 1fe9b9fc-4fa7-4721-8bed-1b85f057acd4
Reviewer: bc-fb94fb40-9294-527a-9f85-698cd39d71f3
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 23 pass. Simulated red: parent orchestrate/run-session/run at 24ec84e + new tests → 4 fail (unchanged-state ×2, sticky bytes, --new-run). CLI red present (exitCode 1, issuer cli, baseRev 24ec84e); clean-head unit pass at 569f647; fingerprint unchanged-state exit 0 no request no increment; sticky closed session no rewrite; --new-run keeps prior file; mergeResumeBudgets never raises stored cap.

## 2026-10-21 persist-bounded-run-sessions/3.2

Attempt: 30e9c0f2-5077-43b7-9143-ac9eff1d5874
Reviewer: bc-e1cbb0b3-2125-5399-b7e0-62f4a787ba3d
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 28 pass. Simulated red: parent orchestrate/run-session/run at cbf3222 + new tests → 4 fail (max-tokens at ceiling; host-usage-unavailable; config+env ceiling; invalid token/host ceilings). CLI red at cbf3222; unit pass at f71627f; host metrics CLI/env only; max-tokens exit 0 no request; cost ceiling without metric exit 1; no ceiling omits token/cost fields; invalid-budget fail closed.

## 2026-10-21 persist-bounded-run-sessions/3.3

Attempt: d21c6018-7133-4b58-a5f2-3a53c613c50d
Reviewer: bc-0c9f7c86-1b05-5274-9c9f-6ec42c3bf798
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 32 pass. Simulated red: parent orchestrate at d3ad0df + new tests → 2 fail (complete fingerprint; repeat complete unchanged-state); HALT tests green at parent. CLI red at d3ad0df; unit pass at 2cb14ee; complete via persistCompleteBeforeRequest no agentSteps; fingerprint unchanged-state exit 0 no request; HALT exit 1 before session write, bytes unchanged.

## 2026-10-21 persist-bounded-run-sessions/3.4

Attempt: c923e6ab-933a-44a2-a41e-4969af7b9380
Reviewer: bc-f8a841fa-5c4d-57de-94a6-bad73914b7ef
Verdict: ACCEPT
Transition: security-checking → awaiting-review → accepted (post security-reviewer bc-96987f34-07ea-5d89-8044-753b42bcde59).
Re-ran `node --test test/orchestration.test.mjs test/run-session.test.mjs` exit 0, 49 pass; `npm test` exit 0, 110 pass. CLI red at 5e02d383 (exitCode 1, issuer cli, passed:false); unit pass at 039d456 worktreeClean. Simulated red: re-applied 358012f auto-reopen of sticky unchanged-state → orchestration suite 1 fail (`security-reviewer route in fresh session…`, exit 0 unchanged-state instead of exit 2). Product net: test-only at HEAD; sticky unchanged-state preserved; `--new-run` yields one security-reviewer request at exit 2 with budget remaining. evidence.security empty; no new enforcement/tooling.

## 2026-10-21 persist-bounded-run-sessions/4.1

Attempt: e63c39e8-9c29-419e-af8e-769c141de8d5
Reviewer: bc-9b0951c5-ad67-55a5-a0e2-573a102cb4fb
Verdict: ACCEPT
Product: 2c5b4fb (template four positive run defaults; install tests). Re-ran `node --test test/install.test.mjs` 12/12 pass. CLI red ac2b105 passed:false worktreeClean:false; simulated red ac2b105+tests only 1 fail; unit verify 2c5b4fb passed:true. Repo `.factory/config.json` unchanged. Transitions verifying → awaiting-review → accepted.

## 2026-10-21 persist-bounded-run-sessions/4.2

Attempt: 98c38e90-8523-4cfa-a251-fe216a73532e
Reviewer: bc-e1e6f7ab-79fb-50dc-9494-f0c2f28f5c69
Verdict: ACCEPT
Product: 006525d (five factory-run SKILL copies + run-session test asserting stops and loop resume). Inspected skill Loop uses `idefactory run --change <name> --until human-gate` without `--new-run`; Stop conditions list all five bounded stops; New session (human only) documents `--new-run` for sticky resets. Re-ran focused `node --test test/run-session.test.mjs` (33 pass, including shipped factory-run skill copies test). CLI red 045b1db exitCode 1 passed:false issuer cli; unit pass 006525d worktreeClean passed:true (reviewer re-verify logDigest sha256:949f7a9c…). Transitions verifying → awaiting-review → accepted.

## 2026-10-21 persist-bounded-run-sessions/failure-baseline (--new-run)

Implementer: bc-9b81fa19-3ec7-5143-a288-69feae5e339d
Reviewer: bc-cf816a83-3aff-566e-95fa-1dd20746067d
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 34 pass. New test baselines historical failures on `--new-run`; production limited to `baselineFailureIds` in validate/create/refreshFailures; red exclusion unchanged (`validSession` without field still validates).

## 2026-10-21 persist-bounded-run-sessions/5.1

Attempt: 6cedaaba-b3b2-4540-a2b2-b5a8eda64ff6
Reviewer: bc-5cd232d8-f88d-56c4-8f27-b001704b23f4
Verdict: ACCEPT
Re-ran `node --test test/run-session.test.mjs` exit 0, 35 pass. Implementation notes record strict validate, npm test, and doctor (all exit 0); new test asserts those commands. CLI red present (issuer cli, kind unit, exitCode 1, passed false). No risk gate, security-stage, transactional complete, lockout, CI, provenance, or archive. Did not run `verify run`. Transitions verifying → awaiting-review → accepted.

## 2026-10-21 enforce-risk-gates-and-security-stage/1.1

Attempt: e55c9c0c-2ab7-4af7-9a4b-a0a6746f176d
Reviewer: bc-e391f52a-dc68-5ad2-b902-5ad00b473b1d
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 5 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 5be8842); clean-head unit pass at 6bef0ac. Scoped-approval validator covers required fields, bad action, >24h expiry, self-approver; reject paths write no file. Transitions verifying → awaiting-review → accepted.

## 2026-10-21 enforce-risk-gates-and-security-stage/1.2

Attempt: 1185d1bd-ff1f-437d-a8af-065599d8d07a
Reviewer: bc-92fb38bc-096b-521f-846d-6bb64f062043
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 8 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 9c2d8fb); clean-head unit pass at bd25891. Approve with full scope writes JSON+decisions; omitted scope and dirty non-run-state append nothing and write no token. Transitions verifying → awaiting-review → accepted.

## 2026-10-21 enforce-risk-gates-and-security-stage/2.1

Attempt: d989d087-25f9-408b-a6d1-0f593b01c5db
Reviewer: bc-dcc4fc52-3281-5295-bd50-06c453ab8ff2
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 12 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 3ec862d); clean-head unit pass at c91f23e. humanGate true / missing profile / non-boolean fail closed for run (human-gate, no request, session open) and complete (nonzero, item undone). Transitions verifying → awaiting-review → accepted.

## 2026-10-21 enforce-risk-gates-and-security-stage/2.2

Attempt: 049a0a00-f6c2-4187-ab0f-7baadd95180a
Reviewer: bc-d3d1fb33-7d1a-5a9c-89fc-d05e73638a33
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 16 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 900fb7b); clean-head unit pass at 356d7ad. Matching accept/complete authorize; wrong action/task/stale rev/expired/policy mismatch fail closed; humanGate false non-sensitive reaches review. Transitions security-checking → awaiting-review → accepted (post security-reviewer bc-aaea9636-54a3-5ec4-a6a4-e09c9e9ccd73).

## 2026-10-21 enforce-risk-gates-and-security-stage/3.1

Attempt: 934b44b7-55ff-47e4-8ddf-9313707ab641
Reviewer: bc-3546052c-8d33-5088-89c7-271d503b325d
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs test/orchestration.test.mjs` exit 0, 38 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 2a572f3); clean-head unit pass at afa2b0a worktreeClean. Bypass verifying→awaiting-review rejected for security-sensitive; verificationProfile alone legal; next run still names security-reviewer. Transitions security-checking → awaiting-review → accepted (post security-reviewer bc-f9ea047e-5815-5278-b118-08acdd05d9ab).

## 2026-10-21 enforce-risk-gates-and-security-stage/3.2

Attempt: 30dbe229-266c-4a72-922e-ceebdc47f490
Reviewer: bc-65702123-0d1f-58e5-9c5a-31f004a05778
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 25 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at ee59717); clean-head unit pass at 6f7ee25 worktreeClean. Product 6f7ee25: security-checking→awaiting-review requires passing CLI security record bound to attempt/clean HEAD; default kind threat-review; red and caller-supplied security payloads rejected; verify stores security-patterned kinds in evidence.security; complete fail-closed without that evidence; shipped checks.json unit-only (no scanner argv). Bootstrap dependency-basic leaves this attempt unforced through live threat-review. Transitions verifying → awaiting-review → accepted (post security-reviewer bc-04f1ac01-db6f-5b20-bb30-7d820a48f997).

## 2026-10-21 enforce-risk-gates-and-security-stage/4.1

Attempt: 18d745da-e9df-445c-a5a5-9ab639d96f4b
Reviewer: bc-7ad72710-1c5b-5463-9806-51d6596afed3
Verdict: ACCEPT
Re-ran `node --test test/install.test.mjs` exit 0, 14 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at a2f9a37); clean-head unit pass at c72a5cc worktreeClean. Product c72a5cc: template `security-sensitive.humanGate` true, `release.humanGate` remains true; new init writes both; re-init leaves existing profiles.json byte-for-byte unchanged via writeIfMissing. Repo `.factory/profiles.json` untouched (`security-sensitive.humanGate` still false). Transitions verifying → awaiting-review → accepted (post security-reviewer bc-daa18683-6b21-5890-a651-4ed360ffc333). No verify/complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/4.2

Attempt: f6d2af51-ad7a-435f-9c0e-16e92bcc9924
Reviewer: bc-f129bc18-3c3e-5980-a466-45f6084e62da
Verdict: ACCEPT
Re-ran `node --test test/risk-gates.test.mjs` exit 0, 26 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 5e61bd3); clean-head unit pass at 6ce9d47 worktreeClean. Product 6ce9d47: five factory-run skill copies describe human-gate as true profile `humanGate` (not release alone); Loop uses `--until human-gate` and does not pass `--new-run` (`--new-run` only under New session). Risk-gates skill-copy unit test locks wording. Transitions verifying → awaiting-review → accepted (post security-reviewer bc-48e201b4-4a68-5185-9464-4dd05771a55b). No verify/complete.

## 2026-10-21 enforce-risk-gates-and-security-stage/5.1

Attempt: c55fda80-405c-41b0-ae1c-743da4435908
Reviewer: bc-2bcc3a49-cb7c-5f23-af68-6496693c6c78
Verdict: ACCEPT
Re-ran `npx openspec validate enforce-risk-gates-and-security-stage --strict` exit 0; `node --test test/risk-gates.test.mjs` exit 0, 27 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 423fd37); clean-head unit pass at 11ccb4b worktreeClean. Product 11ccb4b: implementation notes record strict validate, npm test (146 pass), and doctor ok; focused test locks those three command strings. Scope exclusions held (no model start, transactional complete, lockout, lease, CI, provenance, observability). Transitions verifying → awaiting-review → accepted (post security-reviewer bc-4bc55479-78ad-5095-900b-66e5a3a91307). No verify/complete.

## 2026-10-21 make-finalization-recoverable/1.1

Attempt: 25abe23f-bfaf-4489-b0cc-8e014bacc45f
Reviewer: bc-4a1d77ce-079f-5d0d-bfbb-5d9093f539fa
Verdict: ACCEPT
Re-ran `node --test test/finalization-recovery.test.mjs` exit 0, 8 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at f244b4a); clean-head unit pass at ded99f7 worktreeClean. Product ded99f7: schema v1 journal validation + atomic create; allowlisted ordered targets; corrupt/unsupported/path/identity/revision/planDigest fail closed without marking done. Scope exclusions held (no replay, fault injection, lockout, lease, complete wiring). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/1.2

Attempt: 46a2aac4-ca25-4b93-a9db-ee047d77be5c
Reviewer: bc-dba650a2-57bd-5c76-92cf-caf951a80b4d
Verdict: ACCEPT
Re-ran `node --test test/finalization-recovery.test.mjs` exit 0, 10 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 16bb79d worktreeClean:false); clean-head unit pass at cdb73d2 worktreeClean. Product cdb73d2: `buildFinalizationPlan` for checkbox, scribe marker, identity, finalized attempt, intended index, ready journal, and atomic work-item `done` as final correctness-critical write; frozen completionDate/finalizedAt across retries; plan does not apply writes. Scope exclusions held (no replay, fault injection, lockout, lease, complete wiring). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/2.1

Attempt: 3a56eca2-2a84-440c-b064-87222e4e7a3c
Reviewer: bc-c64a39ea-058f-5d73-a422-dd5aa28ee7f4
Verdict: ACCEPT
Re-ran `node --test test/finalization-recovery.test.mjs` exit 0, 17 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 1b1f1eb worktreeClean:false); clean-head unit pass at 20f3c9b worktreeClean. Product 20f3c9b: compare-and-apply skip after-digest / apply before-digest / conflict otherwise; `recoverFinalization` resumes finalized+unfinished journal and repeats already-committed without duplicating checkbox/scribe/attempt history; conflict keeps item not done. Scope exclusions held (no fault injection, lockout, lease, complete wiring). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/2.2

Attempt: 53b91f30-220d-425e-8f86-e9b3dbbc18ab
Reviewer: bc-26a59cbe-977d-5fb0-a5f0-7a5631691d2d
Verdict: ACCEPT
Re-ran `node --test test/finalization-recovery.test.mjs test/orchestration.test.mjs` exit 0, 40 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 062e22a worktreeClean:false); clean-head unit pass at 0f21406 worktreeClean. Product 0f21406: library-only `faultHook` / `finalizationFaultBoundaries` cover journal create, all six pre-commit targets (incl. ready-journal), and before-commit; every injected fault leaves item not done and uninjected retry reaches one byte-consistent final state; orchestrator emits `needs-complete` for finalized+matching unfinished journal. Scope exclusions held (no lockout, lease, complete wiring). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/3.1

Attempt: 7fb6a76f-7c65-4252-aa20-95c69f0257be
Reviewer: bc-7a38b257-e8b5-59fe-80a1-9204356fb466
Verdict: ACCEPT
Re-ran `node --test test/govern.test.mjs test/finalization-recovery.test.mjs` exit 0, 27 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 98974d1 worktreeClean:false); clean-head unit pass at 27ad7e4 worktreeClean. Product 27ad7e4: schema v1 created.json under printed lockout id (wx exclusive); resolve requires distinct resolver+reason and writes one immutable resolved.json; blocks/unblocks complete; exact repeat idempotent and conflicting inputs fail closed; legacy `*lockout*.md` resolve by exact basename+digest without rename/delete; five identical factory-governance skill copies document create/resolve. Scope exclusions held (no lease). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/4.1

Attempt: 42a06afe-b7f8-44c0-ab0d-94b797b650ce
Reviewer: bc-6ddddde1-6bba-519d-8f14-b17c525be39f
Verdict: ACCEPT
Re-ran `node --test test/writer-lease.test.mjs` exit 0, 7 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 087b4de worktreeClean:false); clean-head unit pass at 33e2181 worktreeClean. Product 33e2181: schema v1 `owner.json` via exclusive mkdir acquire; live owner yields `LEASE_HELD` without contender mutation; success and handled-error release only matching lease id; read-only wrapper neither acquires nor removes. Scope exclusions held (no heartbeat, stale takeover, corrupt refusal, HALT bypass, CLI dispatch). Prior distinct security ACCEPT by bc-dbd9d8e9 (decision make-finalization-recoverable-4.1-unit-check). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/4.2

Attempt: 29c52e9a-6ec4-4fdd-a733-7b7248bce462
Reviewer: bc-457fb09b-e368-5c7d-80dd-e88d9146c8bb
Verdict: ACCEPT
Re-ran `node --test test/writer-lease.test.mjs test/orchestration.test.mjs test/govern.test.mjs` exit 0, 41 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at dcf3336 worktreeClean:false; engineer notes 6 failing heartbeat/takeover/owner-loss/corrupt/CLI/release cases); clean unit at 98e443b≡97eb307 worktreeClean plus rebind verify at 4bc2628. Product 97eb307: one-minute fake-clock heartbeat, five-minute expiry, one-winner stale-directory rename takeover, OWNERSHIP_LOST on successor mismatch, LEASE_RECOVERY corrupt/unsupported without delete, HALT bypass, top-level `run.mjs` wrap of all named mutations with no nested acquire, read-only unleased, rename release TOCTOU fix vs successor. Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/5.1

Attempt: 9247289a-042d-4ef4-8e9c-1f98d80ee70f
Reviewer: bc-98a08a6b-7aeb-541d-8777-c11db7f00b38
Implementer: bc-c064be93-5bd6-54d5-aebc-9344f8749e47
Verdict: ACCEPT
Re-ran `npx openspec validate make-finalization-recoverable --strict` exit 0; `node --test test/finalization-recovery.test.mjs` exit 0, 21 pass; `node src/cli.mjs doctor` exit 0. Confirmed notes honesty: npm test 187/187 (re-run exit 0 after one intermittent writer-lease stale-takeover flake unrelated to 5.1). CLI red present (issuer cli, kind unit, exitCode 1, passed false at 912bb226 worktreeClean:false; simulated missing notes → 20 pass / 1 fail); clean-head unit pass at 60e4ba8 worktreeClean. Product 60e4ba8: implementation-notes + notes assertion test + engineer history only. Scope exclusions held (no model start, CI/provenance, observability, gate/evidence policy, archive, checkbox, complete, push). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-21 make-finalization-recoverable/4.2 follow-up (publication race)

Product: 423c525d4038efbd2b4cc641635e4134c8f3ae41
Implementer: bc-4b9faad8-5f00-549e-adc3-cfb57b7969bf
Reviewer: bc-f4310a0a-b92e-5893-9847-bf7b84186766
Verdict: ACCEPT
Inspected staging-directory rename publication (`tryPublishNewLease`), vanished-dir → `LEASE_HELD` without weakening corrupt/unsupported `LEASE_RECOVERY`, winner tombstone cleanup, and one-winner stale rename. Deterministic tests cover owner-publication gap (mkdir probe) and mid-read directory loss. Re-ran `node --test test/writer-lease.test.mjs` exit 0, 16 pass; stress 50× exit 0; `node --test test/writer-lease.test.mjs test/orchestration.test.mjs test/govern.test.mjs` exit 0, 43 pass. No attempt mutation, complete, or push.

## 2026-10-21 make-finalization-recoverable complete→journaled integration follow-up

Product: c13f7dbc5e2ca4811f1961e31ac838af019bb441
Implementer: bc-ce055288-021d-5690-a0f0-6825d222923c
Reviewer: bc-c07cd477-9db7-5c65-bd8a-1832bee9833b
Verdict: ACCEPT
Inspected end-to-end: journal before target writes; schema v1 + planDigest include durable `commit`/`finalizedAt`; process-restart `recoverFinalization` applies frozen commit bytes without in-memory plan; accepted/finalize-failed/finalized+journal retries; dirty worktree only with matching source-bound journal; work-item `done` last atomic correctness write; ledger post-commit only; byte-stable repeat; library-only `faultHook` (no CLI/env fault control); HALT/lockout/humanGate/reviewer-differ/check+security evidence preserved. Three design tensions are necessary for crash-true recovery — recommend narrow artifact clarification (persist commit on journal; finalize-failed only pre-journal; dirty resume with matching journal HEAD), not product rollback. Re-ran `node --test test/finalization-recovery.test.mjs test/orchestration.test.mjs` exit 0, 44 pass; `npm test` exit 0, 192 pass. No attempt mutation, complete, push, archive, or branch change.

## 2026-10-22 establish-factory-ci-and-provenance/1.1

Attempt: b494d2f8-f24e-49c5-81de-125461fbccd4
Reviewer: bc-c93441f3-240b-5937-878d-0d671bf55e48
Implementer: bc-a02322a9-e6eb-588f-bb2f-47944a1a24f6
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 1 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at c2d6222 worktreeClean:false; engineer notes missing `.github/workflows/ci.yml`); clean-head unit pass at 7ce63ec worktreeClean. Product 7ce63ec: `.github/workflows/ci.yml` job `baseline` on pull_request/push, Node 22, four fail-closed commands (`npm ci`, `npm test`, `npm audit --audit-level=high`, `npx openspec validate --all`) with no continue-on-error on those steps; focused test locks that behavior. Scope exclusions held (SHA pins/contents:read/pull_request_target are 1.2; no scanners, release, branch controls, complete, or push). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/1.2

Attempt: dd43c46e-b924-454b-8e90-7311a3646ec3
Reviewer: bc-d083ee18-0f90-5d61-818d-3dc36ffe9faa
Implementer: bc-33d9fdda-7d9d-5e59-b875-2d211ac741eb
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 2 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 64ae490 worktreeClean:false); clean-head unit pass at cfbe42b worktreeClean. Product cfbe42b: `permissions.contents: read`; `actions/checkout@11d5960a326750d5838078e36cf38b85af677262` # v4.4.0 and `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` # v4.4.0 match official `commits/v4` and `refs/tags/v4.4.0`; no `pull_request_target` or `continue-on-error`. Scope exclusions held (no scanners, release, branch controls, complete, or push). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/2.1

Attempt: e44e3bae-3ba6-4d98-a64f-7471ce36f9be
Reviewer: bc-7449c915-1397-5e10-94d0-439d8cfe4fe4
Implementer: bc-b658b85d-4eed-58e3-a1f3-bba903e07794
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 3 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false at 820df42 worktreeClean:false; engineer notes missing `secret-scan` job); clean-head unit pass at b2dbe02 worktreeClean. Product b2dbe02: exact `secretlint@13.0.7` + `@secretlint/secretlint-rule-preset-recommend@13.0.7` (dev only); `.secretlintrc.json` recommend preset; shared `npx secretlint "**/*"` in CI `secret-scan` and focused test (no `continue-on-error`); CLI `maskSecrets` default (no `--no-maskSecrets`); seeded Slack-shaped fixture assembled from base64 at runtime (contiguous value absent from tree). Scope exclusions held (no Semgrep/2.2, release, branch controls, checks.json scanner argv, complete, or push). Prior distinct security ACCEPT by bc-303a83a1 (decision establish-factory-ci-and-provenance-2.1-unit-check; evidence.security empty). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/2.2

Attempt: d1db173b-f29e-407b-ab70-9674892ba8ce
Reviewer: bc-09ffd1d2-7fa7-5237-b026-c3f055ecac74
Implementer: bc-4ba8835d-2693-569c-a077-834313f33abd
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 4 pass; `npm test` exit 0, 196 pass (no `semgrep` on PATH). CLI red present (issuer cli, kind unit, exitCode 1, passed false, worktreeClean false at 93ad67f); clean-head unit pass at 63ede06 worktreeClean true (matches HEAD). Product 63ede06: `scripts/run-semgrep.mjs` probes PATH then invokes `semgrep` with `--error`, `--metrics=off`, `--config p/javascript`; absent binary exit 1 with no pip/npm/curl download path; `--skip-semgrep` warns and prints `SEMGREP_SKIP`. CI `sast` runs `node scripts/run-semgrep.mjs` only (no installer, no `--skip-semgrep`, no `continue-on-error`); baseline job omits skip flag. Focused test uses PATH trap stubs and shell `semgrep` stub; no Semgrep in `package.json`. Prior distinct security ACCEPT by bc-38c29cb3 (evidence.security empty). Transitions verifying → awaiting-review → accepted. No verify/complete/push/lockout.

## 2026-10-22 establish-factory-ci-and-provenance/3.1

Attempt: ad20dce0-6681-4507-a396-26b6a50c2b9b
Reviewer: bc-700a93d1-c1ed-57e1-b6cb-b8307fce700d
Implementer: bc-cb82001b-f989-548b-b689-88467eccb27c
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 5 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false, worktreeClean false at dff5fdd); clean-head unit pass at 81a0e27 worktreeClean true. Product 81a0e27: `.github/workflows/release.yml` tag-only `v[0-9]+.[0-9]+.[0-9]+`, `permissions.contents: read` (no `id-token: write`), full-SHA pins on checkout/setup-node/upload-artifact; `npm ci` then pinned `npx @cyclonedx/cyclonedx-npm@6.0.1 --package-lock-only` + `scripts/annotate-release-sbom.mjs` (`lockfile-sha256`, `source-revision`); SBOM pipeline lists all locked deps including `@fission-ai/openspec@1.14.3`; no npm publish. Prior distinct security ACCEPT by bc-199f75bf-8bca-51ee-983a-9c968b384c33 (decision establish-factory-ci-and-provenance-3.1-unit-check; evidence.security empty). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/3.2

Attempt: 82557439-e1d2-4207-b490-1460c136a444
Reviewer: bc-0a51a7d1-c8e3-54f7-8015-709e44997fc7
Implementer: bc-b6db62db-72eb-5062-a9c4-75690e46a863
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 6 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false, worktreeClean false at d727050); clean-head unit pass at 2428745 worktreeClean true. Product 4c43e39: `.github/workflows/release.yml` `permissions` `contents: read`, `id-token: write`, `attestations: write`; `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8` with `subject-path: release/sbom.cdx.json` after SBOM annotation step; no SLSA Build L2/L3 or buildLevel 2/3 claims in workflow. Prior distinct security ACCEPT by bc-191b8d74-d7f2-5c65-813e-42101f6ee2fa (evidence.security empty). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/4.1

Attempt: c6790978-0806-44b4-b659-eac3c9ccba3d
Reviewer: bc-fb807635-a425-547a-9e5f-14f743aa9b97
Implementer: bc-48a1b099-8bf4-58c4-82d7-6d9ba303bd5d
Verdict: ACCEPT
Re-ran `node --test test/ci-provenance.test.mjs` exit 0, 7 pass. CLI red present (issuer cli, kind unit, exitCode 1, passed false, worktreeClean false at 0964f970); clean-head unit pass at d876172 worktreeClean true. Product d876172: `.github/branch-review-controls.json` schemaVersion 1 with `requiredStatusCheckName` baseline, `requiredApprovingReviewCount` 1, `allowForcePushes` false, `protectedBranch` main, `enforcedByForge` false; `.github/CODEOWNERS` `* @jdanley-bib`; focused test scans `.github`, `scripts`, and `src` for forbidden forge admin API patterns. Scope exclusions held (no live ruleset enablement, npm publish, observability, complete, or push). Prior distinct security ACCEPT by bc-fef7462a-ddc4-5601-8819-20fc9071bb76 (evidence.security empty). Transitions verifying → awaiting-review → accepted. No verify/complete/push.

## 2026-10-22 establish-factory-ci-and-provenance/5.1

Attempt: f615a850-ec61-4c7a-8793-b80f4820f46a
Reviewer: bc-81e77c7c-7533-53be-a679-db93fdbc8927
Implementer: bc-533c85e2-3880-5491-b79f-a2eae6b1bd36
Verdict: ACCEPT
Re-ran `node --test --test-name-pattern 'implementation notes record' test/ci-provenance.test.mjs` exit 0, 1 pass (full file run once hit transient `npm audit --audit-level=high` exit 1 during honesty re-run; spot-check `npm audit --audit-level=high` exit 0 matches notes). CLI red present (issuer cli, kind unit, exitCode 1, passed false, worktreeClean false at 3fc4835); clean-head unit pass at 9ca04f6 worktreeClean true. Product 9ca04f6/a471cd3: `implementation-notes.md` records seven integration commands (strict validate, validate --all, npm test ×2, npm ci, audit, validate --all) with exit 0 summaries; `ci-provenance.test.mjs` honesty section locks order and re-run exits. Scope exclusions held (verification-only task 5.1; no factory gate or evidence policy change, forge admin API, observability, model start, or archive). Decision establish-factory-ci-and-provenance-5.1-unit-check (unit-only completion; extra commands in notes only). evidence.security empty. Transitions verifying → awaiting-review → accepted. No verify/complete/push.
