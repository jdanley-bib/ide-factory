# Spec Delta

## ADDED Requirements

### Requirement: Skills point to CLI help
The installed `factory-build`, `factory-run`, `factory-verify`, `factory-tdd`, and `factory-governance` skills SHALL tell the session to run `idefactory help <command>` for usage and the evidence schema of a factory command, and not to read the CLI implementation to learn them. Every installed copy of each skill SHALL carry the same wording.

#### Scenario: Build skill names help
- **WHEN** the installed `factory-build` skill is read
- **THEN** it tells the session to run `idefactory help attempt transition` for the states and evidence keys
- **AND** it tells the session not to read the CLI source for usage

#### Scenario: Every skill in the list points to help
- **WHEN** the installed `factory-run`, `factory-verify`, `factory-tdd`, and `factory-governance` skills are read
- **THEN** each one names `idefactory help` as the place to learn command usage

#### Scenario: Every copy carries the wording
- **WHEN** the skill copies for the Cursor, Claude, GitHub, Agents, and Cline adapters are compared with the template
- **THEN** each copy has the same help guidance as the template

#### Scenario: Upgrade delivers the wording
- **WHEN** a project installed before this change runs `idefactory upgrade`
- **THEN** its unmodified skill copies are replaced with the versions that point to help
- **AND** a skill copy the project changed or pinned is left alone and reported
