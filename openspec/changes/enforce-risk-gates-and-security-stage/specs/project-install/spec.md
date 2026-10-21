# Spec Delta

## ADDED Requirements

### Requirement: Profile human gates
A new init SHALL write `profiles.json` with `release.humanGate` true and `security-sensitive.humanGate` true. A later init SHALL leave an existing `profiles.json` byte-for-byte unchanged.

#### Scenario: New install gates
- **WHEN** init runs in a project that has no `profiles.json`
- **THEN** `release.humanGate` is true
- **AND** `security-sensitive.humanGate` is true

#### Scenario: Existing profiles survive
- **WHEN** `profiles.json` already exists and init runs again
- **THEN** that file is byte-for-byte unchanged
