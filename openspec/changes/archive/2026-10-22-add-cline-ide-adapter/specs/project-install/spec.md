# Spec Delta

## MODIFIED Requirements

### Requirement: Install shared state and adapters
The system SHALL create `.factory/` team state and Cursor, GitHub Copilot, Claude Code, and Cline instruction files when `idefactory init` runs in a project.

#### Scenario: New project
- **WHEN** init runs in a directory that has no `.factory/`
- **THEN** the directory contains `.factory/team.md`, `.factory/routing.md`, `.factory/decisions.md`, `.factory/config.json`, a Cursor rule, a Cursor skill named `factory-coordinator`, a Copilot agent file, and a Claude Code skill named `factory-coordinator`

#### Scenario: Existing unrelated files
- **WHEN** init runs in a directory that already contains an application file
- **THEN** that application file is unchanged

#### Scenario: Cline adapter files
- **WHEN** init runs in a directory that has no `.factory/`
- **THEN** the directory contains `.cline/rules/factory.md`, `.cline/skills/factory-coordinator/SKILL.md`, and `.cline/workflows/factory-status.md`

## ADDED Requirements

### Requirement: Preserve unrelated Cline files
Init and upgrade SHALL NOT modify an existing `.cline/` file that the factory does not own.

#### Scenario: Team style rule
- **WHEN** `.cline/rules/team-style.md` already exists and init runs
- **THEN** that file is byte-for-byte unchanged

#### Scenario: Upgrade leaves a team file
- **WHEN** `.cline/rules/team-style.md` already exists and upgrade runs
- **THEN** that file is byte-for-byte unchanged

### Requirement: Instruction section names Cline
The marked factory instruction section SHALL name the Cline factory rule.

#### Scenario: Agents section
- **WHEN** init merges the factory section into `AGENTS.md`
- **THEN** that section names `.cline/rules/factory.md`
