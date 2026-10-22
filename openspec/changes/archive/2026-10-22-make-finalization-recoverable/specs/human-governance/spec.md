# Spec Delta

## MODIFIED Requirements

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
