# Proposal

## Why

Part of #54 and #51. #54 reported heavy process friction, and `idefactory autonomy report --json` over the same project printed `eventsRead: 486`, `noEvents: true`, zero interventions, and `routineClean: true`. The report was reading the log correctly. The log held no stop events, because stops are recorded only from `run`, `next`, `complete`, `attempt transition`, and `sync-tasks`. The stops that caused the friction came from `verify run --red` (a plain `Error` for `vacuous-red` and `retry-cap`) and from run sessions that closed with a stop reason. A tool whose measure of "little to no human interaction" is blind to the interactions it was built to measure cannot tell whether the work in this series succeeded.

The report must also count what a human actually decided. Approvals, resumes, and halts are human decisions. They are recorded as events today, but only to suppress recoveries, never counted.

## What Changes

- Every command that closes a run session with a stop reason, or fails with a `BlockedError`, records one `blocked.recorded` event through the same deduplicating path. `verify run --red` raises a `BlockedError` with the matching invariant for `vacuous-red` and `retry-cap`.
- Unclassified command failures append a `command.error` event with a code only, so an unmapped failure is visible instead of silent.
- The report counts human decisions, by authority level from the table in `truthful-authority-levels`: events whose gate is `human` count as interventions in the `policy-decision` category, and events whose gate is `independent` or `agent` are counted separately as decisions that needed no person. A new `halt.resumed` event makes removing HALT visible.
- The report reads closed run session files and lists any stop that has no matching `blocked.recorded` event as an `unrecordedStops` entry, with its stop reason code, change, and time. This also makes history from before this change visible.
- The report adds `measurementComplete`. It is false when unrecorded stops exist. `routineClean` is true only when `measurementComplete` is true and there are no `failure` or `redundant` interventions, so a blind report no longer says clean.
- `noEvents` is split into `noStopEvents` and `eventsRead`, and the text says whether the log held events that were not stops.
- Intervention categories follow the new levels: a lockout resolution is no longer a human policy decision.
- The schema version rises to 2. The report remains read-only and codes-only.

## Capabilities

### Modified Capabilities

- `autonomy-measurement`: counts human and independent decisions, lists unrecorded stops, states measurement completeness, changes `routineClean`.
- `factory-event-log`: stops from every command, halt resume, and command error events.
- `blocked-states`: `verify run --red` stops are classified.
- `cli-help`: help for the new report fields.

## Impact

- `src/lib/autonomy.mjs` (decisions, unrecorded stops, completeness, schema 2), `src/lib/blocked-states.mjs` and a shared stop-recording hook in `src/lib/run-session.mjs` or the CLI error path, `src/lib/verification-evidence.mjs` (`BlockedError` for vacuous-red and retry-cap), `src/lib/event-log.mjs` (allowlist, new types), `src/lib/run.mjs` (resume event, `command.error`), `src/lib/command-help.mjs`.
- `test/autonomy.test.mjs`, `test/blocked-states.test.mjs`, `test/event-log.test.mjs`, `test/verification-evidence.test.mjs`.
- No new dependencies. Depends on `truthful-authority-levels` for the gate table; before it lands the report treats approvals as the only human-level decisions.

Out of scope:

- Measuring prompts a person types into the IDE chat. The scope line stays.
- Backfilling events. Unrecorded stops are derived on read from session files and never written.
- Judging whether a recorded stop was avoidable when no event ties it to a resolution. Those appear as unrecorded, not as redundant.
