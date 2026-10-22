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
The SAST command SHALL invoke Semgrep with `--error`, `--metrics=off`, and `p/javascript`. When Semgrep is absent and `--skip-semgrep` is not set, the command and CI job SHALL exit non-zero and SHALL NOT download Semgrep. The CI job SHALL NOT set `continue-on-error` or pass `--skip-semgrep`.

#### Scenario: Missing scanner
- **WHEN** the SAST command runs without `--skip-semgrep` and Semgrep is not installed
- **THEN** it exits non-zero
- **AND** it does not download Semgrep

#### Scenario: CI does not skip or install
- **WHEN** the SAST job is read from the workflow
- **THEN** it does not pass `--skip-semgrep` or install Semgrep
- **AND** it does not set `continue-on-error`

### Requirement: Explicit Semgrep skip
`--skip-semgrep` SHALL skip the scan, print a warning that names the skip, and record the skip. The baseline CI job SHALL NOT pass `--skip-semgrep`.

#### Scenario: Skip is explicit
- **WHEN** the SAST command is run with `--skip-semgrep`
- **THEN** it exits zero
- **AND** its output warns that the Semgrep scan was skipped
- **AND** its output records the skip

#### Scenario: Baseline does not skip
- **WHEN** the baseline CI job is read from the workflow
- **THEN** it does not pass `--skip-semgrep`

### Requirement: Tests do not download scanners
`npm test` SHALL pass when Semgrep is not installed. The test run SHALL NOT download Semgrep or any other tool.

#### Scenario: Suite without Semgrep
- **WHEN** `npm test` runs without Semgrep installed
- **THEN** it exits zero
- **AND** it does not download a tool

### Requirement: Scanner action pins
Secret-scan and SAST workflows SHALL pin every third-party action to a full commit SHA.

#### Scenario: Pinned scanner actions
- **WHEN** either security workflow references a third-party action
- **THEN** the reference is a full commit SHA
