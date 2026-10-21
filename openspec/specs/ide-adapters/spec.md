# ide-adapters Specification

## Purpose
Installs the same factory skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code.

## Requirements

### Requirement: Shared command set
The system SHALL install status, plan, build, and review commands for Cursor, GitHub Copilot, and Claude Code.

#### Scenario: Command files
- **WHEN** init finishes
- **THEN** `.cursor/commands/factory-build.md`, `.github/prompts/factory-build.prompt.md`, and `.claude/commands/factory-build.md` exist and each tells the agent to follow the factory-build skill

### Requirement: No model launcher
Installed factory instructions SHALL tell the IDE session to do the work.

### Requirement: Narrow activation
The Cursor rule SHALL tell the agent to follow factory skills when the human asks the factory to plan, build, review, or report status, and SHALL tell the agent to stay out of unrelated work.

#### Scenario: Rule file
- **WHEN** `.cursor/rules/factory.mdc` is read
- **THEN** it states that unrelated requests are left alone

### Requirement: Upgrade refreshes adapters only
`idefactory upgrade` SHALL refresh factory-owned adapter files and SHALL NOT replace an existing decisions log.

#### Scenario: Upgrade keeps decisions
- **WHEN** `decisions.md` has a custom entry and upgrade runs
- **THEN** the custom entry remains
