# Tasks

## 1. Report and table

- [x] 1.1 Add `src/lib/blocked-states.mjs` with the code table, actor, retry class, and option table, and a builder that returns the report and decides `supported` from the dispatchable commands and current state; verify with table-driven unit tests for each code, including a case where every option is unsupported and the report says there is no supported recovery.
- [x] 1.2 Add a test that every stop reason in the `bounded-run-sessions` explicit-stop-reason list maps to a code, and that an unknown code maps to `unclassified` with the original message; verify the test fails when a reason is added to the list without a mapping.
- [x] 1.3 Add `BlockedError` and convert the throw sites for HALT, lockout, `complete` unmet requirement, missing approval, finalize failure, and the reconciliation error to it with the message text unchanged; verify with the existing tests passing unchanged and new tests asserting the `invariant` code.

## 2. Emission

- [x] 2.1 Add `--json` to `run` in `src/lib/run.mjs` and `src/lib/orchestrate.mjs` returning `{ stopReason, exitCode, request, blocked }` for every stop site; verify with tests for `human-gate`, `blocked`, `rejected`, `max-agent-steps`, and `vacuous-red`, and that exit codes and default text equal the previous behavior.
- [x] 2.2 Add `--json` to `next`, `complete`, `attempt transition`, and `sync-tasks`, printing the report on failure and the existing data on success; verify with a failing `complete` (non-zero exit with the report), an `attempt transition` rejection, a `sync-tasks` reconciliation error naming `sync-tasks --plan`, and an empty `next`.
- [x] 2.3 Catch unmapped errors in the dispatcher and, with `--json`, print an `unclassified` report; verify with a test that forces an unknown error and asserts the report, the non-zero exit, and unchanged text output without the flag.

## 3. Durable record

- [x] 3.1 Write `.factory/blocked/<change>--<task>.json` and a `blocked.recorded` control event (invariant, actor, retry class, `agentActionable`) whenever a stop is reported for an item, extend the event allowlist in `src/lib/event-log.mjs` for those fields, and add `.factory/blocked/` to the run-state prefixes in `src/lib/verification-evidence.mjs`; verify with a test that writing the record leaves an approval and a verification record valid at the same HEAD without a commit.
- [x] 3.2 Mark the record resolved with the resolving approval, exception, or lockout resolution when a later run finds the condition gone, append a `blocked.resolved` event naming the resolution kind, and make a stale open record not block; verify with tests for resolved-by-approval, resolved-by-lockout-resolution, and a hand-created stale open record with live state clear.

## 4. Standing decisions

- [x] 4.1 Add `standingDecisions(project, item)` reading valid approvals and standing authorizations, red exceptions, method records, and the latest reconciliation record through their existing validators, omitting expired, revoked, and mismatched ones; verify with unit tests for each source, for an expired approval being omitted, and for a source with no records contributing nothing.
- [x] 4.2 Append a standing-decisions block to `renderPacket` in `src/lib/queue.mjs` and `renderRequest` in `src/lib/orchestrate.mjs` for every role and omit it when empty; verify with a test that the implementer and reviewer packets for one item list the same decisions and that listing does not change an authorization check.

## 5. Help and guidance

- [x] 5.1 Document `--json` in the help entries for `run`, `next`, `complete`, `attempt transition`, and `sync-tasks`, and describe the report fields, actors, retry classes, and record path in the `run` entry; verify with `node src/cli.mjs help run --json` and `node --test test/command-help.test.mjs` passing with the global help text unchanged.
- [x] 5.2 Update `templates/skills/factory-run/SKILL.md`, `factory-build`, `factory-coordinator`, `factory-governance`, and `README.md` with the branching rule and the no-re-ask rule, copy to adapter paths, and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs`.

## 6. Integration

- [x] 6.1 Add an end-to-end test: a human gate stops `run --json` with an `approval-missing` report naming the human actor, an approval is recorded, the next run proceeds without asking, and the record is marked resolved naming the approval; verify the test passes.
- [x] 6.2 Run `npm test` and `npx openspec validate actionable-blocked-states --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
