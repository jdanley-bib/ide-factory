## MODIFIED Requirements

### Requirement: Autonomy report
`idefactory autonomy report` SHALL print the human interventions, the decisions that needed no person, the stops handled without a human, the autonomous recoveries, and any unrecorded stops found in the control event log and the closed run sessions, optionally limited by `--change` and `--since`. With `--json` it SHALL print one JSON object with schema version 2. It SHALL NOT create or modify any file or append an event.

#### Scenario: Report from events
- **WHEN** the event log holds two stops that needed a human and one stop that did not
- **THEN** the report counts two interventions and one handled stop

#### Scenario: Read-only
- **WHEN** the report runs
- **THEN** no file under `.factory/` is created or modified

#### Scenario: Empty log
- **WHEN** the event log has no stop events and no closed sessions hold a stop
- **THEN** the report shows zero interventions and states that no stop events were recorded

### Requirement: Intervention categories
Each human intervention SHALL be in exactly one category. It SHALL be `policy-decision` when the stop or decision is an intentional human-level act such as an approval, a halt resume, an exhausted spend ceiling, or a refused new run at the cap. It SHALL be `failure` when no supported recovery existed or the invariant was unclassified. It SHALL be `redundant` when a supported option that resolves the stop and that an agent may run existed. A lockout resolution, a red waiver or reuse, and a reconciliation apply SHALL NOT be human interventions, because they need an identity other than the implementer's and not a person.

#### Scenario: Approval for a deployment
- **WHEN** a run stops for a missing `deploy` approval
- **THEN** the intervention is a `policy-decision`

#### Scenario: Unsupported recovery
- **WHEN** a stop names a human actor and no supported recovery
- **THEN** the intervention is a `failure`

#### Scenario: Avoidable stop
- **WHEN** a stop names a human actor but a supported option for an agent existed
- **THEN** the intervention is `redundant`

#### Scenario: Lockout resolved by another identity
- **WHEN** a lockout is resolved by an identity other than the locked agent
- **THEN** the report lists it as a decision that needed no person
- **AND** it is not counted as an intervention

### Requirement: Routine success measure
The report SHALL state `measurementComplete` as true when no closed run session holds a stop without a recorded stop event, and SHALL state `routineClean` as true only when `measurementComplete` is true and the selected range holds no `failure` and no `redundant` interventions. It SHALL list every intervention with its time, category, invariant code, change, and task.

#### Scenario: Only policy decisions
- **WHEN** every intervention is a `policy-decision` and no stop is unrecorded
- **THEN** `routineClean` is true

#### Scenario: A failure present
- **WHEN** one intervention is a `failure`
- **THEN** `routineClean` is false

#### Scenario: Blind report is not clean
- **WHEN** a closed session holds a stop with no recorded stop event
- **THEN** `measurementComplete` is false
- **AND** `routineClean` is false

## ADDED Requirements

### Requirement: Human decisions are counted
An event for a human-level gate, namely an approval issued or revoked and a halt resume, SHALL count as an intervention in the `policy-decision` category. An event for an independent-level or agent-level gate SHALL be listed under `decisions` with its level and SHALL NOT count as an intervention.

#### Scenario: Approval event
- **WHEN** the log holds an `approval.issued` event
- **THEN** the report counts one `policy-decision` intervention for it

#### Scenario: Halt resume event
- **WHEN** the log holds a `halt.resumed` event
- **THEN** the report counts one `policy-decision` intervention

#### Scenario: Waiver event
- **WHEN** the log holds a `red-exception.recorded` event for a waiver
- **THEN** the report lists it under `decisions` at level `independent` and does not count an intervention

### Requirement: Unrecorded stops are reported
The report SHALL list each closed run session whose stop reason is a stop, not `all-done`, `needs-agent`, or `needs-complete`, and for which no `blocked.recorded` event shares its change and stop code. Each entry SHALL carry the run id, change, stop reason, code, and close time, and SHALL NOT carry text. An unreadable session SHALL be listed as unreadable and SHALL NOT stop the report.

#### Scenario: Stop with no event
- **WHEN** a session closed with `vacuous-red` and the log has no matching stop event
- **THEN** `unrecordedStops` lists that session with code `vacuous-red`

#### Scenario: Recorded stop
- **WHEN** a matching `blocked.recorded` event exists
- **THEN** the session is not listed

#### Scenario: Corrupt session file
- **WHEN** a session file is not valid JSON
- **THEN** it is listed as unreadable
- **AND** the report still prints

### Requirement: Coverage is stated
The report SHALL state `eventsRead` and `noStopEvents`. When events were read but none were stops, the text output SHALL say so. The JSON output SHALL keep `noEvents` for one release as an alias of `noStopEvents`.

#### Scenario: Events but no stops
- **WHEN** the log holds 486 events and none are stop events
- **THEN** the text says 486 events were read and none were stops
- **AND** the JSON has `eventsRead` 486 and `noStopEvents` true
