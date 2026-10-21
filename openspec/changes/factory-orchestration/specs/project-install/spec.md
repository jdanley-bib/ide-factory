# project-install Delta

## MODIFIED Requirements

### Requirement: Init creates factory state
`idefactory init` SHALL create `.factory/` team state including governance baseline, profiles, and work directory scaffolding, and SHALL NOT create root `GOLDEN_RULES.md`.

#### Scenario: Fresh init
- **WHEN** init runs in an empty directory
- **THEN** `.factory/governance.md`, `.factory/profiles.json`, and `.factory/work/` exist and `GOLDEN_RULES.md` was not created by init

### Requirement: Leave squad untouched
The system SHALL NOT create, modify, or delete a `.squad/` directory.

#### Scenario: Existing squad
- **WHEN** `.squad/team.md` exists and init runs
- **THEN** `.squad/team.md` is byte-for-byte unchanged

## ADDED Requirements

### Requirement: Doctor without backlog
`idefactory doctor` SHALL NOT require a `backlog/` directory or Backlog.md CLI to report healthy after init.

#### Scenario: Healthy without backlog
- **WHEN** doctor runs after init with no `backlog/` directory
- **THEN** the exit code is zero
