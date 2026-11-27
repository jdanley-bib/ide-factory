# human-governance Specification

## Purpose
Records human approvals for spend and publishing, and reports whether a factory install is complete.

## Requirements

### Requirement: Approval record
`idefactory approve` SHALL write a scoped approval file under `.factory/approvals/` and an entry in `.factory/decisions.md`, and SHALL NOT publish, deploy, or spend. The file SHALL contain the note plus the change, task, source revision, action, approver, issuance, expiry, and policy version. For an external-effect action it SHALL also contain the target; a standing authorization replaces task and revision with the standing marker and target. When any scope field is missing, the command SHALL write no approval file and SHALL NOT append `decisions.md`.

#### Scenario: Approve
- **WHEN** approve runs with an id, a note, and every scope field
- **THEN** an approval file containing the note exists and `decisions.md` contains the id

#### Scenario: Incomplete approval
- **WHEN** approve runs with an id and a note and omits a scope field
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry for that id

#### Scenario: Deploy approval carries its target
- **WHEN** approve runs for `deploy` with a target
- **THEN** the approval file contains the target

#### Scenario: Deploy without a target
- **WHEN** approve runs for `deploy` without a target
- **THEN** no approval file is written

### Requirement: Verified approval principal
When governance policy version is 2, the file SHALL also contain a verified principal and the approver SHALL equal that principal's subject. Without a confirmed principal, policy version 2 SHALL write nothing.

#### Scenario: Policy version 2 requires a verified principal
- **WHEN** policy version is 2 and approve runs with every scope field but no confirmed principal
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry

#### Scenario: Confirmed principal is stored
- **WHEN** policy version is 2 and the configured verifier confirms the principal
- **THEN** the approval file contains that provider, subject, issuer, and verifiedAt
- **AND** the approver equals the subject

### Requirement: Rejection record
`idefactory reject` SHALL record the rejection in `decisions.md`.

#### Scenario: Reject
- **WHEN** reject runs with an id
- **THEN** `decisions.md` contains a rejected entry for that id

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
`idefactory doctor` SHALL exit non-zero when `.factory/` or a required adapter file is missing, including `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md`. It SHALL also exit non-zero when the install has no recorded test decision, or when governance policy version is 2 and no principal verifier argv is configured. It SHALL exit zero when the required files exist, a test decision is recorded, and a policy version 2 install has a verifier argv.

#### Scenario: Missing install
- **WHEN** doctor runs in an empty directory
- **THEN** the exit code is non-zero

#### Scenario: Healthy install
- **WHEN** doctor runs after init and setup has recorded a test argv or an explicit no-test decision, and policy version is not 2 without a verifier
- **THEN** the exit code is zero

#### Scenario: Missing Cline adapter
- **WHEN** doctor runs in a project that has factory state and is missing `.cline/rules/factory.md` or `.cline/skills/factory-coordinator/SKILL.md`
- **THEN** the exit code is non-zero
- **AND** the report names the missing Cline path

#### Scenario: Missing test decision
- **WHEN** doctor runs after init and the install has no test argv and no explicit no-test decision
- **THEN** the exit code is non-zero
- **AND** the report names the missing test decision

#### Scenario: Strict install without a verifier
- **WHEN** governance policy version is 2 and no principal verifier argv is configured
- **THEN** the exit code is non-zero
- **AND** the report names the missing verifier

### Requirement: Doctor policy report
Doctor SHALL report the governance policy version. Policy version 1 SHALL NOT by itself warn that gate approvals are unbound from a verified principal, and that version SHALL NOT by itself make the exit non-zero.

#### Scenario: Policy version is reported
- **WHEN** doctor runs on a healthy install
- **THEN** the report names the governance policy version

#### Scenario: Policy version 1 warning
- **WHEN** doctor runs on a healthy install whose governance policy version is 1
- **THEN** the exit code is zero
- **AND** the report does not warn that approvals are unbound from a verified principal

### Requirement: Unmapped check kind
Doctor SHALL name every profile check kind with no `checks.json` entry. That warning SHALL NOT by itself make a healthy install exit non-zero.

#### Scenario: Unmapped check kind
- **WHEN** a profile requires a check kind that `checks.json` does not map
- **THEN** doctor names that kind
- **AND** the exit code remains zero when the install is otherwise healthy

### Requirement: Golden rules file
The product SHALL install `.factory/governance.md` as the operational baseline, SHALL NOT create `GOLDEN_RULES.md`, and SHALL NOT overwrite a pre-existing human-owned `GOLDEN_RULES.md`.

#### Scenario: Governance baseline
- **WHEN** init runs in a project without factory state
- **THEN** `.factory/governance.md` exists and records approval, verification, memory, HALT, review, and queue rules
- **AND** init does not create `GOLDEN_RULES.md`

#### Scenario: Existing rules
- **WHEN** `GOLDEN_RULES.md` already exists and init runs
- **THEN** the existing file is unchanged

### Requirement: Approve usage names principal flags
The printed `idefactory approve` usage line SHALL include `--principal-provider` and `--principal-subject`.

#### Scenario: Help lists the principal flags
- **WHEN** command help is printed
- **THEN** the approve usage line includes `--principal-provider`
- **AND** the approve usage line includes `--principal-subject`

### Requirement: Documented approve example names principal flags
The README approve example SHALL include `--principal-provider` and `--principal-subject`.

#### Scenario: README example names the flags
- **WHEN** the README gates section is read
- **THEN** its approve command example includes `--principal-provider`
- **AND** its approve command example includes `--principal-subject`

### Requirement: Shared identity format
Every agent, reviewer, or resolver identity the CLI accepts as input SHALL be 1 to 128 characters from letters, digits, `.`, `_`, `@`, `:`, `+`, and `-`, and SHALL start with a letter or digit. This applies to lockout `--agent`, `--reviewer`, `--resolver` and to the `Agent:` line of a legacy lockout note.

#### Scenario: Dotted identity is accepted
- **WHEN** lockout create runs with `--agent engineer-5.1-abc123`, a reviewer, and a reason
- **THEN** creation data names `engineer-5.1-abc123` as the agent
- **AND** the command prints a lockout id

#### Scenario: Principal-style resolver is accepted
- **WHEN** lockout resolve runs with `--resolver Reviewer.One@example.com` and a reason
- **THEN** the identity passes the format check and the remaining resolve rules apply

#### Scenario: Invalid identity names the flag
- **WHEN** lockout create runs with `--agent "bad id"`
- **THEN** the command exits with an error that names `--agent`, the value, and the allowed characters
- **AND** no lockout files are written

#### Scenario: Flag without a value
- **WHEN** lockout create runs with `--agent` and no value
- **THEN** the command exits with an error saying `--agent` needs a value
- **AND** no lockout files are written

#### Scenario: Invalid resolver is not reported as missing
- **WHEN** lockout resolve runs with `--resolver "bad id"`
- **THEN** the error names `--resolver` and the allowed characters instead of saying it is missing
- **AND** no resolution event is written

#### Scenario: Legacy note with an invalid agent
- **WHEN** lockout resolve names a legacy `*lockout*.md` note whose `Agent:` line is outside the format
- **THEN** the command exits with an error naming the `Agent:` line and writes no resolution event

### Requirement: Lockout names its reviewer
`idefactory lockout create` SHALL require `--reviewer` and SHALL record exactly the identity it was given. It SHALL NOT substitute a default reviewer.

#### Scenario: Reviewer omitted
- **WHEN** lockout create runs with an agent and a reason but no `--reviewer`
- **THEN** the command exits with an error that names `--reviewer`
- **AND** no lockout files are written

#### Scenario: Reviewer recorded as given
- **WHEN** lockout create runs with `--reviewer reviewer-2`
- **THEN** creation data names `reviewer-2` as the reviewer

### Requirement: Identities recorded on attempts stay usable
A lockout command SHALL accept an identity outside the shared format when it exactly equals an `implementerId`, `reviewerId`, or `securityReviewerId` already stored on an attempt. It SHALL compare identities exactly, without trimming, case folding, or aliasing, and SHALL NOT change stored attempts.

#### Scenario: Previously recorded identity
- **WHEN** an attempt stored before this change has `implementerId` `Eng One` and lockout create runs with `--agent "Eng One"`
- **THEN** the lockout is created for `Eng One`
- **AND** the attempt file is unchanged

#### Scenario: Near match is refused
- **WHEN** lockout create runs with `--agent "eng one"` and the only stored identity is `Eng One`
- **THEN** the command exits with the identity format error and writes no lockout files

#### Scenario: Distinct resolver still required
- **WHEN** lockout resolve runs with a resolver exactly equal to the locked agent
- **THEN** the command exits with the existing distinct-resolver error

### Requirement: Action lists agree
The governance rule text, the README gates section, the governance skill, command help, and the approve error message SHALL each list exactly the actions in the action table, and a test SHALL fail when any of them differs.

#### Scenario: A new action is added to the table only
- **WHEN** an action is added to the table and one text is not updated
- **THEN** the consistency test fails naming that text

### Requirement: Approve help lists every action
The `idefactory approve` help SHALL list every action in the table with one line stating its binding, and SHALL state that `--target` is required for external-effect actions and that `--standing` records a standing authorization at policy version 2.

#### Scenario: Approve help
- **WHEN** the user runs `idefactory help approve`
- **THEN** each action in the table appears with its binding
- **AND** `--target` and `--standing` are explained
