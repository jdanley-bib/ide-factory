## ADDED Requirements

### Requirement: Attempt ownership help
`idefactory help attempt repoint` SHALL describe the preview and apply forms, the plan digest, the decision flags, the identity rule, and that evidence is never edited. `idefactory help attempt start` SHALL state that a live attempt with evidence blocks a second start and that an empty live attempt is reused. The global usage text SHALL NOT change.

#### Scenario: Repoint help
- **WHEN** the user runs `idefactory help attempt repoint`
- **THEN** the output shows the `--plan-digest`, `--decided-by`, and `--reason` flags and says no attempt evidence is modified

#### Scenario: Start help
- **WHEN** the user runs `idefactory attempt start --help`
- **THEN** the output states the active-attempt guard and the reuse of an empty attempt

#### Scenario: Global text unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
