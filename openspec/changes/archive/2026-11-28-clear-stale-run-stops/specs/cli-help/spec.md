## ADDED Requirements

### Requirement: New-run help
`idefactory help run` SHALL describe `--new-run` as opening a new session after a budget stop or `retry-cap`, limited by `run.maxNewRuns`, and SHALL state that condition stops clear without it. The global usage text SHALL NOT change.

#### Scenario: Run help names the cap
- **WHEN** the user runs `idefactory help run`
- **THEN** the output describes `--new-run`, `run.maxNewRuns`, and that `vacuous-red` clears when resolved

#### Scenario: Global text unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
