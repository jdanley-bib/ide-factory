# autonomy-measurement Specification

## Purpose
Reports how often and why a human was needed, derived from recorded control events, and separates intentional policy decisions from failures and redundant prompts.

## Requirements

### Requirement: Autonomy report
`idefactory autonomy report` SHALL print the human interventions, the stops handled without a human, and the autonomous recoveries recorded in the control event log, optionally limited by `--change` and `--since`. With `--json` it SHALL print one JSON object with a schema version. It SHALL NOT create or modify any file or append an event.

#### Scenario: Report from events
- **WHEN** the event log holds two stops that needed a human and one stop that did not
- **THEN** the report counts two interventions and one handled stop

#### Scenario: Read-only
- **WHEN** the report runs
- **THEN** no file under `.factory/` is created or modified

#### Scenario: Empty log
- **WHEN** the event log has no stop events
- **THEN** the report shows zero interventions and states that no events were recorded

### Requirement: Intervention categories
Each human intervention SHALL be in exactly one category. It SHALL be `policy-decision` when the stop is an intentional human decision such as an approval, a halt, a lockout resolution, or an exhausted budget. It SHALL be `failure` when no supported recovery existed or the invariant was unclassified. It SHALL be `redundant` when a supported option that resolves the stop and that an agent may run existed.

#### Scenario: Approval for a deployment
- **WHEN** a run stops for a missing `deploy` approval
- **THEN** the intervention is a `policy-decision`

#### Scenario: Unsupported recovery
- **WHEN** a stop names a human actor and no supported recovery
- **THEN** the intervention is a `failure`

#### Scenario: Avoidable stop
- **WHEN** a stop names a human actor but a supported option for an agent existed
- **THEN** the intervention is `redundant`

### Requirement: Stops without a human actor
A stop whose actor is not the human SHALL NOT count as an intervention. The report SHALL count it as handled, and SHALL count an autonomous recovery when a later event resolves it without a human decision between them.

#### Scenario: Review handled by another agent
- **WHEN** a stop names an independent agent as the actor and a later review resolves it
- **THEN** the report counts a handled stop and no intervention

#### Scenario: Recovered transient failure
- **WHEN** an infrastructure failure stop is followed by a successful retry with no human decision between
- **THEN** the report counts one autonomous recovery

### Requirement: Routine success measure
The report SHALL state `routineClean` as true when it holds no `failure` and no `redundant` interventions in the selected range, and SHALL list every intervention with its time, category, invariant code, change, and task.

#### Scenario: Only policy decisions
- **WHEN** every intervention is a `policy-decision`
- **THEN** `routineClean` is true

#### Scenario: A failure present
- **WHEN** one intervention is a `failure`
- **THEN** `routineClean` is false

### Requirement: Codes only
The report and the events it reads SHALL contain codes, ids, and times only. They SHALL NOT contain approval notes, exception reasons, check output, environment values, or error text.

#### Scenario: Secret-like note
- **WHEN** an approval note contains a secret-like string
- **THEN** the report does not contain it

### Requirement: Report scope is stated
The report SHALL state that it covers interventions the factory recorded and not prompts typed into an IDE chat.

#### Scenario: Scope line
- **WHEN** the report prints
- **THEN** it includes the scope statement
