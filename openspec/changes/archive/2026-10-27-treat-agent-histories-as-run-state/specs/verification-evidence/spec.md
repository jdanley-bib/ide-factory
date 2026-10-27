# verification-evidence

## ADDED Requirements

### Requirement: Agent histories stay run-state
An uncommitted `.factory/agents/<role>/history.md` file, for any single role directory, SHALL NOT by itself make the worktree dirty for source-revision binding. That binding is the clean-HEAD check for a passing check, for a human gate authorizing accept or complete, and for complete. An uncommitted charter, an uncommitted `.factory/identity/now.md`, a nested history file, or a product source file SHALL still make the worktree dirty. The factory SHALL NOT gitignore agent history files.

#### Scenario: History alone stays clean
- **WHEN** the only uncommitted path is `.factory/agents/engineer/history.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Reviewer history stays clean
- **WHEN** the only uncommitted path is `.factory/agents/reviewer/history.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Accept stays authorized
- **WHEN** an approval bound to the current HEAD has action `accept`
- **AND** the only uncommitted path besides that approval and `.factory/decisions.md` is an agent history file
- **THEN** that approval authorizes accept

#### Scenario: Complete stays authorized
- **WHEN** an approval bound to the current HEAD has action `complete`
- **AND** the only uncommitted path besides that approval and `.factory/decisions.md` is an agent history file
- **THEN** that approval authorizes complete

#### Scenario: Complete does not refuse a history-only worktree
- **WHEN** complete receives an accepted attempt with distinct role identifiers, a passing attestation for every required check at the current HEAD, and a verification profile whose `humanGate` is false
- **AND** the only extra uncommitted path is an agent history file
- **THEN** complete does not fail because the worktree is dirty
- **AND** the work item is done

#### Scenario: Charter stays dirty
- **WHEN** `.factory/agents/engineer/charter.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Identity note stays dirty
- **WHEN** `.factory/identity/now.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Nested history stays dirty
- **WHEN** `.factory/agents/engineer/notes/history.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Product changes stay dirty
- **WHEN** an agent history file is modified and a product source file is also modified
- **AND** a check is run
- **THEN** verification does not record a passing result

#### Scenario: History stays tracked
- **WHEN** ignore rules are checked for `.factory/agents/engineer/history.md`
- **THEN** that file is not ignored
