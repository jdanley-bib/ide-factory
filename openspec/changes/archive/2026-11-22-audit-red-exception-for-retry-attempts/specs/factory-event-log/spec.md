# Spec Delta

## MODIFIED Requirements

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
