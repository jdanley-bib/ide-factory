# ide-adapters Specification

## Purpose
Installs the same factory skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code.

## Requirements

### Requirement: Shared command set
The system SHALL install status, plan, build, run, full, and review commands for Cursor, GitHub Copilot, and Claude Code.

#### Scenario: Command files
- **WHEN** init finishes
- **THEN** each supported IDE has adapter files for status, plan, build, run, full, and review
- **AND** each command directs the IDE to its corresponding factory skill

### Requirement: No model launcher
Installed factory skills SHALL tell the IDE session to do the work. Installed factory skills and commands SHALL NOT direct the CLI to launch a model process.

#### Scenario: Adapter instructions
- **WHEN** installed factory skills are inspected
- **THEN** they state that the IDE session model does the work
- **AND** installed factory skills and commands contain no instruction for the factory CLI to launch a model

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
