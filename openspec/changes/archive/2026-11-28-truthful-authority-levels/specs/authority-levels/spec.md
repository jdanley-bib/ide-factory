## ADDED Requirements

### Requirement: Three authority levels
Every gated action SHALL have exactly one authority level: `agent`, `independent`, or `human`. `agent` SHALL mean the agent doing the work may take the action. `independent` SHALL mean an identity other than the implementer's is required, which may be an agent. `human` SHALL mean a person must decide.

#### Scenario: Level meanings
- **WHEN** the authority help is read
- **THEN** it defines `agent`, `independent`, and `human` as above

#### Scenario: Actor derives from level
- **WHEN** a blocked-state option has level `independent`
- **THEN** its reported actor is `independent-agent`

### Requirement: One authority table
The levels SHALL be defined in one table that names each gate, its level, and how the CLI enforces it. Every recovery option in the blocked-state table SHALL have an entry in it.

#### Scenario: Table matches the blocked table
- **WHEN** a recovery option exists in the blocked-state table
- **THEN** the authority table has an entry for it

#### Scenario: Waiver level
- **WHEN** the table is read for red waive
- **THEN** its level is `independent`

### Requirement: Human-level gates
The table SHALL assign `human` to approving a publish, deploy, spend, or account action, approving a human gate, removing HALT, raising a cap or ceiling, and `--new-run` after `max-tokens` or `max-cost`.

#### Scenario: Resume level
- **WHEN** the table is read for resume
- **THEN** its level is `human`

#### Scenario: Spend ceiling reset
- **WHEN** the table is read for `--new-run` after `max-cost`
- **THEN** its level is `human`

### Requirement: Independent and agent gates
The table SHALL assign `independent` to resolving a lockout, red waive, red reuse, reconciliation apply, attempt reopen, attempt repoint over evidence, and method or attempt review. It SHALL assign `agent` to method propose, red invalidate, attempt start, verify run, accepting a baseline with a reason, and `--new-run` within the cap.

#### Scenario: Lockout resolution
- **WHEN** the table is read for lockout resolve
- **THEN** its level is `independent`

#### Scenario: Method proposal
- **WHEN** the table is read for method propose
- **THEN** its level is `agent`

### Requirement: Enforcement is stated truthfully
Each table entry SHALL carry an enforcement label of `none`, `identity`, or `principal`. `identity` SHALL mean the CLI checks that the supplied identity differs from the implementer's or locked agent's. `principal` SHALL mean the policy version 2 verifier confirms it. Reports SHALL include the label beside the level and SHALL NOT claim that an identity proves a person.

#### Scenario: Report shows enforcement
- **WHEN** a blocked report lists the waiver option
- **THEN** the option shows level `independent` and enforcement `identity` or `principal`

#### Scenario: Human level with identity enforcement
- **WHEN** a report lists approving a publish action
- **THEN** it shows level `human` and says the factory expects a person and cannot verify one

### Requirement: Projects may raise a gate
`.factory/config.json` MAY set `authority.<gate>` to `human` for a gate in the table. A raise SHALL change the reported level and actor to `human` with source `config`. A value other than `human`, an unknown gate, or an entry that would lower a level SHALL be ignored and reported by doctor. A raise SHALL NOT change CLI enforcement.

#### Scenario: Raised gate
- **WHEN** the config sets `authority.red-waive` to `human`
- **THEN** the waive option reports level `human` and source `config`

#### Scenario: Lowering ignored
- **WHEN** the config sets `authority.approve` to `agent`
- **THEN** the gate keeps its table level
- **AND** doctor names the ignored entry

#### Scenario: Enforcement unchanged
- **WHEN** a gate is raised in config
- **THEN** the command still accepts exactly the identities it accepted before

### Requirement: Messages name what is needed
A refusal for an independent-level gate SHALL say that an identity other than the implementer's, or the locked agent's, is required. A refusal for a human-level gate SHALL say that a person is required. A message SHALL NOT call an independent-level gate a human action.

#### Scenario: Waiver refused for the implementer
- **WHEN** red waive is refused because the approver equals the implementer
- **THEN** the message says an identity other than the implementer's is required
- **AND** it does not say a human is required

#### Scenario: Approval refused
- **WHEN** a publish approval is refused for a missing approver
- **THEN** the message says a person is required
