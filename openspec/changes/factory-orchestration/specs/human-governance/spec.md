# human-governance Delta

## REMOVED Requirements

### Requirement: Golden rules file
~~The product SHALL ship a `GOLDEN_RULES.md` that forbids autonomous web ideation, Ollama, unapproved spend, and publishing, and init SHALL NOT overwrite an existing `GOLDEN_RULES.md`.~~

## ADDED Requirements

### Requirement: Governance baseline
The product SHALL ship an operational baseline in `.factory/governance.md` covering human-authored OpenSpec, IDE models only, approve-before publish/spend, honest verification, append-only memory, and HALT. Init SHALL write that file when missing and SHALL NOT create a root `GOLDEN_RULES.md`.

#### Scenario: Init without golden rules
- **WHEN** init runs in a new project
- **THEN** `.factory/governance.md` exists and `GOLDEN_RULES.md` is not created by init

#### Scenario: Existing golden rules left alone
- **WHEN** `GOLDEN_RULES.md` already exists and init runs
- **THEN** the existing `GOLDEN_RULES.md` file is unchanged
