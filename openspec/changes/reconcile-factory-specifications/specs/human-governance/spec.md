# Spec Delta

## MODIFIED Requirements

### Requirement: Golden rules file
The product SHALL install `.factory/governance.md` as the operational baseline, SHALL NOT create `GOLDEN_RULES.md`, and SHALL NOT overwrite a pre-existing human-owned `GOLDEN_RULES.md`.

#### Scenario: Governance baseline
- **WHEN** init runs in a project without factory state
- **THEN** `.factory/governance.md` exists and records approval, verification, memory, HALT, review, and queue rules
- **AND** init does not create `GOLDEN_RULES.md`

#### Scenario: Existing rules
- **WHEN** `GOLDEN_RULES.md` already exists and init runs
- **THEN** the existing file is unchanged
