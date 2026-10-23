# human-governance Specification

## MODIFIED Requirements

### Requirement: Approval record
`idefactory approve` SHALL write a scoped approval file under `.factory/approvals/` and an entry in `.factory/decisions.md`, and SHALL NOT publish, deploy, or spend. The file SHALL contain the note plus the change, task, source revision, action, approver, issuance, expiry, and policy version. When any scope field is missing, the command SHALL write no approval file and SHALL NOT append `decisions.md`. When governance policy version is 2, the file SHALL also contain a verified principal and the approver SHALL equal that principal's subject. Without a confirmed principal, policy version 2 SHALL write nothing.

#### Scenario: Approve
- **WHEN** approve runs with an id, a note, and every scope field
- **THEN** an approval file containing the note exists and `decisions.md` contains the id

#### Scenario: Incomplete approval
- **WHEN** approve runs with an id and a note and omits a scope field
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry for that id

#### Scenario: Policy version 2 requires a verified principal
- **WHEN** policy version is 2 and approve runs with every scope field but no confirmed principal
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry

#### Scenario: Confirmed principal is stored
- **WHEN** policy version is 2 and the configured verifier confirms the principal
- **THEN** the approval file contains that provider, subject, issuer, and verifiedAt
- **AND** the approver equals the subject

### Requirement: Reviewer lockout note
`idefactory lockout` SHALL create a versioned lockout with immutable creation data naming its id, agent, reviewer, reason, and time, and SHALL NOT delete product files. An active lockout SHALL block completion. `idefactory lockout resolve <id>` SHALL require a resolver distinct from the locked agent and a reason, and SHALL write one immutable resolution event instead of deleting creation history. When governance policy version is 2, that resolver SHALL be a verified principal.

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

#### Scenario: Policy version 2 resolver
- **WHEN** policy version is 2 and lockout resolve names a resolver that is not a verified principal
- **THEN** the command exits with an error and writes no resolution event

### Requirement: Doctor
`idefactory doctor` SHALL exit non-zero when `.factory/` or a required adapter file is missing, including `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md`, and SHALL exit zero when init has completed and the required files exist. Doctor SHALL report the governance policy version. When that version is 1, doctor SHALL warn that gate approvals are not bound to a verified principal. Doctor SHALL name every profile check kind with no `checks.json` entry. Those warnings SHALL NOT by themselves make a healthy install exit non-zero.

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

#### Scenario: Policy version 1 warning
- **WHEN** doctor runs on a healthy install whose governance policy version is 1
- **THEN** the exit code is zero
- **AND** the report warns that approvals are not bound to a verified principal

#### Scenario: Unmapped check kind
- **WHEN** a profile requires a check kind that `checks.json` does not map
- **THEN** doctor names that kind
- **AND** the exit code remains zero when the install is otherwise healthy
