## ADDED Requirements

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
