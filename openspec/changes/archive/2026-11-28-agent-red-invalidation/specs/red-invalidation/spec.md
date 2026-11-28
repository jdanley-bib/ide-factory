## ADDED Requirements

### Requirement: An agent can withdraw a red that is not genuine
`idefactory red invalidate <attemptId> --kind <kind> --class <class> --note "<text>" --by <identity>` SHALL record that the attempt's current failing CLI red for that kind is not genuine. The class SHALL be `post-implementation` or `wrong-failure`. The command SHALL NOT modify the stored red.

#### Scenario: Red is invalidated
- **WHEN** an attempt holds a failing CLI red for `unit` and `red invalidate` runs with a class, a note, and an identity
- **THEN** an invalidation file is written naming the red's digest and the class
- **AND** the stored red record is unchanged

#### Scenario: No failing red
- **WHEN** the attempt has no failing CLI red for the kind
- **THEN** the command fails and writes nothing

#### Scenario: Unknown class
- **WHEN** the class is not `post-implementation` or `wrong-failure`
- **THEN** the command fails naming the allowed classes

#### Scenario: Missing required value
- **WHEN** `--note`, `--class`, `--kind`, or `--by` is missing
- **THEN** the command fails and writes nothing

### Requirement: Invalidation record
The invalidation SHALL name the attempt, change, task, kind, the invalidated red's digest, the class, the note, the identity, and the time. It SHALL be written once as an immutable file under `.factory/exceptions/red-invalid/`, bound to the attempt by a content digest. A missing, altered, or mismatched file SHALL NOT take effect.

#### Scenario: Record content
- **WHEN** an invalidation is recorded
- **THEN** the file holds the attempt id, kind, red digest, class, identity, and time

#### Scenario: Altered record
- **WHEN** an invalidation file no longer matches its stored digest
- **THEN** the red it names is treated as not invalidated

### Requirement: Invalidation grants nothing
An invalidated red SHALL NOT satisfy red, and an invalidation SHALL NOT satisfy red for its kind or for any other kind. After an invalidation the kind SHALL be satisfied only by a method covering it, an exception, or a later failing CLI red whose recorded start is after the invalidation and while the invalidated digest is still in the red history.

#### Scenario: Invalidated red does not satisfy
- **WHEN** the only red for `unit` is invalidated and the attempt moves toward `verifying`
- **THEN** the transition is refused naming `unit`

#### Scenario: Later red satisfies
- **WHEN** a failing `unit` red starts after the invalidation
- **THEN** red for `unit` is satisfied by that later red
- **AND** the invalidated red and the invalidation remain in the record

#### Scenario: Earlier red does not satisfy
- **WHEN** a failing `unit` red is stored whose start is before the invalidation and whose digest differs from the invalidated one
- **THEN** it does not satisfy red

### Requirement: Invalidation unblocks a method proposal
A stored failing red that has been invalidated SHALL NOT cause `method propose` to refuse a covered kind. A valid failing red SHALL still cause the refusal, and every other proposal refusal SHALL still apply.

#### Scenario: Proposal after invalidation
- **WHEN** the `unit` red is invalidated and an implementer proposes a `no-red` method for `unit` with a fitting reason class
- **THEN** the proposal is recorded

#### Scenario: Valid red still refuses
- **WHEN** the `unit` red is not invalidated and a proposal covers `unit`
- **THEN** the proposal is refused naming `unit`

### Requirement: Invalidations are limited per kind
A kind SHALL have at most two invalidations on an attempt. A further request SHALL be refused with a message that names the human waiver as the remaining exit, and SHALL write nothing.

#### Scenario: Third invalidation
- **WHEN** an attempt already has two invalidations for `unit`
- **THEN** a third `red invalidate` for `unit` is refused naming `red waive --invalid-red`

### Requirement: Invalidation does not displace exceptions
`red invalidate` SHALL refuse a kind that already has a reuse or waiver exception on the attempt. An invalidation SHALL NOT count toward the one-exception-per-kind rule, and a later human waiver for the kind SHALL remain possible.

#### Scenario: Kind already waived
- **WHEN** the attempt has a waiver exception for `unit`
- **THEN** `red invalidate` for `unit` is refused and writes nothing

#### Scenario: Waiver after invalidation
- **WHEN** a `unit` red was invalidated and a human then records an invalid-red waiver for `unit`
- **THEN** the waiver is recorded and the invalidation remains

### Requirement: Invalidation is not an identity gate
The identity for `red invalidate` SHALL be recorded and SHALL NOT be required to differ from the implementer or to match a verified principal. The command SHALL be refused while a file named `HALT` exists in the project root and SHALL require the writer lease.

#### Scenario: Implementer invalidates
- **WHEN** the identity equals the attempt's implementer
- **THEN** the invalidation is recorded with that identity

#### Scenario: Halt file
- **WHEN** `HALT` exists and `red invalidate` runs
- **THEN** it exits with an error and records nothing

### Requirement: Invalidations are visible
Status, the reviewer packet, and the pull-request verdict comment SHALL show each invalidation with its class, the invalidated red's digest, the identity, and the time, and SHALL say that a red ran and was withdrawn as not genuine. They SHALL show any later red or method beside it.

#### Scenario: Reviewer sees the invalidation
- **WHEN** a reviewer packet is rendered for an attempt with an invalidated `unit` red
- **THEN** it names the class, digest, and identity
- **AND** it says the red was withdrawn and does not satisfy red
