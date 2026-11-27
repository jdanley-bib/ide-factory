## ADDED Requirements

### Requirement: Requirements help
Help SHALL document `idefactory requirements`, its `--json` form, its read-only effect, and the meaning of each field. The attempt lifecycle help SHALL state that the gate into `verifying` requires red for every test kind in the resolved requirement set.

#### Scenario: Requirements help
- **WHEN** the user runs `idefactory help requirements`
- **THEN** the output says the command is read-only and names the check sources, the red kinds, the human decisions, and the problems

#### Scenario: Lifecycle names the full set
- **WHEN** the user runs `idefactory help attempt transition`
- **THEN** the precondition for `verifying` refers to the resolved requirement set
