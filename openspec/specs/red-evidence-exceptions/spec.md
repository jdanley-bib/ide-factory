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
`idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>` SHALL record a reuse exception only when the source attempt is an earlier, `rejected` attempt for the same change and task as the target, and holds a valid failing CLI red for each named kind. The target SHALL be a `code` attempt that has not entered `verifying`, or an attempt reopened for each named kind under the evidence-recovery capability, and each kind SHALL be a required test kind of its work item.

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

#### Scenario: Reopened target
- **WHEN** the target attempt was reopened for `unit` and the other conditions hold
- **THEN** reuse for `unit` is recorded on the target attempt

#### Scenario: Reopened for a different kind
- **WHEN** the target attempt was reopened for `contract` and reuse names `unit`
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
`idefactory red waive <targetAttemptId> --kind <kind>` SHALL record a waiver exception for a `code` attempt that has not entered `verifying`, or that was reopened for that kind under the evidence-recovery capability, without requiring a source attempt or any earlier red. The waiver SHALL record that no red exists for that kind, the reason, and the approver. It SHALL be available to a human at any time, subject to the stuck warning.

#### Scenario: Waiver after a stuck signal
- **WHEN** the target attempt has a recorded `vacuous-red` for the kind
- **AND** a human runs waive with an approver and a reason
- **THEN** a waiver exception is recorded for that kind on that attempt
- **AND** the waiver file states that no red exists for the kind

#### Scenario: Waiver needs a reason
- **WHEN** waive runs with no reason
- **THEN** it fails and records nothing

#### Scenario: Waiver on a reopened attempt
- **WHEN** the target attempt was reopened for the kind and a human runs waive with an approver and a reason
- **THEN** a waiver exception is recorded for that kind on that attempt

#### Scenario: Waiver on an accepted attempt that was not reopened
- **WHEN** the target attempt is `accepted` and was not reopened
- **THEN** waive fails and the error names `idefactory attempt reopen`

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
An exception SHALL NOT waive a passing attestation at the current clean HEAD, a distinct reviewer, a security stage, a human gate, a lockout, the retry cap, or the `code` classification, and SHALL NOT alter the rejected attempt or its evidence. It SHALL NOT edit a run session file. A closed `vacuous-red` session SHALL reopen on the next run once its stop condition is resolved, and not before.

#### Scenario: Completion still needs clean passing evidence
- **WHEN** an attempt with a valid exception completes with a stale or missing passing attestation
- **THEN** complete fails

#### Scenario: Review is still independent
- **WHEN** the reviewer identifier equals the implementer identifier on an attempt with an exception
- **THEN** completion fails

#### Scenario: Run session stays closed
- **WHEN** the latest run session stopped for `vacuous-red` and a waiver is then recorded
- **THEN** the session file bytes are unchanged until the next run evaluates it
- **AND** the next run reopens the session because the waiver resolves the stop

### Requirement: Exceptions are visible
Status, the reviewer packet, and the pull-request verdict comment for an attempt SHALL name each exception with its type, kind, approver, and reason. For a waiver or reuse, they SHALL say that no red ran on that attempt for that kind. For an invalidated red, they SHALL name the invalidated red's digest and the invalid-red reason, and SHALL say that a red ran but does not satisfy red. A waiver acknowledged before a stuck signal SHALL be marked.

#### Scenario: Reviewer sees the waiver
- **WHEN** a reviewer packet is printed for an attempt with a waiver for `unit`
- **THEN** it states that no red ran for `unit` and names the approver and reason

#### Scenario: Reviewer sees an invalidated red
- **WHEN** a reviewer packet is printed for an attempt whose `unit` red was invalidated
- **THEN** it names the invalidated red's digest and the invalid-red reason
- **AND** it states that the red does not satisfy red for `unit`

### Requirement: Post-implementation red is invalidated by a human
A failing CLI red recorded after implementation work began is not test-first evidence. The CLI cannot detect one, so a human SHALL invalidate it with `idefactory red waive --invalid-red "<reason>"` on the same attempt. The waiver SHALL name the invalidated red by digest and the reason, SHALL record that a red ran but is not genuine, and the invalidated red SHALL NOT satisfy red.

#### Scenario: Invalidated red is waived
- **WHEN** the target attempt holds a failing CLI red for `unit`
- **AND** a human runs waive for `unit` with `--invalid-red`, `--acknowledge-not-stuck`, a note, and an approver
- **THEN** a waiver is recorded for `unit` on that attempt
- **AND** the waiver names the invalidated red's record digest and the invalid-red reason
- **AND** the waiver records `noRedExists` as false
- **AND** the stored failing red record is unchanged

#### Scenario: Invalid-red waiver needs a failing red
- **WHEN** waive runs with `--invalid-red` for a kind with no failing CLI red on the target attempt
- **THEN** the command exits non-zero and records nothing

#### Scenario: Invalid-red waiver needs acknowledgment
- **WHEN** waive runs with `--invalid-red` and without `--acknowledge-not-stuck`
- **THEN** the command refuses, prints the stuck warning, and records nothing

#### Scenario: Invalid-red flag without a reason
- **WHEN** waive runs with `--invalid-red` and no value
- **THEN** the command exits non-zero naming `--invalid-red` and records nothing

### Requirement: Invalidated red stays invalid
An invalidated red SHALL satisfy red only through its bound waiver while the invalidated digest is present in the red history and is the current red. `verify run --red` SHALL refuse a kind that already has a reuse exception or an ordinary waiver on the attempt. For a kind with an invalid-red waiver, it SHALL append one later red as the later-red requirement describes. A red whose digest differs from the bound digest SHALL NOT satisfy red through the waiver.

#### Scenario: Replacement red refused
- **WHEN** an attempt already has a reuse exception or an ordinary waiver for `unit`
- **AND** `verify run --red` runs for `unit` on that attempt
- **THEN** the command refuses and stores no new red

#### Scenario: Waiver satisfies red while the red is unchanged
- **WHEN** an invalidated red for `unit` is still the current red with its bound digest
- **THEN** red for `unit` is satisfied through the waiver
- **AND** the transition into `verifying` is not blocked by `unit`

#### Scenario: Altered invalidated red
- **WHEN** the stored red record for `unit` no longer matches the digest bound by the waiver and the history has no entry with that digest
- **THEN** red for `unit` is not satisfied
- **AND** the transition into `verifying` is rejected

### Requirement: Waiver refused over an existing red
`red waive` without `--invalid-red` SHALL refuse a kind for which a failing CLI red is stored. The refusal SHALL name that red, SHALL point to `red invalidate` for a red that is not genuine, and SHALL point to `--invalid-red` for a human acceptance of such a red. It SHALL record nothing.

#### Scenario: Waiver over a genuine red
- **WHEN** waive runs for `unit` on an attempt with a failing CLI red for `unit` and without `--invalid-red`
- **THEN** the command exits non-zero, names the existing red, and names `--invalid-red`
- **AND** no exception file is written and the attempt is unchanged

#### Scenario: Refusal names the agent command
- **WHEN** the same refusal is printed
- **THEN** it also names `red invalidate`

### Requirement: Reuse needs a valid source red
`red reuse` SHALL refuse a source attempt whose red for a named kind does not satisfy red on that source attempt, including a red invalidated on the source.

#### Scenario: Reuse of an invalidated source red
- **WHEN** the rejected source attempt's red for `unit` was invalidated by a waiver
- **AND** a human runs reuse for `unit` from a later attempt for the same task
- **THEN** reuse fails and records nothing

### Requirement: Guidance matches the waiver rules
The help for `red waive`, the README, and the shipped `factory-build`, `factory-tdd`, `factory-verify`, and governance guidance SHALL name `--invalid-red` and `red invalidate`, SHALL state that a post-implementation red is invalidated and not treated as genuine, and SHALL state that a waiver does not replace passing verification, distinct review, or lockouts.

#### Scenario: Help names the flags
- **WHEN** `idefactory help red waive` runs
- **THEN** its output names `--invalid-red` and `--acknowledge-not-stuck`

#### Scenario: Shipped copies name the flag
- **WHEN** each shipped copy of the `factory-build` skill is read
- **THEN** it names `--invalid-red` and `red invalidate` and states that a waiver does not replace passing verification, distinct review, or lockouts

### Requirement: Halt blocks exceptions
When a file named `HALT` exists in the project root, reuse and waive SHALL refuse to mutate factory state.

#### Scenario: Halt file
- **WHEN** `HALT` exists and a human runs reuse or waive
- **THEN** the command exits with an error and records nothing

### Requirement: Exception kinds come from the full requirement set
A red exception SHALL be eligible for any test kind in the item's resolved requirement set, including a kind that only the verification profile adds. An exception for a kind outside that set SHALL be refused.

#### Scenario: Waiver for a profile-derived kind
- **WHEN** an item lists only `unit`, its profile also requires `contract`, and the attempt is before verifying
- **AND** a human waives `contract`
- **THEN** the waiver is recorded for `contract`

#### Scenario: Kind outside the set
- **WHEN** a human waives a kind that neither the item nor its profile requires
- **THEN** the command refuses and records nothing

### Requirement: A later red after invalidation
After an invalid-red waiver for a kind, `verify run --red` SHALL append one later failing red for that kind. That red SHALL satisfy red for the kind only when it is a failing CLI red whose recorded start is after the waiver's issuance and the history still holds the invalidated digest. A satisfied kind SHALL report its source as the CLI red, not the waiver. The invalidated red and the waiver SHALL remain in the record.

#### Scenario: Later red satisfies red
- **WHEN** a waiver invalidated the `unit` red and a later failing `unit` red is appended with a start after the waiver
- **THEN** red for `unit` is satisfied by the later CLI red
- **AND** the invalidated red and the waiver are unchanged

#### Scenario: Red recorded before the waiver
- **WHEN** a failing `unit` red is stored whose start is before the waiver's issuance and whose digest differs from the invalidated one
- **THEN** it does not satisfy red through the later-red rule

#### Scenario: Invalidated record missing from history
- **WHEN** the history no longer holds the digest the waiver names
- **THEN** red for `unit` is not satisfied

#### Scenario: Second invalidation refused
- **WHEN** the later red is itself post-implementation and a human requests another invalid-red waiver for `unit`
- **THEN** the command refuses naming the existing exception and records nothing

### Requirement: Both records are shown
Status, the reviewer packet, and the pull request verdict comment SHALL show an invalidated red and any later red together, naming each digest, the invalid-red reason and approver, and the later red's start. They SHALL NOT describe the later red as proof that the test came first.

#### Scenario: Reviewer sees both
- **WHEN** a reviewer packet is rendered for an attempt with an invalidated red and a later red for `unit`
- **THEN** it names both digests, the reason, and the approver
- **AND** it says the reviewer relies on the recorded evidence to judge whether the later red preceded the implementation it tests
