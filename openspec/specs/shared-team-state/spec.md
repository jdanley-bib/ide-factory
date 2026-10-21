# shared-team-state Specification

## Purpose
Stores the roster, routing, decisions, and per-agent memory that Cursor, Copilot, and Claude Code share.

## Requirements

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

### Requirement: Append-only decisions
The system SHALL append human approvals and rejections to `.factory/decisions.md` and SHALL NOT truncate that file.

#### Scenario: Second approval
- **WHEN** two approvals are recorded
- **THEN** both decision entries are present in `decisions.md`

### Requirement: Machine work state
The system SHALL store the machine execution graph under `.factory/work/` and attempt evidence under `.factory/attempts/`.

#### Scenario: Initialized state
- **WHEN** init finishes
- **THEN** `.factory/work/index.json` and the attempts directory exist
