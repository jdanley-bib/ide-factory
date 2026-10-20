# human-governance Specification

## Purpose
Records human approvals for spend and publishing, and reports whether a factory install is complete.

## Requirements

### Requirement: Approval record
`idefactory approve` SHALL write an approval file under `.factory/approvals/` and an entry in `.factory/decisions.md`, and SHALL NOT publish, deploy, or spend.

#### Scenario: Approve
- **WHEN** approve runs with an id and a note
- **THEN** an approval file containing the note exists and `decisions.md` contains the id

### Requirement: Rejection record
`idefactory reject` SHALL record the rejection in `decisions.md`.

#### Scenario: Reject
- **WHEN** reject runs with an id
- **THEN** `decisions.md` contains a rejected entry for that id

### Requirement: Reviewer lockout note
`idefactory lockout` SHALL write a note under `.factory/orchestration/` naming the agent and the reason, and SHALL NOT delete product files.

#### Scenario: Lockout file
- **WHEN** lockout runs with an agent and a reason
- **THEN** `.factory/orchestration/` contains a note naming that agent and the reason

### Requirement: Doctor
`idefactory doctor` SHALL exit non-zero when `.factory/` or the factory-coordinator skill is missing, and SHALL exit zero when init has completed and the required files exist.

#### Scenario: Missing install
- **WHEN** doctor runs in an empty directory
- **THEN** the exit code is non-zero

#### Scenario: Healthy install
- **WHEN** doctor runs after init
- **THEN** the exit code is zero

### Requirement: Golden rules file
The product SHALL ship a `GOLDEN_RULES.md` that forbids autonomous web ideation, Ollama, unapproved spend, and publishing, and init SHALL NOT overwrite an existing `GOLDEN_RULES.md`.

#### Scenario: Existing rules
- **WHEN** `GOLDEN_RULES.md` already exists and init runs
- **THEN** the existing file is unchanged
