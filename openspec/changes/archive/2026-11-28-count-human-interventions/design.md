# Design

## Context

`recordStop(project, report)` appends `blocked.recorded`, deduplicating on invariant, attempt, and attempt state, and emits `blocked.resolved` when a later stop supersedes it. It is called from `orchestrate.mjs` and from `run.mjs` for commands in `BLOCKED_COMMANDS` that carry both a change and a task. The autonomy report reads only those events. A stop produced anywhere else, including `verify run --red` closing the session with `vacuous-red`, leaves no event. `HUMAN_DECISION_EVENTS` (approval, exception, lockout resolution, reopen, reconcile) is read only to stop a later success from counting as an autonomous recovery.

## Decisions

### D1. One recording path for every stop

A helper `noteStop(project, { change, task, attemptId, stopReason | error })` builds the blocked report and calls `recordStop`. It is called from three places: the existing orchestrator and run sites (unchanged behavior), the end of `closeLatestRunSession` when it closes with a stop reason, and the CLI's top-level error handler when the error is a `BlockedError`. Deduplication stays in `recordStop`, so a stop hit twice records once. A command that fails with a plain `Error` records `command.error` with `code: unclassified` and the command name, and no report.

`verify run --red` currently throws `new Error('vacuous-red: ...')` and `retry-cap`. It throws `BlockedError` with invariant `vacuous-red` or `retry-cap` and the same message, so the existing text is unchanged and the top-level handler records the stop.

### D2. Decisions are counted by level

The report builds a `decisions` section from events whose type maps to a gate in the authority table. A new `EVENT_GATES` map in `authority.mjs` says which event type is which gate: `approval.issued` and `approval.revoked` map to the approval gates (`human`), `halt.resumed` to resume (`human`), `red-exception.recorded` to red waive or reuse (`independent`), `lockout.resolved` and `attempt.reopened` and `tasks.reconciled` to their gates (`independent`), `run.new-run` to the new-run gate (`agent`), and `red.invalidated` and `attempt.repointed` to `agent` or `independent` by whether a displaced attempt had evidence (the event already carries the facts). Events at `human` level are interventions in the `policy-decision` category. Events at other levels are listed under `decisions` with their level and are not interventions. Before `truthful-authority-levels` lands, only the approval and halt types are present in the map.

`HUMAN_DECISION_EVENTS` keeps its recovery-suppression role, now derived from `EVENT_GATES` so the two cannot drift.

### D3. Halt resume event

Removing HALT through `idefactory resume` appends `halt.resumed` with no ids beyond the time. Setting HALT is a safety action and stays unrecorded as a decision. The event exists because an unattended factory should show that a person had to intervene.

### D4. Unrecorded stops from session files

The report scans `.factory/orchestration/runs/*.json` read-only. A closed session whose stop reason is a stop (not `all-done`, `needs-agent`, or `needs-complete`) and for which no `blocked.recorded` event exists with the same change, matching stop code, and a time within the session's window is listed in `unrecordedStops` as `{ runId, change, stopReason, code, closedAt }`. Matching uses the code from `codeForStopReason`. This is deliberately conservative: a stop that was recorded under a different invariant than its session stop reason still counts as unrecorded only if no recorded event shares that code, and the test fixtures include that case.

### D5. Completeness and `routineClean`

`measurementComplete` is false when `unrecordedStops` is non-empty. `routineClean` is true only when `measurementComplete` is true and there are no `failure` or `redundant` interventions. Rationale: a measure that cannot see part of the history must not report clean. A project with an empty event log and no sessions is complete and clean, as before.

### D6. `noEvents` split

The old field `noEvents` meant "no stop events". It is replaced by `noStopEvents` (same meaning) alongside `eventsRead`. The text output says "N events were read, none were stops" when relevant, so the user's earlier output would have said so instead of implying a clean run. The JSON schema version rises to 2. The old `noEvents` key is kept for one release as an alias of `noStopEvents` so existing consumers keep working, and the help says it is deprecated.

### D7. Categories under the new levels

`policy-decision` stays for approvals, halts, exhausted spend ceilings, and new runs refused at the cap. A lockout resolution moves out of it: it is an independent decision. The classification function reads the first usable option's level instead of the literal actor.

## Risks and trade-offs

- Recording stops from the error handler could double-count with the orchestrator's own record. `recordStop` already deduplicates on invariant, attempt, and state, and a test covers a stop hit through both paths.
- Reading session files in the report couples the report to the session format. The reader already exists in `run-session.mjs` and validates the schema, so a corrupt file is listed as an unreadable session and does not crash the report.
- Keeping `noEvents` as an alias adds a field that will later be removed. The alternative breaks existing consumers silently.
