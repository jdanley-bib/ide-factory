## ADDED Requirements

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
An invalidated red SHALL satisfy red only through its bound waiver while the stored red record still has the invalidated digest. `verify run --red` SHALL refuse a kind that already has an exception on the attempt. A red whose digest differs from the bound digest SHALL NOT satisfy red.

#### Scenario: Replacement red refused
- **WHEN** an attempt already has an exception for `unit`
- **AND** `verify run --red` runs for `unit` on that attempt
- **THEN** the command refuses and stores no new red

#### Scenario: Waiver satisfies red while the red is unchanged
- **WHEN** an invalidated red for `unit` is still stored with its bound digest
- **THEN** red for `unit` is satisfied through the waiver
- **AND** the transition into `verifying` is not blocked by `unit`

#### Scenario: Altered invalidated red
- **WHEN** the stored red record for `unit` no longer matches the digest bound by the waiver
- **THEN** red for `unit` is not satisfied
- **AND** the transition into `verifying` is rejected

### Requirement: Waiver refused over an existing red
`red waive` without `--invalid-red` SHALL refuse a kind for which a failing CLI red is stored. The refusal SHALL name that red and SHALL point to `--invalid-red` for a post-implementation red. It SHALL record nothing.

#### Scenario: Waiver over a genuine red
- **WHEN** waive runs for `unit` on an attempt with a failing CLI red for `unit` and without `--invalid-red`
- **THEN** the command exits non-zero, names the existing red, and names `--invalid-red`
- **AND** no exception file is written and the attempt is unchanged

### Requirement: Reuse needs a valid source red
`red reuse` SHALL refuse a source attempt whose red for a named kind does not satisfy red on that source attempt, including a red invalidated on the source.

#### Scenario: Reuse of an invalidated source red
- **WHEN** the rejected source attempt's red for `unit` was invalidated by a waiver
- **AND** a human runs reuse for `unit` from a later attempt for the same task
- **THEN** reuse fails and records nothing

### Requirement: Guidance matches the waiver rules
The help for `red waive`, the README, and the shipped `factory-build`, `factory-tdd`, `factory-verify`, and governance guidance SHALL name `--invalid-red`, SHALL state that a post-implementation red is invalidated and not treated as genuine, and SHALL state that a waiver does not replace passing verification, distinct review, or lockouts.

#### Scenario: Help names the flags
- **WHEN** `idefactory help red waive` runs
- **THEN** its output names `--invalid-red` and `--acknowledge-not-stuck`

#### Scenario: Shipped copies name the flag
- **WHEN** each shipped copy of the `factory-build` skill is read
- **THEN** it names `--invalid-red` and states that a waiver does not replace passing verification, distinct review, or lockouts

## MODIFIED Requirements

### Requirement: Exceptions are visible
Status, the reviewer packet, and the pull-request verdict comment for an attempt SHALL name each exception with its type, kind, approver, and reason. For a waiver or reuse, they SHALL say that no red ran on that attempt for that kind. For an invalidated red, they SHALL name the invalidated red's digest and the invalid-red reason, and SHALL say that a red ran but does not satisfy red. A waiver acknowledged before a stuck signal SHALL be marked.

#### Scenario: Reviewer sees the waiver
- **WHEN** a reviewer packet is printed for an attempt with a waiver for `unit`
- **THEN** it states that no red ran for `unit` and names the approver and reason

#### Scenario: Reviewer sees an invalidated red
- **WHEN** a reviewer packet is printed for an attempt whose `unit` red was invalidated
- **THEN** it names the invalidated red's digest and the invalid-red reason
- **AND** it states that the red does not satisfy red for `unit`
