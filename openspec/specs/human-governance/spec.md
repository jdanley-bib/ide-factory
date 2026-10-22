# human-governance Specification

## Purpose
Records human approvals for spend and publishing, and reports whether a factory install is complete.

## Requirements

### Requirement: Approval record
`idefactory approve` SHALL write a scoped approval file under `.factory/approvals/` and an entry in `.factory/decisions.md`, and SHALL NOT publish, deploy, or spend. The file SHALL contain the note plus the change, task, source revision, action, approver, issuance, expiry, and policy version. When any scope field is missing, the command SHALL write no approval file and SHALL NOT append `decisions.md`.

#### Scenario: Approve
- **WHEN** approve runs with an id, a note, and every scope field
- **THEN** an approval file containing the note exists and `decisions.md` contains the id

#### Scenario: Incomplete approval
- **WHEN** approve runs with an id and a note and omits a scope field
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry for that id

### Requirement: Rejection record
`idefactory reject` SHALL record the rejection in `decisions.md`.

#### Scenario: Reject
- **WHEN** reject runs with an id
- **THEN** `decisions.md` contains a rejected entry for that id

### Requirement: Reviewer lockout note
`idefactory lockout` SHALL create a versioned lockout with immutable creation data naming its id, agent, reviewer, reason, and time, and SHALL NOT delete product files. An active lockout SHALL block completion. `idefactory lockout resolve <id>` SHALL require a resolver distinct from the locked agent and a reason, and SHALL write one immutable resolution event instead of deleting creation history.

#### Scenario: Lockout file
- **WHEN** lockout runs with an agent and a reason
- **THEN** `.factory/orchestration/lockouts/` contains creation data naming that agent and a printed lockout id
- **AND** completion is blocked while no resolution event exists

#### Scenario: Resolve lockout
- **WHEN** lockout resolve runs for an active id with a distinct resolver and a reason
- **THEN** one resolution event names the resolver, reason, and time
- **AND** that lockout no longer blocks completion

#### Scenario: Idempotent resolution
- **WHEN** the same resolution command is repeated with the same resolver and reason
- **THEN** it succeeds without writing a second resolution event

#### Scenario: Conflicting resolution
- **WHEN** a resolved lockout is resolved with a different resolver or reason
- **THEN** the command exits with an error and preserves both existing event files

#### Scenario: Legacy lockout resolution
- **WHEN** lockout resolve names the exact basename of an existing legacy `*lockout*.md` note
- **THEN** a resolution event preserves a reference to that note
- **AND** the legacy lockout no longer blocks completion without being renamed or deleted

### Requirement: Doctor
`idefactory doctor` SHALL exit non-zero when `.factory/` or a required adapter file is missing, including `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md`, and SHALL exit zero when init has completed and the required files exist.

#### Scenario: Missing install
- **WHEN** doctor runs in an empty directory
- **THEN** the exit code is non-zero

#### Scenario: Healthy install
- **WHEN** doctor runs after init
- **THEN** the exit code is zero

#### Scenario: Missing Cline adapter
- **WHEN** doctor runs in a project that has factory state and is missing `.cline/rules/factory.md` or `.cline/skills/factory-coordinator/SKILL.md`
- **THEN** the exit code is non-zero
- **AND** the report names the missing Cline path

### Requirement: Golden rules file
The product SHALL install `.factory/governance.md` as the operational baseline, SHALL NOT create `GOLDEN_RULES.md`, and SHALL NOT overwrite a pre-existing human-owned `GOLDEN_RULES.md`.

#### Scenario: Governance baseline
- **WHEN** init runs in a project without factory state
- **THEN** `.factory/governance.md` exists and records approval, verification, memory, HALT, review, and queue rules
- **AND** init does not create `GOLDEN_RULES.md`

#### Scenario: Existing rules
- **WHEN** `GOLDEN_RULES.md` already exists and init runs
- **THEN** the existing file is unchanged
