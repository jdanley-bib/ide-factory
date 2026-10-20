# Spec Delta

## Purpose

Installs factory team memory and IDE instructions into a new or existing software project without discarding work already there.

## ADDED Requirements

### Requirement: Install shared state and adapters
The system SHALL create `.factory/` team state and Cursor, GitHub Copilot, and Claude Code instruction files when `idefactory init` runs in a project.

#### Scenario: New project
- **WHEN** init runs in a directory that has no `.factory/`
- **THEN** the directory contains `.factory/team.md`, `.factory/routing.md`, `.factory/decisions.md`, `.factory/config.json`, a Cursor rule, a Cursor skill named `factory-coordinator`, a Copilot agent file, and a Claude Code skill named `factory-coordinator`

#### Scenario: Existing unrelated files
- **WHEN** init runs in a directory that already contains an application file
- **THEN** that application file is unchanged

### Requirement: Preserve team memory on reinstall
The system SHALL keep an existing non-empty `.factory/decisions.md` and an existing agent history that contains a session note when init runs again.

#### Scenario: Decisions survive
- **WHEN** `decisions.md` already contains an accepted decision and init runs again
- **THEN** that decision text is still present

#### Scenario: History survives
- **WHEN** an agent history contains a session note and init runs again
- **THEN** that session note is still present

### Requirement: Merge instruction files
The system SHALL insert a marked factory section into an existing `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` and SHALL NOT replace the rest of that file.

#### Scenario: Existing AGENTS.md
- **WHEN** `AGENTS.md` already contains project text and init runs
- **THEN** the project text remains and a factory section delimited for idefactory is present

### Requirement: Leave other team systems alone
The system SHALL NOT create, modify, or delete a `.squad/` directory.

#### Scenario: Squad directory present
- **WHEN** `.squad/team.md` exists and init runs
- **THEN** `.squad/team.md` is byte-for-byte unchanged
