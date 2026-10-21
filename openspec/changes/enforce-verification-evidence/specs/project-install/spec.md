# Spec Delta

## ADDED Requirements

### Requirement: Install check registry
Init SHALL write a schema-valid versioned check registry when the project has none, and SHALL leave an existing registry byte-for-byte unchanged on reinstall.

#### Scenario: New project registry
- **WHEN** init runs in a directory that has no check registry
- **THEN** the project contains a schema-valid versioned check registry

#### Scenario: Existing registry survives
- **WHEN** a check registry already exists and init runs again
- **THEN** that registry is byte-for-byte unchanged
