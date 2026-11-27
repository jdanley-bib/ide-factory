## ADDED Requirements

### Requirement: Run checks setup first
`run` and `next` SHALL check setup readiness before opening a session or running a baseline. When a test decision is missing, or a principal verifier is missing under policy version 2, they SHALL stop with a blocked report with invariant `setup-incomplete`, SHALL NOT create a session, SHALL NOT consume an agent step, and SHALL name every gap. The check SHALL apply only inside a factory project.

#### Scenario: Missing test decision
- **WHEN** `run` starts in a factory project with no recorded test decision
- **THEN** it stops with invariant `setup-incomplete`
- **AND** no session file is created

#### Scenario: Both gaps
- **WHEN** the test decision and the principal verifier are both missing under policy version 2
- **THEN** the report names both gaps

#### Scenario: Decision recorded
- **WHEN** a test decision exists and policy gaps are absent
- **THEN** `run` proceeds exactly as before

#### Scenario: Outside a factory project
- **WHEN** `run` starts where `.factory/` does not exist
- **THEN** it fails with its existing error and not with `setup-incomplete`
