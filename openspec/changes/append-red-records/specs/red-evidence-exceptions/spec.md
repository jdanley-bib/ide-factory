## MODIFIED Requirements

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

## ADDED Requirements

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
