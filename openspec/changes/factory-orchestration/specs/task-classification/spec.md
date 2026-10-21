# task-classification Specification

## Purpose
Attaches machine-readable factory metadata to work items and selects roles, checks, and model profiles.

## Requirements

### Requirement: Optional factory metadata on OpenSpec tasks
`sync-tasks` SHALL parse an optional YAML `factory:` block under each checkbox and store it on the work item.

#### Scenario: Explicit metadata
- **WHEN** a checkbox has `factory.kind: frontend` and `factory.dependencies: ["1.1"]`
- **THEN** the work item stores that kind and depends on work item `1.1` for the same change

### Requirement: Default inference
When metadata is absent, the system SHALL infer kind, roles, checks, and modelProfile from the task title and body using documented heuristics.

#### Scenario: Architect keyword
- **WHEN** a task title contains "production architecture"
- **THEN** the work item roles include architect

### Requirement: Dependency readiness
`next` and `run` SHALL only select a todo work item whose dependencies are all done.

#### Scenario: Blocked by dependency
- **WHEN** item `1.2` depends on `1.1` and `1.1` is todo
- **THEN** `1.2` is not selected as the next ready item

### Requirement: Verification profiles
The system SHALL map work items to a verification profile that lists required check kinds, and complete SHALL require those checks in evidence.

#### Scenario: Security profile
- **WHEN** a work item uses securityProfile security-sensitive
- **THEN** complete refuses without security check evidence
