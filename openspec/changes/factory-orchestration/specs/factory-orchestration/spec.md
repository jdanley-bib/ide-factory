# factory-orchestration Specification

## Purpose
Owns execution attempts, evidence gates, atomic completion, and a bounded run driver that never launches a model.

## Requirements

### Requirement: Attempt lifecycle
The system SHALL persist attempts under `.factory/attempts/` with states planned, assigned, implementing, red-confirmed, verifying, security-checking, awaiting-review, accepted, rejected, and finalized, and SHALL reject illegal transitions.

#### Scenario: Start attempt
- **WHEN** `idefactory attempt start` runs for a ready todo work item
- **THEN** an attempt file exists in planned or assigned state and the work item links to that attempt id

### Requirement: Evidence on transition
Transitions that leave implementing, verifying, security-checking, or awaiting-review SHALL require structured evidence fields for that stage.

#### Scenario: Review without verdict refused
- **WHEN** transition to accepted is requested without a reviewer verdict
- **THEN** the command exits with an error and the attempt state is unchanged

### Requirement: Atomic complete
`idefactory complete` SHALL refuse unless required checks passed, reviewer differs from implementer, reviewer accepted, and no HALT or lockout exists; on success it SHALL mark the work item done, check the OpenSpec checkbox, and finalize the attempt.

#### Scenario: Same agent blocked
- **WHEN** complete runs and implementer id equals reviewer id
- **THEN** the command exits with an error and the work item stays not done

#### Scenario: Successful finalize
- **WHEN** complete runs with a valid accepted attempt
- **THEN** the work item status is done, the matching OpenSpec checkbox is checked, and the attempt is finalized

### Requirement: Bounded run without model launch
`idefactory run` SHALL select ready work, emit an orchestration request when an agent step is required, exit with code 2 for that case, and SHALL NOT spawn a model process. It SHALL stop on HALT, lockout, rejection, failed verification, human-gate, max-tasks, or all done.

#### Scenario: Needs agent
- **WHEN** run needs an engineer step and no evidence exists yet
- **THEN** stdout contains an orchestration request and the exit code is 2

#### Scenario: Halt stops run
- **WHEN** HALT exists and run is invoked
- **THEN** the command exits with an error and does not advance attempts

### Requirement: CLI does not launch models
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous unattended build daemon.

#### Scenario: Run is file-state only
- **WHEN** run completes a pure state advance or emits a request
- **THEN** no child process that invokes a model is started
