## ADDED Requirements

### Requirement: Exception kinds come from the full requirement set
A red exception SHALL be eligible for any test kind in the item's resolved requirement set, including a kind that only the verification profile adds. An exception for a kind outside that set SHALL be refused.

#### Scenario: Waiver for a profile-derived kind
- **WHEN** an item lists only `unit`, its profile also requires `contract`, and the attempt is before verifying
- **AND** a human waives `contract`
- **THEN** the waiver is recorded for `contract`

#### Scenario: Kind outside the set
- **WHEN** a human waives a kind that neither the item nor its profile requires
- **THEN** the command refuses and records nothing
