## ADDED Requirements

### Requirement: Operation recovery help
Help SHALL document `idefactory mcp record` with its flags and the closed cause, decision, outcome, and read-back sets, and SHALL describe the check-first rule, the retry cap, the ack refusal for unresolved operations, and the progress shown by `mcp pending`. The global usage text SHALL stay unchanged.

#### Scenario: Record help
- **WHEN** the user runs `idefactory help mcp record`
- **THEN** the output lists the causes, decisions, outcomes, and read-back values
- **AND** it states the check-first rule

#### Scenario: Ack help
- **WHEN** the user runs `idefactory help mcp ack`
- **THEN** the output says ack refuses when an operation is unresolved

#### Scenario: Global help unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
