# Design

## Context

`STICKY_STOP_REASONS` lists every stop that keeps a closed session closed until `--new-run`. The list mixes two kinds of stop. Four reasons (`max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`) mean a budget was consumed. `max-tokens` and `max-cost` mean a configured spend ceiling was reached. The rest (`vacuous-red`, `unchanged-state`, `host-usage-unavailable`, `invalid-budget`, `invalid-session`, `retry-cap`) describe a state of the project, not consumption. Treating them the same makes any resolved condition look like an exhausted run.

## Decisions

### D1. Three stop classes

| Class | Reasons | Clears by |
| --- | --- | --- |
| Budget | `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `retry-cap` | `--new-run` within the cap |
| Spend ceiling | `max-tokens`, `max-cost` | `--new-run` by a human |
| Condition | `vacuous-red`, `unchanged-state`, `host-usage-unavailable`, `invalid-budget` | the condition no longer holding |

`invalid-session` is outside the table and keeps its current behavior. `retry-cap` is in the budget class because it limits repetition: it should not clear itself, but an agent may reset it within the cap.

### D2. Condition stops are re-evaluated by `run`

`openOrResumeRunSession` no longer returns a closed condition-stop session unchanged. It asks `stopCondition(project, session, invocation)` whether the condition still holds. If it holds, the session is returned closed and `run` prints the same stop and report as today. If it does not, the session is rewritten with status open, stop reason null, the same run id and counters, and an entry appended to a `clearedStops` array (`{ stopReason, clearedAt, resolution }`). The ledger and its high-water check are unaffected because the run id and `agentSteps` do not change.

Per reason:

- `unchanged-state`: the condition holds only while the next request would equal the last request and the attempt state is unchanged. Because the existing check already evaluates exactly that, the stop is simply not sticky and `run` recomputes it.
- `host-usage-unavailable`: holds while a ceiling is configured and the invocation exposes no matching metric. Removing the ceiling or passing the metric clears it.
- `invalid-budget`: holds while the resolved budgets are invalid. Fixing config clears it. The existing error path is unchanged, so no session is created with zero counters.
- `vacuous-red`: see D3.

### D3. Vacuous-red records what it is waiting for

`verify run --red` already closes the session with `vacuous-red`. It now also stores `stopContext: { attemptId, kinds }` on the session, where `kinds` is the red kinds whose latest red outcome is vacuous. The stop clears when, for every kind, the attempt now has a resolution recorded after the vacuous diagnostic: a method proposal covering the kind, a waiver or reuse exception, a valid red invalidation, or a genuine red. It also clears when the work item's current attempt is a different attempt. Sessions closed by an older version have no `stopContext`; for those, the stop clears when the current attempt has any method or exception record dated after the stop time.

### D4. Budget stops stay sticky; `--new-run` is bounded for agents

A closed budget-class session returns unchanged without `--new-run`, as today. With `--new-run`, `run` counts the session files for the change. If the count is below `run.maxNewRuns` plus one (default cap 3), it opens a new session and emits `run.new-run`. Otherwise it stops with a blocked report, invariant `new-run-cap`, whose resolving option is raising the cap in config by a human. For the spend-ceiling class, `--new-run` is refused with the existing sticky behavior and a report whose actor is human. The cap counts files already on disk, so deleting nothing keeps the history honest and no new counter is stored.

Total spend for one change is therefore bounded at (cap + 1) times the budgets, still enforced by the factory rather than by agent judgment.

### D5. Defaults

New projects get `defaultMaxAgentSteps: 120` in `templates/factory/config.json`. Init still leaves an existing config byte-for-byte unchanged, so existing projects keep what they have. When `run` creates a session and `maxAgentSteps` is below four times the pending tasks of the change, it prints `advisory: agent-step budget N is low for M pending tasks (suggest at least K)` once and continues. The advisory is text only and does not enter the event log.

### D6. Exceptions never edit sessions

The exception commands keep not touching the session file. What changes is the promise made to the reader: the next `run` reopens the session when D3's condition is met. The older requirement that a waiver leaves the session closed until the human passes `--new-run` is replaced.

### D7. Events

`run.stop-cleared` carries `runId`, `stopReason`, and `resolution` (`method`, `exception`, `new-attempt`, `state-changed`, `metric-exposed`, `config-fixed`). `run.new-run` carries `runId`, the previous `stopReason`, and `resolver` when `--decided-by` is supplied. The allowlist already covers these fields.

## Risks and trade-offs

- A clearing predicate that is too eager could let a loop continue. Mitigation: the agent-step budget and the retry cap still count across the reopened session, and `unchanged-state` still stops a repeated request.
- Reopening a session rewrites its file. Mitigation: the rewrite goes through the existing `writeRunSession` path used for resume, and counters are copied, not recomputed.
- A cap of 3 may be too small or large for some teams. It is configurable.
