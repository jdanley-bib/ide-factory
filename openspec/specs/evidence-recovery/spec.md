# evidence-recovery Specification

## Purpose
Gives an accepted attempt whose red requirement turns out to be unmet one audited way back to review, without editing evidence, losing the original review, or fabricating a test failure.

## Requirements

### Requirement: Reopen an accepted attempt for named kinds
`idefactory attempt reopen` SHALL move an `accepted` attempt to `awaiting-review` for the check kinds it names, and only when each named kind lacks a satisfying red, method, or exception. It SHALL require `--for method` or `--for exception`, an identity different from the implementer, and a reason. A refused reopen SHALL leave the attempt byte-for-byte unchanged.

#### Scenario: Reopen for a missing red
- **WHEN** an accepted attempt has no red, method, or exception for `contract`
- **AND** `attempt reopen` names `contract` with `--for method`, an identity other than the implementer, and a reason
- **THEN** the attempt moves to `awaiting-review`

#### Scenario: Kind already satisfied
- **WHEN** the named kind already has a satisfying red, method, or exception
- **THEN** the reopen is refused naming that kind

#### Scenario: Wrong state
- **WHEN** the attempt is in any state other than `accepted`
- **THEN** the reopen is refused naming the state

### Requirement: Reopen preserves the original review
Reopen SHALL keep the original review verdict, reviewer identity, notes, and time unchanged in a review history, SHALL keep every stored red, verification, and exception record unchanged, and SHALL record who reopened, when, why, and for which kinds. The earlier verdict SHALL NOT count as a review of the amended evidence.

#### Scenario: History kept
- **WHEN** an attempt is reopened
- **THEN** the original verdict, reviewer, and notes are readable in the review history
- **AND** a new verdict is required before the attempt can be accepted again

#### Scenario: Evidence untouched
- **WHEN** an attempt is reopened
- **THEN** every stored red, verification, and exception record is byte-for-byte unchanged

### Requirement: Reopen is authorized by its purpose
A reopen for `method` SHALL need an identity different from the implementer and, under governance policy version 2, the same verified-principal rule that applies to a reviewer. A reopen for `exception` SHALL need the approver rules of a red exception, including a verified principal under policy version 2.

#### Scenario: Implementer cannot reopen
- **WHEN** the reopening identity equals the implementer
- **THEN** the reopen is refused

#### Scenario: Exception reopen under policy version 2
- **WHEN** policy version is 2 and the exception reopen names an approver that no verified principal confirms
- **THEN** the reopen is refused

### Requirement: Amendment is limited to the reopened kinds
While an attempt is reopened, reuse, waive, and method proposals SHALL be accepted only for the kinds the reopen named. An exception recorded this way SHALL count as a stuck signal and SHALL NOT need the not-stuck acknowledgment. Once the attempt returns to `accepted`, the reopen window SHALL close.

#### Scenario: Other kind refused
- **WHEN** a reopen names `contract` and a waiver is requested for `unit`
- **THEN** the waiver is refused and nothing is recorded

#### Scenario: No acknowledgment needed
- **WHEN** a waiver is requested for a reopened kind without `--acknowledge-not-stuck`
- **THEN** the waiver is recorded
- **AND** it marks `acknowledgedNotStuck` as false

#### Scenario: Window closes
- **WHEN** the reopened attempt is accepted again
- **THEN** a waiver for the reopened kind is refused unless the attempt is reopened again

### Requirement: Reopen is bounded
An attempt SHALL be reopened at most twice. A reopen SHALL be refused when a finalization journal exists or the attempt is `finalize-failed` or `finalized`. A refusal SHALL name the limit or state.

#### Scenario: Third reopen
- **WHEN** an attempt has been reopened twice and a third reopen is requested
- **THEN** the reopen is refused naming the limit

#### Scenario: Journal exists
- **WHEN** a finalization journal exists for the attempt
- **THEN** the reopen is refused naming the journal

### Requirement: Other gates stay in force
A reopen and the amendment it allows SHALL NOT waive a passing attestation at the current clean HEAD, a distinct reviewer, a security stage, a human gate, a lockout, or the retry cap.

#### Scenario: Review is required again
- **WHEN** the amendment is recorded and the attempt is still in `awaiting-review`
- **THEN** completion fails until a reviewer accepts the attempt

#### Scenario: Lockout still applies
- **WHEN** a lockout names the reviewer who would record the new verdict
- **THEN** that reviewer cannot record it

### Requirement: Reopens are visible and discoverable
Status, the reviewer packet, and the pull request verdict comment SHALL show each reopen with its time, identity, purpose, kinds, and reason, and the prior verdict. The error for a missing red at completion on an accepted attempt SHALL name `idefactory attempt reopen`.

#### Scenario: Reviewer sees the reopen
- **WHEN** a reviewer packet is rendered for a reopened attempt
- **THEN** it shows the reopen reason and kinds and the earlier verdict and reviewer

#### Scenario: Completion names the recovery
- **WHEN** completion fails on an accepted attempt because a red is missing
- **THEN** the error names `idefactory attempt reopen`
