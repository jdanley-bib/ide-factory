## ADDED Requirements

### Requirement: Authority help
Help for each gated command SHALL state its authority level and enforcement label from the authority table in one line. The `run` help SHALL define the three levels and the three enforcement labels. The global usage text SHALL NOT change.

#### Scenario: Waive help
- **WHEN** the user runs `idefactory help red waive`
- **THEN** the output states level `independent` and the enforcement label

#### Scenario: Run help defines levels
- **WHEN** the user runs `idefactory help run`
- **THEN** the output defines `agent`, `independent`, `human`, `none`, `identity`, and `principal`

#### Scenario: Global text unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
