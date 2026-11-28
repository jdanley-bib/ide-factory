## MODIFIED Requirements

### Requirement: Exhausted session stays exhausted
A later process SHALL NOT open a zeroed session when the latest session stopped for `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `retry-cap`, `max-tokens`, `max-cost`, or `invalid-session`. A new session SHALL be opened only when the invocation passes `--new-run` and the new-run rules allow it, and the closed session file SHALL remain. A stop for `infrastructure-failure` or `baseline` SHALL NOT by itself keep the next run from retrying that check.

#### Scenario: Next process does not reset
- **WHEN** the latest session stop reason is `max-agent-steps` and the invocation omits `--new-run`
- **THEN** the run does not create a session with a zero agent-step count
- **AND** it prints no orchestration request

#### Scenario: Human opens a new session
- **WHEN** `--new-run` is passed after a budget stop and the new-run cap has not been reached
- **THEN** a new run id is stored with an agent-step count of zero
- **AND** the previous session file remains

#### Scenario: Retry cap stays stopped
- **WHEN** the latest session stop reason is `retry-cap` and the invocation omits `--new-run`
- **THEN** the run prints no orchestration request

#### Scenario: Infrastructure failure can be retried
- **WHEN** the latest session stop reason is `infrastructure-failure` and run starts again without `--new-run`
- **THEN** the run retries the failed check instead of keeping the previous stop

### Requirement: Unchanged state
When the next request would name the same attempt, role, and work-item status as the previous request, and that attempt state is unchanged, the run command SHALL emit no request and SHALL persist stop reason `unchanged-state`. This stop SHALL be evaluated again on each run and SHALL NOT require `--new-run`.

#### Scenario: Repeated request
- **WHEN** a previous run emitted a request and the attempt state and work-item status are unchanged
- **THEN** the next run prints no orchestration request
- **AND** the persisted stop reason is `unchanged-state`

#### Scenario: State changed after the stop
- **WHEN** the latest session stopped for `unchanged-state` and the attempt state has since changed
- **THEN** the next run without `--new-run` proceeds in the same session
- **AND** the run id and agent-step count are unchanged

### Requirement: Optional host usage
The run command SHALL enforce a token ceiling or a cost ceiling only when that ceiling is configured and the invocation exposes the matching host metric. A configured ceiling without its metric SHALL persist stop reason `host-usage-unavailable` and emit no request, and that stop SHALL clear on a later run that exposes the metric or whose configuration removes the ceiling. An unconfigured ceiling SHALL NOT store a fabricated token or cost value.

#### Scenario: Host tokens reach the ceiling
- **WHEN** a token ceiling is configured and the invocation exposes a token count at or above it
- **THEN** the run prints no orchestration request
- **AND** the persisted stop reason is `max-tokens`

#### Scenario: Cost ceiling without a metric
- **WHEN** a cost ceiling is configured and the invocation exposes no cost
- **THEN** the run prints no orchestration request
- **AND** the persisted stop reason is `host-usage-unavailable`

#### Scenario: Metric becomes available
- **WHEN** the latest session stopped for `host-usage-unavailable` and a later run exposes the cost metric below the ceiling
- **THEN** the run proceeds in the same session without `--new-run`

#### Scenario: No ceiling and no metric
- **WHEN** neither a token ceiling nor a cost ceiling is configured and the invocation exposes neither metric
- **THEN** the session stores neither a token count nor a cost value
- **AND** the missing metrics do not stop the run

### Requirement: Skill re-entry preserves the session
Every factory-run skill shipped in this repository SHALL tell the IDE to invoke the run command again without `--new-run` after a stop that can clear. Each copy SHALL name `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `unchanged-state`, `vacuous-red`, `infrastructure-failure`, `baseline`, and `retry-cap` as stop conditions. It SHALL say that `--new-run` is for budget stops and `retry-cap`, is limited by the new-run cap, and is never passed after `vacuous-red`, where the agent resolves the red and runs again.

#### Scenario: Skill does not reset the budget
- **WHEN** a shipped factory-run skill is read
- **THEN** it does not instruct the IDE to pass `--new-run` as the first response to a stop
- **AND** it names `max-agent-steps` and `unchanged-state` as stop conditions

#### Scenario: Skill names the red stops
- **WHEN** a shipped factory-run skill is read
- **THEN** it names `vacuous-red` and `retry-cap`
- **AND** it says a `vacuous-red` stop clears when the red is resolved and run is invoked again

## ADDED Requirements

### Requirement: Condition stops clear when the condition clears
A closed session whose stop reason is `vacuous-red`, `unchanged-state`, `host-usage-unavailable`, or `invalid-budget` SHALL be re-evaluated by the next run. When the condition no longer holds, the run SHALL reopen the same session with the same run id and counters, append the cleared stop to the session's `clearedStops`, and continue. When it still holds, the run SHALL print the same stop and exit code as before.

#### Scenario: Cleared stop keeps counters
- **WHEN** a session with agent-step count 7 stopped for a condition that is now resolved
- **THEN** the next run continues in that session
- **AND** the run id and the agent-step count of 7 are unchanged
- **AND** `clearedStops` names the stop reason

#### Scenario: Unresolved stop stays
- **WHEN** the condition behind the stop still holds
- **THEN** the run prints no orchestration request and persists the same stop reason

### Requirement: Vacuous-red stops name what they wait for
A `vacuous-red` stop SHALL record the attempt id and the red kinds whose latest red outcome was vacuous. The stop SHALL clear when every recorded kind has a method proposal, a waiver or reuse exception, a valid red invalidation, or a genuine red recorded on that attempt after the vacuous result, or when the work item's current attempt is a different attempt.

#### Scenario: Method resolves the stop
- **WHEN** a method proposal covering the recorded kind is stored after the vacuous result
- **THEN** the next run reopens the session

#### Scenario: One of two kinds resolved
- **WHEN** two kinds were vacuous and only one has a resolution
- **THEN** the stop still holds and the run names the unresolved kind

#### Scenario: Older session without context
- **WHEN** the closed session has no recorded context and the current attempt has a method or exception record dated after the stop
- **THEN** the next run reopens the session

### Requirement: New runs are bounded
Passing `--new-run` after a stop for `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, or `retry-cap` SHALL open a new session only while the number of session files for the change is at most the configured `run.maxNewRuns`. The default SHALL be 3, the valid range 1 to 20, and any other value SHALL use 3.

#### Scenario: Within the cap
- **WHEN** the change has two session files and `--new-run` follows `max-agent-steps`
- **THEN** a third session is created with zero counters

#### Scenario: Out-of-range config
- **WHEN** `run.maxNewRuns` is 0
- **THEN** the cap used is 3

### Requirement: Refused new runs are reported
Past the new-run cap the run SHALL stop with a blocked report with invariant `new-run-cap` whose resolver is a human. `--new-run` after `max-tokens` or `max-cost` SHALL remain refused with a report whose resolver is a human.

#### Scenario: Cap reached
- **WHEN** the change already has four session files and `--new-run` follows `max-tasks`
- **THEN** no session is created
- **AND** the report names invariant `new-run-cap`

#### Scenario: Spend ceiling
- **WHEN** the latest stop is `max-cost` and `--new-run` is passed
- **THEN** no session is created and the report's resolver is a human

### Requirement: Low agent-step budgets are advised
When a session is created with fewer agent steps than four times the change's pending work items, the run SHALL print one advisory line naming the budget, the pending count, and a suggested minimum, and SHALL continue. The advisory SHALL NOT be written to the event log.

#### Scenario: Low budget
- **WHEN** a session is created with 20 agent steps for 10 pending work items
- **THEN** the output contains the advisory line and the run continues

#### Scenario: Sufficient budget
- **WHEN** a session is created with 120 agent steps for 10 pending work items
- **THEN** no advisory is printed
