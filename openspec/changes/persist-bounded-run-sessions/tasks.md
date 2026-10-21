# Tasks

## 1. Session file

- [x] 1.1 Add failing tests that a schema version 1 session records run id, change, start time, budgets, agent-step count, completed-task count, failure count, last request fingerprint, and stop reason, and that an unsupported schema version or non-JSON body is rejected without a replacement file. Implement that validator and verify with `node --test test/run-session.test.mjs`.
- [x] 1.2 Add failing tests that the first `idefactory run` for a change writes `.factory/orchestration/runs/<run-id>.json`, and that a second process resumes the same run id and agent-step count. Implement resume and verify with `node --test test/run-session.test.mjs`.
- [x] 1.3 Add failing tests that a ledger `run-session-opened` id with no session file and no close line exits 1 with `invalid-session` and creates no zeroed file, and that a ledger agent-step count higher than the file exits 1 without printing a request. Implement that tripwire without making ledger appends blocking. Verify with `node --test test/run-session.test.mjs`.

## 2. Required budgets

- [x] 2.1 Add a failing cross-process test that `--max-agent-steps N` allows N processes to print one agent-step request each, and process N+1 exits 0 with persisted stop reason `max-agent-steps` and no orchestration request. Persist the incremented count before the request is printed. Keep the existing first-request test that passes `--max-tasks 1` expecting exit 2. Verify with `node --test test/run-session.test.mjs test/orchestration.test.mjs`.
- [x] 2.2 Add a failing test that finalizing the configured number of tasks makes the next run exit 0 with `max-tasks` and no request, and that work items already done at session creation do not count. Implement `baselineDoneIds` and verify with `node --test test/run-session.test.mjs`.
- [x] 2.3 Add failing tests that a session older than its wall-clock budget exits 0 with `wall-clock`, and that a clock earlier than `startedAt` exits 1 with `invalid-session`. Verify with `node --test test/run-session.test.mjs`.
- [x] 2.4 Add failing tests that a recorded red result does not increment the failure count and that timed-out verification results at the maximum exit 0 with `max-failures` and no request. Verify with `node --test test/run-session.test.mjs`.
- [x] 2.5 Add failing tests that a zero, negative, or non-integer required budget exits 1, writes no zeroed open session, and prints no request, and that a corrupt session file is left byte-for-byte unchanged. Verify with `node --test test/run-session.test.mjs`.

## 3. Stops that are not task counters

- [x] 3.1 Add failing tests that a second process seeing the same attempt, role, and work-item status exits 0 with `unchanged-state` and no request, and that `--new-run` after `max-agent-steps` opens a new run id at zero steps while the previous file remains. A resume flag higher than the stored budget must not raise it. Verify with `node --test test/run-session.test.mjs`.
- [x] 3.2 Add failing tests that a configured token ceiling at the host-exposed count exits 0 with `max-tokens`, a configured cost ceiling with no host cost exits 1 with `host-usage-unavailable`, and no ceiling stores neither a token nor a cost value. Verify with `node --test test/run-session.test.mjs`.
- [x] 3.3 Add failing tests that a complete request does not increment agent steps, and that `HALT` exits with an error, leaves session files unchanged, and prints no request. Verify with `node --test test/run-session.test.mjs`.
- [x] 3.4 Add a failing test that the security-reviewer route still exits 2 with one security-reviewer request when the session has remaining budget. Verify with `node --test test/orchestration.test.mjs`.

## 4. Defaults and skill re-entry

- [x] 4.1 Add the positive agent-step, task, wall-clock, and failure defaults to the config template. Extend install tests so a new init writes those positive values and a second init leaves an existing `config.json` byte-for-byte unchanged. Verify with `node --test test/install.test.mjs`.
- [ ] 4.2 Update the factory-run skill copies under `.cursor/skills`, `.github/skills`, `.agents/skills`, `.claude/skills`, and `templates/skills` so each names `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, and `unchanged-state` as stops and does not instruct the IDE to pass `--new-run`. Verify by reading those five files in `node --test test/run-session.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npx openspec validate persist-bounded-run-sessions --strict`, `npm test`, and `node src/cli.mjs doctor`. Record the commands and results in this change's implementation notes. Do not start a model, add a risk gate, make `complete` transactional, resolve lockout, or add CI or provenance.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request, on a factory run that keeps reviewer and implementer distinct.
- Archive only after that implementation is accepted and the human asks to archive.
