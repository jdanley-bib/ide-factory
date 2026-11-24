# red-evidence-exceptions Specification

## Purpose
Lets a human unblock a replacement attempt that cannot honestly produce a new failing test, by reusing a rejected attempt's genuine red with provenance or by waiving the red with an audited override. It never represents a new red as having run.

## Requirements

### Requirement: Exceptions are not red evidence
A red exception SHALL be stored apart from `evidence.reds` and SHALL NOT be a CLI red record. It SHALL NOT satisfy a check for `issuer: cli`, a non-zero exit code, or a failing run. Only the red-satisfaction rules for entering `verifying` and for completion SHALL consult it.

#### Scenario: Reuse is not stored as a red run
- **WHEN** a reuse exception is recorded for `unit` on a replacement attempt
- **THEN** the replacement attempt's `evidence.reds` has no `unit` record
- **AND** the replacement attempt names the exception for `unit`

#### Scenario: Caller cannot supply an exception
- **WHEN** an attempt transition payload carries a red exception object
- **THEN** the transition is rejected and nothing is stored

### Requirement: Reuse of a rejected attempt's red
`idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>` SHALL record a reuse exception only when the source attempt is an earlier, `rejected` attempt for the same change and task as the target, and holds a valid failing CLI red for each named kind. The target SHALL be a `code` attempt that has not entered `verifying`, and each kind SHALL be a required test kind of its work item.

#### Scenario: Eligible reuse
- **WHEN** a rejected attempt has a failing CLI red for `unit`
- **AND** a later attempt for the same task has not entered `verifying`
- **AND** a human runs reuse for `unit` with an approver and a reason
- **THEN** a reuse exception is recorded for `unit` on the later attempt
- **AND** the rejected attempt's file is unchanged

#### Scenario: Source not rejected
- **WHEN** the source attempt is not in state `rejected`
- **THEN** reuse fails and records nothing

#### Scenario: Source has no genuine red for the kind
- **WHEN** the source attempt has no failing CLI red for a named kind
- **THEN** reuse fails and records nothing

#### Scenario: Different task
- **WHEN** the source and target attempts belong to different changes or tasks
- **THEN** reuse fails and records nothing

#### Scenario: Lightweight target
- **WHEN** the target work item is `lightweight`
- **THEN** reuse fails and records nothing

### Requirement: Reuse needs current clean passing verification
Reuse SHALL be refused unless the worktree is clean at a resolvable HEAD, the source red's command digest equals the current registry digest for that kind, and the target attempt holds a passing CLI verification record for that kind bound to the target attempt and the current clean HEAD.

#### Scenario: Target not yet green
- **WHEN** the target attempt has no passing CLI record for the kind at the current clean HEAD
- **THEN** reuse fails and records nothing

#### Scenario: Registry command changed since the red
- **WHEN** the registered argv for the kind no longer matches the source red's command digest
- **THEN** reuse fails and records nothing

#### Scenario: Dirty worktree
- **WHEN** the worktree has uncommitted product changes
- **THEN** reuse fails and records nothing

### Requirement: Reuse provenance
A reuse exception SHALL record the exception id, target attempt id, source attempt id, change, task, kind, the source red's command digest, log digest, source revision, start and finish times, a digest of the whole source record, the HEAD at authorization, the approver, the reason, the issuance time, and the policy version. It SHALL NOT claim that the target ran a red.

#### Scenario: Provenance names the source
- **WHEN** a reuse exception is recorded
- **THEN** its file names the source attempt id and the source record digest
- **AND** it names the target attempt id and the approver

### Requirement: Red waiver override
`idefactory red waive <targetAttemptId> --kind <kind>` SHALL record a waiver exception for a `code` attempt that has not entered `verifying`, without requiring a source attempt or any earlier red. The waiver SHALL record that no red exists for that kind, the reason, and the approver. It SHALL be available to a human at any time, subject to the stuck warning.

#### Scenario: Waiver after a stuck signal
- **WHEN** the target attempt has a recorded `vacuous-red` for the kind
- **AND** a human runs waive with an approver and a reason
- **THEN** a waiver exception is recorded for that kind on that attempt
- **AND** the waiver file states that no red exists for the kind

#### Scenario: Waiver needs a reason
- **WHEN** waive runs with no reason
- **THEN** it fails and records nothing

### Requirement: Stuck warning and acknowledgment
When the target attempt has no recorded `vacuous-red` for the kind, waive SHALL refuse, SHALL print a warning that the human should first let the system become stuck or use reuse, and SHALL record nothing. When the human repeats the command with `--acknowledge-not-stuck`, waive SHALL proceed and the waiver SHALL record that the human acknowledged the warning.

#### Scenario: Refused before stuck
- **WHEN** waive runs for a kind with no recorded `vacuous-red` and without the acknowledgment flag
- **THEN** it exits non-zero and prints the warning
- **AND** no exception file is written and the attempt is unchanged

#### Scenario: Acknowledged override
- **WHEN** the human repeats waive with `--acknowledge-not-stuck`
- **THEN** a waiver is recorded
- **AND** the waiver marks `acknowledgedNotStuck` as true

#### Scenario: Stuck waiver needs no flag
- **WHEN** the target attempt has a recorded `vacuous-red` for the kind
- **THEN** waive does not require `--acknowledge-not-stuck`
- **AND** the waiver marks `acknowledgedNotStuck` as false

### Requirement: Human authorization
Reuse and waive SHALL require a non-empty approver and reason. The approver SHALL differ from the target attempt's implementer. When governance policy version is 2, the approver SHALL equal a verified principal subject, and the record SHALL store that principal. When the check fails, the command SHALL write nothing.

#### Scenario: Approver is the implementer
- **WHEN** the approver equals the target attempt's implementer identifier
- **THEN** the command fails and records nothing

#### Scenario: Policy version 2 without a verified principal
- **WHEN** policy version is 2 and no verified principal confirms the approver
- **THEN** the command fails and records nothing

### Requirement: Narrow scope and immutability
Each exception SHALL cover one target attempt and only the kinds it names, SHALL be written once as an immutable file under `.factory/exceptions/red/`, and SHALL be bound to the attempt by a content digest. A kind SHALL have at most one exception on an attempt. A missing, altered, or mismatched file SHALL NOT satisfy red.

#### Scenario: Other kind not covered
- **WHEN** an exception covers `unit` and the item also requires `integration`
- **THEN** the transition into `verifying` is rejected until `integration` has a CLI red or its own exception

#### Scenario: Second exception for one kind
- **WHEN** an attempt already has an exception for `unit` and another is requested for `unit`
- **THEN** the command fails and the first record is unchanged

#### Scenario: Altered record
- **WHEN** a stored exception file no longer matches its stored digest
- **THEN** the exception does not satisfy red
- **AND** the transition into `verifying` is rejected

#### Scenario: Other attempt not covered
- **WHEN** a later attempt for the same task needs red
- **THEN** an exception on an earlier attempt does not satisfy it

### Requirement: Unrelated gates stay in force
An exception SHALL NOT waive a passing attestation at the current clean HEAD, a distinct reviewer, a security stage, a human gate, a lockout, the retry cap, or the `code` classification, and SHALL NOT alter the rejected attempt or its evidence. It SHALL NOT reopen a closed run session.

#### Scenario: Completion still needs clean passing evidence
- **WHEN** an attempt with a valid exception completes with a stale or missing passing attestation
- **THEN** complete fails

#### Scenario: Review is still independent
- **WHEN** the reviewer identifier equals the implementer identifier on an attempt with an exception
- **THEN** completion fails

#### Scenario: Run session stays closed
- **WHEN** the latest run session stopped for `vacuous-red` and a waiver is then recorded
- **THEN** the session stays closed until the human passes `--new-run`

### Requirement: Exceptions are visible
Status, the reviewer packet, and the pull-request verdict comment for an attempt SHALL name each exception with its type, kind, approver, and reason, and SHALL say that no red ran on that attempt for that kind. A waiver acknowledged before a stuck signal SHALL be marked.

#### Scenario: Reviewer sees the waiver
- **WHEN** a reviewer packet is printed for an attempt with a waiver for `unit`
- **THEN** it states that no red ran for `unit` and names the approver and reason

### Requirement: Halt blocks exceptions
When a file named `HALT` exists in the project root, reuse and waive SHALL refuse to mutate factory state.

#### Scenario: Halt file
- **WHEN** `HALT` exists and a human runs reuse or waive
- **THEN** the command exits with an error and records nothing
