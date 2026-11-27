## ADDED Requirements

### Requirement: Blocked-state help
Help for `run`, `next`, `complete`, `attempt transition`, and `sync-tasks` SHALL document `--json`. The `run` help SHALL also describe each report field, the actors, the retry classes, and the durable record path. The global usage text SHALL stay unchanged.

#### Scenario: Run help names json
- **WHEN** the user runs `idefactory help run`
- **THEN** the output documents `--json` and says exit codes do not change

#### Scenario: Run help describes the report
- **WHEN** the user runs `idefactory help run`
- **THEN** the output lists the actors, the retry classes, and the record path

#### Scenario: Global help unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
