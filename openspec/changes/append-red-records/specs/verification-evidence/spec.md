## ADDED Requirements

### Requirement: Red records are append-only
Every failing red recorded for a check kind on an attempt SHALL be kept, in order, and SHALL NOT be replaced, edited, or deleted. The red that readers use for a kind SHALL be the most recent entry. A second red for a kind SHALL append and SHALL leave every earlier entry byte-for-byte unchanged.

#### Scenario: Second red appends
- **WHEN** `verify run --red` records a failing red for `unit` on an attempt that already holds one
- **THEN** both reds are kept in order
- **AND** the earlier red record is unchanged

#### Scenario: Current red is the latest
- **WHEN** an attempt holds two failing reds for `unit`
- **THEN** the gates and status read the later one as the current red

#### Scenario: Attempt without a history
- **WHEN** an attempt stored before this requirement holds one red for `unit`
- **THEN** it reads as a history with that single entry

### Requirement: Reds can be listed
`idefactory red list <attemptId>` SHALL print every red in the history for every kind with its digest, order, and time. For each it SHALL state whether it is the current red, whether an exception references its digest, and what satisfies red for that kind. With `--json` it SHALL print one JSON document with `schemaVersion` 1. It SHALL write nothing.

#### Scenario: List after an invalidation and a later red
- **WHEN** an attempt has an invalidated red and a later failing red for `unit`
- **THEN** the list shows both with their digests
- **AND** it marks the first as referenced by the waiver and the second as current

#### Scenario: Read-only
- **WHEN** `red list` runs
- **THEN** no file in the project changes
