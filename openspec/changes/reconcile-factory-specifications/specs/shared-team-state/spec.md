# Spec Delta

## MODIFIED Requirements

### Requirement: Default roster
The system SHALL record Lead, Architect, Engineer, Test Engineer, Security Reviewer, Reviewer, and Scribe in `.factory/team.md`, and Scribe SHALL be marked as not implementing product code.

#### Scenario: Default team file
- **WHEN** init finishes with the default preset
- **THEN** `team.md` names all seven roles
- **AND** Scribe is marked as not implementing product code

### Requirement: Isolated agent memory
The system SHALL store each active role's charter and history only under `.factory/agents/<id>/`.

#### Scenario: Engineer files
- **WHEN** init finishes
- **THEN** `.factory/agents/engineer/charter.md` and `.factory/agents/engineer/history.md` exist

#### Scenario: Role files
- **WHEN** init finishes
- **THEN** each role in the default roster has a charter and history under `.factory/agents/<id>/`

## ADDED Requirements

### Requirement: Machine work state
The system SHALL store the machine execution graph under `.factory/work/` and attempt evidence under `.factory/attempts/`.

#### Scenario: Initialized state
- **WHEN** init finishes
- **THEN** `.factory/work/index.json` and the attempts directory exist
