## MODIFIED Requirements

### Requirement: One wording across adapters
The routine-steps block and the blocked-states block SHALL each be identical in every shipped copy: the Cursor rule, the Cline rule, the Copilot agent file, and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skills in `templates` and in each installed adapter path. A test SHALL fail when any copy of either block differs.

#### Scenario: One copy differs
- **WHEN** one shipped copy carries different wording
- **THEN** the drift test fails naming that file

#### Scenario: Upgrade preserves an edited file
- **WHEN** upgrade runs and an installed adapter file was edited
- **THEN** the edited file is preserved and reported

### Requirement: Separate requests remain
Installed factory guidance SHALL say that `approve`, `ci scaffold`, archive, and spec sync each need a separate human request, and that `--new-run` is for budget stops within the configured new-run cap and is not passed after `vacuous-red`, which clears when the red is resolved.

#### Scenario: Archive still waits
- **WHEN** the installed factory-coordinator skill is read
- **THEN** it says archive and spec sync run only on a separate human request

#### Scenario: Approve is the human's record
- **WHEN** the installed factory-governance skill is read
- **THEN** it says the agent does not run `approve` for itself

#### Scenario: New run is bounded
- **WHEN** the installed factory-run skill is read
- **THEN** it says `--new-run` is limited by the new-run cap and is not passed after `vacuous-red`

## ADDED Requirements

### Requirement: Blocked-state guidance is generated
Installed factory guidance SHALL carry a `## Blocked states and authority` block rendered from the authority table and the blocked-state table by `scripts/build-guidance.mjs`. A test SHALL fail when a template differs from the rendered block.

#### Scenario: Block lists the human gates
- **WHEN** the installed Cursor rule is read
- **THEN** its blocked-states block lists each gate the authority table marks `human`
- **AND** it does not list a gate marked `independent` as human-only

#### Scenario: Table change without regenerate
- **WHEN** a gate's level changes in the authority table and the templates are not regenerated
- **THEN** the guidance check fails

### Requirement: Blocked-state guidance content
The generated block SHALL tell the agent to act on the first supported option whose authority is `agent` or `independent`, to use an identity other than the implementer's for `independent`, and to stop and ask a person only for the `human` gates the table lists. It SHALL tell the agent to stop on retry class `never`, to resolve condition stops and run again, and to use `--new-run` only for budget stops within the cap.

#### Scenario: Condition stop guidance
- **WHEN** the installed factory-run skill is read
- **THEN** it says a `vacuous-red` stop clears when resolved and that the agent runs again without `--new-run`

#### Scenario: Independent identity
- **WHEN** the installed rule is read
- **THEN** it says an `independent` option needs an identity other than the implementer's and may be run by an agent

### Requirement: Human-only phrasing is reviewed
Every occurrence of "ask the human", "only the human", "only a human", or "wait for the human" in a shipped template SHALL match an entry in the guidance allowlist that names either a gate the authority table marks `human` or a reserved reason of `product-decision` or `install-decision`. A test SHALL fail for an occurrence with no entry or with an entry whose gate is not human-level.

#### Scenario: Unlisted phrase
- **WHEN** a template gains "ask the human first" with no allowlist entry
- **THEN** the guidance test fails naming the file

#### Scenario: Entry with a non-human gate
- **WHEN** an allowlist entry names a gate whose level is `independent`
- **THEN** the guidance test fails naming that entry

#### Scenario: Vacuous red is not human-only
- **WHEN** the shipped `factory-tdd`, `factory-verify`, and `factory-build` skills are read
- **THEN** none tells the agent to ask the human first on `vacuous-red`
- **AND** each names the method proposal before any waiver

### Requirement: Red-stop guidance order
The shipped `factory-tdd`, `factory-verify`, and `factory-build` skills SHALL tell the agent, on `vacuous-red`, to propose `already-satisfied` when the attempt changed only tests, to run `red invalidate` when a stored red is not genuine, and to use `red reuse` or `red waive` with an identity other than the implementer's only when neither fits.

#### Scenario: Order in the build skill
- **WHEN** the factory-build skill is read
- **THEN** `already-satisfied` appears before `red invalidate`, and both before `red waive`
