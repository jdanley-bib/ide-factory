# Tasks

Start only after PR #26 (or its successor) has landed. First re-read the merged `src/lib/mcp-plan.mjs`, the board and forge plan builders, and the `factory-cloud` skill, and adjust names below to match.

## 1. Operation facts

- [x] 1.1 Add the `repeat` and `verify` fields to every operation the board and forge plan builders produce, using a table by tool and action, and include them in the plan digest; verify with `test/mcp-plan.test.mjs`, `test/board-mcp.test.mjs`, and `test/forge-mcp.test.mjs` updated to assert creates, comment additions, and links are `check-first` with a `verify` read, updates and revision-tested state updates are `safe`, and the plan id changes when a fact changes.
- [x] 1.2 Treat a stored plan with no `repeat` or `verify` as `check-first` with no `verify`; verify with a test that loads such a plan and shows a retry decision refused until the agent escalates.

## 2. Record

- [x] 2.1 Add `idefactory mcp record <planId> --operation --outcome [--cause] --decision [--readback] [--note]` appending to `.factory/mcp/<planId>.progress.jsonl` after the same integrity check as ack; verify with tests for a stored record, an unknown code writing nothing, a modified plan being refused, and the plan file staying byte-identical.
- [x] 2.2 Enforce the check-first rule (retry only with read-back `absent`, `skip-applied` only with `present`, `escalate` only with `unavailable`) and name the `verify` read in the refusal; verify with a test for each combination on a `check-first` operation and on a `safe` operation, where read-back is not required.
- [x] 2.3 Enforce the retry cap from `mcp.maxOperationAttempts` (default 3, range 1 to 10) counted from the progress file; verify with tests for the fourth retry being refused, an out-of-range config falling back to 3, and a configured cap of 5.
- [x] 2.4 Report a refused retry past the cap as a blocked state with `operation-retry-cap` through the blocked-state builder when present, and as a plain error otherwise; verify both paths.

## 3. Ack and pending

- [x] 3.1 Make `ackPlan` refuse when any operation's latest record is `failed` or `unknown`, changing nothing, and keep the old behavior when no progress file exists; verify with the existing ack tests passing unchanged and new tests for refusal, for a `skip-applied` resolution, and for the plan file remaining after a refusal.
- [x] 3.2 Keep the codes from the progress file after ack (copy them into the ack event or move the file) and delete the pending copy; verify with a test that the trail is readable after ack and the plan is gone.
- [x] 3.3 Show the latest outcome and retry count per operation in `mcp pending` text and `--json`; verify with a test for a plan with one recorded retry.

## 4. Events and measurement

- [x] 4.1 Append an `mcp-decision` event with plan id, operation, outcome, cause, decision, and read-back, adding only those fields to the allowlist in `src/lib/event-log.mjs`; verify with `test/event-log.test.mjs` passing and a test that a note and an error string never appear in the event.
- [x] 4.2 Make a `conflict` cause with an `abandon` decision a handled stop, and count a `retry` followed by `mcp-ack` for the same plan as an autonomous recovery in the autonomy report when that command exists; verify with tests for both, skipped with a named reason when `measure-autonomy` has not landed.

## 5. Skill and help

- [x] 5.1 Rewrite the failure section of `templates/skills/factory-cloud/SKILL.md` into the evaluation protocol: read the failure, decide whether the effect may have landed, run the plan operation's `verify` read when it might have, then choose among retry, retry after read-back, replan, skip applied, abandon, or escalate, recording each with `mcp record`; keep the plan-integrity and allowlist rules; state that reads, pushes, and other commands follow the same judgment under the run budgets; verify with `test/cloud-skill.test.mjs` updated so it no longer requires "stop" on a failed operation and requires the protocol, the codes, and the budgets.
- [x] 5.2 State in the skill that escalation is followed by `idefactory board report`, and update `tools/ado-bridge/README.md` where it describes the failure rule; verify by reading both against the `Escalation leaves a durable status` requirement.
- [x] 5.3 Add help for `mcp record` and update `mcp ack` and `mcp pending` help without changing the global usage text; copy the skill to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/command-help.test.mjs test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs`.

## 6. Integration

- [x] 6.1 Add an end-to-end test with a stubbed MCP caller: a claim whose first operation returns a conflict is abandoned with no intervention; a comment plan whose second operation fails transiently is retried after a read-back `absent` and then acked; a create whose read-back is `present` is recorded `skip-applied` and acked without a second create; a plan whose operation exceeds the cap stops with `operation-retry-cap`; verify each assertion, and the stub's call counts show no duplicate create.
- [x] 6.2 Run `npm test` and `npx openspec validate agent-judged-operation-retries --strict`; verify both exit zero.

## Workflow follow-up

- Prove the behavior with a real run through a Cursor Automation and the Azure DevOps MCP transport as part of the `measure-autonomy` cloud acceptance record, including one transient operation failure the agent recovers from. A stubbed caller does not count.
- Archive the change after the project's review requirements are satisfied.
