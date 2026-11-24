# Spec Delta

## MODIFIED Requirements

### Requirement: Upgrade refreshes adapters only
`idefactory upgrade` SHALL refresh factory-owned adapter files, including the Cline rule, Cline skills, and Cline workflow commands, only when they are unmodified relative to a known baseline, and SHALL preserve and report an edited file instead of replacing it. Upgrade SHALL NOT replace an existing decisions log.

#### Scenario: Upgrade keeps decisions
- **WHEN** `decisions.md` has a custom entry and upgrade runs
- **THEN** the custom entry remains

#### Scenario: Upgrade refreshes a Cline skill
- **WHEN** a factory-owned file under `.cline/skills/` matches an earlier factory rendering and upgrade runs
- **THEN** that file matches the current factory skill again
- **AND** the custom decisions entry remains

#### Scenario: Upgrade preserves an edited Cline skill
- **WHEN** a factory-owned file under `.cline/skills/` holds project edits, its template changed, and upgrade runs
- **THEN** that file is byte-for-byte unchanged
- **AND** the upgrade report lists it as preserved
