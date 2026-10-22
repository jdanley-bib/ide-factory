# Spec Delta

## Purpose

Fails CI when a secret or a SAST finding is present, without writing secret material into the job log.

## ADDED Requirements

### Requirement: Secret detection
The secret-scan job SHALL exit non-zero when its scanner reports a finding and SHALL exit zero when the scanned tree has no finding. The job log SHALL NOT contain the secret value.

#### Scenario: Seeded secret
- **WHEN** the secret scanner runs on a tree that contains a seeded high-confidence secret
- **THEN** the job exits non-zero
- **AND** the job log does not contain that secret value

#### Scenario: Clean tree
- **WHEN** the secret scanner runs on a tree with no finding
- **THEN** the job exits zero

### Requirement: Static analysis
The SAST job SHALL exit non-zero when its scanner reports a finding in the seeded fixture and SHALL NOT set `continue-on-error`.

#### Scenario: Seeded finding
- **WHEN** the SAST scanner runs on a fixture that contains a finding its ruleset detects
- **THEN** the job exits non-zero

#### Scenario: Error does not continue
- **WHEN** the SAST job is read from the workflow
- **THEN** that job does not set `continue-on-error`

### Requirement: Scanner action pins
Secret-scan and SAST workflows SHALL pin every third-party action to a full commit SHA.

#### Scenario: Pinned scanner actions
- **WHEN** either security workflow references a third-party action
- **THEN** the reference is a full commit SHA
