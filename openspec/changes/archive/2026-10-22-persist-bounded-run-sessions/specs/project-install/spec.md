# Spec Delta

## ADDED Requirements

### Requirement: Run budget defaults
When init creates `.factory/config.json`, that file SHALL include positive integer defaults for maximum agent steps, completed tasks, wall-clock duration, and tool failures. When `.factory/config.json` already exists, init SHALL leave it byte-for-byte unchanged.

#### Scenario: New project budgets
- **WHEN** init runs in a directory that has no factory config
- **THEN** the new config sets a positive maximum for agent steps, completed tasks, wall-clock duration, and tool failures

#### Scenario: Existing config preserved
- **WHEN** `.factory/config.json` already exists and init runs again
- **THEN** that file is byte-for-byte unchanged
