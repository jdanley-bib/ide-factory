# Proposal

## Why

Part of #54 and #51. A run that stops for `vacuous-red`, `unchanged-state`, or `host-usage-unavailable` closes its session, and `openOrResumeRunSession` returns a closed session unchanged until a human passes `--new-run`. Those stops describe a condition, not consumed budget: once the condition is resolved (a method is proposed, a red is invalidated or waived, the state changes, the metric is exposed), nothing about the session is exhausted, yet the run still refuses to start. The result in #54 was a run that stayed stopped after the agent had done exactly what the stop asked for, and only a human flag cleared it.

Budget stops are different. They mean the session consumed what it was given, and a limit that an agent can reset freely is not a limit. But the built-in agent-step default of 20 is below what a ten-task change needs (a task commonly takes five or six agent steps), so ordinary changes hit `max-agent-steps` and wait for a human for no good reason.

## What Changes

- Stops split into condition stops and budget stops. Condition stops (`vacuous-red`, `unchanged-state`, `host-usage-unavailable`, `invalid-budget`) are re-evaluated on every `run`. When the condition no longer holds, the same session reopens with its counters intact, and the run continues. No `--new-run` is needed.
- A `vacuous-red` stop records the attempt and the red kinds that caused it. It clears when each kind has a resolution recorded on that attempt (a method proposal, a waiver or reuse, a valid red invalidation, or a genuine later red), or when the work item points at a different attempt.
- Budget stops (`max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`) and `retry-cap` stay closed until `--new-run`. The agent may pass `--new-run` for them, up to a per-change cap (`run.maxNewRuns`, default 3, counted from existing session files). Past the cap, or for `max-tokens` and `max-cost`, the stop is reported as a blocked state whose resolver is a human.
- New projects default to 120 agent steps instead of 20. Existing configs are untouched. When a session is created with fewer agent steps than four times the pending tasks, `run` prints a one-line advisory.
- A cleared stop and each `--new-run` append a control event with codes only.
- `Run session stays closed` after a waiver is replaced: an exception never edits a session, and the next `run` reopens it when the stop condition is resolved.

## Capabilities

### Modified Capabilities

- `bounded-run-sessions`: condition stops clear, budget stops stay closed, bounded agent `--new-run`, budget advisory.
- `red-evidence-exceptions`: an exception does not edit the session; the next run decides.
- `guided-build`: the retry cap clears through a bounded `--new-run`.
- `project-install`: the new-project agent-step default.
- `cli-help`: `run` help describes `--new-run` and the cap.
- `factory-event-log`: stop-cleared and new-run events.

## Impact

- `src/lib/run-session.mjs` (stop classes, clear evaluation, new-run cap), `src/lib/orchestrate.mjs` and `src/lib/run.mjs` (call the clear evaluation, advisory, `--new-run` handling), `src/lib/verification-evidence.mjs` (record the stop context), `src/lib/blocked-states.mjs` (`new-run` option actor, `new-run-cap` row), `src/lib/event-log.mjs`, `src/lib/command-help.mjs`, `templates/factory/config.json`, the `factory-run` skill and adapter copies.
- `test/run-session.test.mjs`, `test/orchestrate.test.mjs`, `test/red-exceptions.test.mjs`, `test/init.test.mjs`.
- No new dependencies. The authority wording for `--new-run` is finalized by `truthful-authority-levels`.

Out of scope:

- Token and cost ceilings. They are configured spend limits; resetting them stays a human decision.
- `invalid-session` (corrupt file or clock regression). It stays sticky because it signals damaged state.
- Making `retry-cap` itself clear. It limits repeated reds without progress, and only `--new-run` within the cap resets it.
