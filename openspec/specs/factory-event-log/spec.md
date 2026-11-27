# factory-event-log Specification

## Purpose
Records successful control-plane actions in an append-only local log that cannot authorize work or replace verification evidence.

## Requirements

### Requirement: Append control-plane events
A successful approve, reject, lockout creation, lockout resolution, run stop, verification record, red exception record, or completion SHALL append one JSON event to `.factory/observability/events.jsonl`. The event SHALL name its type, time, and related ids. It SHALL NOT include approval notes, exception reasons, environment values, or raw check logs.

#### Scenario: Completion is recorded
- **WHEN** complete succeeds for a work item
- **THEN** the log gains one completion event naming that work item
- **AND** the event omits raw check output

#### Scenario: Verification event keeps the digest
- **WHEN** a verification record is stored
- **THEN** the appended event includes the command digest and exit code
- **AND** the event omits the check log text

#### Scenario: Red exception is recorded
- **WHEN** a reuse or waiver exception is recorded
- **THEN** the log gains one event naming the exception type, exception id, attempt id, change, and task
- **AND** the event omits the reason text

### Requirement: Event failure does not undo the action
When the event append fails after the action has succeeded, the command SHALL leave that action in place and SHALL report an event-log warning.

#### Scenario: Completion survives a log failure
- **WHEN** complete has marked the work item done and the event append then fails
- **THEN** the work item stays done
- **AND** the command reports an event-log warning

### Requirement: Events are not evidence or a queue
The factory SHALL NOT treat an event log entry as verification evidence, a gate approval, or a work item. Reading status SHALL NOT append an event.

#### Scenario: Event file is not a pass
- **WHEN** a caller presents an event log entry as a check result
- **THEN** verification does not store it as passing evidence

#### Scenario: Status does not write events
- **WHEN** status runs with `--json`
- **THEN** the event log is unchanged

### Requirement: Stop events carry codes only
Events that record a reported blocked state or its resolution SHALL carry the invariant code, the actor, the retry class, whether a supported resolving option for an agent existed, and the resolution kind. They SHALL NOT carry error text, approval notes, exception reasons, environment values, or check output.

#### Scenario: Blocked event content
- **WHEN** a stop is reported for a work item
- **THEN** the appended event names the invariant code, actor, retry class, and agent-option flag
- **AND** the event omits error text

#### Scenario: Resolution event content
- **WHEN** a later run resolves a recorded stop
- **THEN** the appended event names the resolution kind and the related ids
- **AND** the event omits notes and reasons
