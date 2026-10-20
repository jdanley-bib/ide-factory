# shared-team-state Specification

## Purpose
Stores the roster, routing, decisions, and per-agent memory that Cursor, Copilot, and Claude Code share.

## Requirements

### Requirement: Default roster
The system SHALL record Lead, Architect, Engineer, Reviewer, and Scribe in `.factory/team.md`, and Scribe SHALL be marked as not implementing product code.

#### Scenario: Default team file
- **WHEN** init finishes with the default preset
- **THEN** `team.md` names Lead, Architect, Engineer, Reviewer, and Scribe

### Requirement: Isolated agent memory
The system SHALL store each agent's charter and history only under `.factory/agents/<id>/`.

#### Scenario: Engineer files
- **WHEN** init finishes
- **THEN** `.factory/agents/engineer/charter.md` and `.factory/agents/engineer/history.md` exist

### Requirement: Append-only decisions
The system SHALL append human approvals and rejections to `.factory/decisions.md` and SHALL NOT truncate that file.

#### Scenario: Second approval
- **WHEN** two approvals are recorded
- **THEN** both decision entries are present in `decisions.md`
