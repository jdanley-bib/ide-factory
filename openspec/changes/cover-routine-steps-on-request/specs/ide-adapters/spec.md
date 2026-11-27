## REMOVED Requirements

### Requirement: Factory pull-request guidance
**Reason**: The requirement bundled the pull-request rules with a rule that every routine step waits for a separate human request. The pull-request rules move to "Pull-request guidance names the legal steps", and the waiting rule is replaced by the requirements below.
**Migration**: Installed guidance keeps the legal pull-request steps and the never-merge statement. The wait sentence is replaced by the shared block described in "A run request covers the routine steps".

## ADDED Requirements

### Requirement: Pull-request guidance names the legal steps
Installed factory guidance SHALL name `idefactory pr open`, `idefactory pr comment`, and `idefactory pr capture` as the only legal pull-request steps. It SHALL say the agent never merges.

#### Scenario: Rule names the legal pull-request steps
- **WHEN** the installed Cursor factory rule is read
- **THEN** it names `pr open`, `pr comment`, and `pr capture` as the only legal pull-request steps
- **AND** it says the agent never merges

#### Scenario: Run guidance names no other pull-request command
- **WHEN** the installed factory-run skill is read
- **THEN** it does not name another pull-request command as legal

### Requirement: A run request covers the routine steps
Installed factory guidance SHALL say that a human request to run, or to run the full pipeline, for a change covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records those steps involve, and that the agent does not ask the human again before each of them. The cover SHALL end when the run stops, and SHALL NOT extend to another change.

#### Scenario: Rule states the cover
- **WHEN** the installed Cursor factory rule is read
- **THEN** it says a request to run or to run the full pipeline covers `sync-tasks`, `run`, `verify`, and `complete` for that change

#### Scenario: Run skill does not wait before routine steps
- **WHEN** the installed factory-run skill is read
- **THEN** it does not tell the agent to wait for the human before `sync-tasks`, `verify`, or `complete` once a run was requested

#### Scenario: Another change is not covered
- **WHEN** the installed guidance is read
- **THEN** it says the cover applies to the requested change only

### Requirement: Separate requests remain
Installed factory guidance SHALL say that `approve`, `ci scaffold`, archive, and spec sync each need a separate human request, and that only a human passes `--new-run` after a budget stop, `vacuous-red`, or `retry-cap`.

#### Scenario: Archive still waits
- **WHEN** the installed factory-coordinator skill is read
- **THEN** it says archive and spec sync run only on a separate human request

#### Scenario: Approve is the human's record
- **WHEN** the installed factory-governance skill is read
- **THEN** it says the agent does not run `approve` for itself

### Requirement: External effects need an authorization check
Installed factory guidance SHALL tell the agent, before any action with an external effect (publish, deploy, spend, creating an account), to run `idefactory authorize` and to proceed only when it reports `authorized: true`. When it reports `authorized: false`, the guidance SHALL tell the agent to stop and report the reason and the `approve` command, and not to ask whether it may proceed when the report says `authorized: true`.

#### Scenario: Check before a deploy
- **WHEN** the installed factory-governance skill is read
- **THEN** it tells the agent to run `idefactory authorize` before a deploy and to stop on `authorized: false`

#### Scenario: Authorized does not prompt
- **WHEN** the installed rule is read
- **THEN** it does not tell the agent to ask the human when `authorize` reports `authorized: true`

### Requirement: Enforced gates are not waived by the cover
Installed factory guidance SHALL say that the cover does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review.

#### Scenario: Gates named
- **WHEN** the installed factory-run skill is read
- **THEN** it names the profile human gate, lockouts, `HALT`, budget stops, and independent review as still applying

### Requirement: One wording across adapters
The block of guidance in the preceding requirements SHALL be identical in every shipped copy: the Cursor rule, the Cline rule, the Copilot agent file, and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skills in `templates` and in each installed adapter path. A test SHALL fail when any copy differs.

#### Scenario: One copy differs
- **WHEN** one shipped copy carries different wording
- **THEN** the drift test fails naming that file

#### Scenario: Upgrade preserves an edited file
- **WHEN** upgrade runs and an installed adapter file was edited
- **THEN** the edited file is preserved and reported
