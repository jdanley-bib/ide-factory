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

### Requirement: Pointer events carry ids only
An applied attempt repair SHALL append one `attempt.repointed` event naming the change, task, previous attempt id, new attempt id, and resolver. The event SHALL NOT include the reason text, the plan digest inputs, or evidence contents.

#### Scenario: Repair event content
- **WHEN** a repair is applied with a reason
- **THEN** the log gains one `attempt.repointed` event with the two attempt ids
- **AND** the event omits the reason text

### Requirement: Session stop events carry codes only
A cleared condition stop SHALL append one `run.stop-cleared` event naming the run id, the cleared stop reason, and a resolution code. An accepted `--new-run` SHALL append one `run.new-run` event naming the new run id and the previous stop reason. Neither event SHALL carry error text, notes, or check output.

#### Scenario: Stop cleared event
- **WHEN** a run reopens a session whose `vacuous-red` stop was resolved by a method proposal
- **THEN** the log gains one `run.stop-cleared` event with resolution `method`
- **AND** the event omits any text field

#### Scenario: New run event
- **WHEN** `--new-run` opens a session after `max-agent-steps`
- **THEN** the log gains one `run.new-run` event naming the previous stop reason

### Requirement: Invalidation events carry codes only
A recorded red invalidation SHALL append one `red.invalidated` event naming the change, task, attempt id, kind, class, and the identity as resolver. The event SHALL NOT include the note, the invalidated red's log, or the red digest inputs.

#### Scenario: Invalidation event content
- **WHEN** a red invalidation is recorded with a note
- **THEN** the log gains one `red.invalidated` event naming the class
- **AND** the event omits the note

### Requirement: Every stop is recorded
A run session closed with a stop reason, and a command failing with a blocked-state error, SHALL append one `blocked.recorded` event through the same deduplicating path regardless of which command produced it. A stop already recorded for the same invariant, attempt, and attempt state SHALL NOT be recorded again.

#### Scenario: Vacuous red from verify
- **WHEN** `verify run --red` closes the session with `vacuous-red`
- **THEN** the log gains one `blocked.recorded` event with invariant `vacuous-red`

#### Scenario: Same stop through two paths
- **WHEN** the same stop is reached by `verify run --red` and then by `run`
- **THEN** the log holds one event for it

### Requirement: Halt resume and command errors are recorded
`idefactory resume` SHALL append one `halt.resumed` event with the time. A command that fails with an error that has no blocked-state mapping SHALL append one `command.error` event naming the command and the code `unclassified`. Neither event SHALL carry error text, notes, or paths.

#### Scenario: Resume event
- **WHEN** `idefactory resume` removes HALT
- **THEN** the log gains one `halt.resumed` event

#### Scenario: Unmapped failure
- **WHEN** a command fails with an unmapped error
- **THEN** the log gains one `command.error` event with code `unclassified`
- **AND** the event omits the error text
