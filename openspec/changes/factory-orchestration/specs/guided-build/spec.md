# guided-build Delta

## MODIFIED Requirements

### Requirement: One role per packet
`idefactory next` SHALL name exactly one implementing role and SHALL include only that role's charter path, not the other agents' charters. The packet MAY include a work item id and attempt id.

#### Scenario: Engineer packet
- **WHEN** a work item is todo and ready and next runs
- **THEN** the packet names the engineer role and the engineer charter path and does not include other agents' charter paths as required reading

### Requirement: Method and review
The work packet and the factory-build skill SHALL require a failing test before production code when the verification profile includes unit or equivalent checks, a verification command before claiming done, and a review by a role other than the implementer. Completion SHALL go through `idefactory complete` when an attempt exists.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read
- **THEN** it requires test-first work when applicable, a verification step, a different role for review, and complete for finalization

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous unattended build loop. A human-started `/factory-run` skill MAY loop by invoking the CLI and spawning IDE subagents until a stop condition.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

### Requirement: Halt
When a file named `HALT` exists in the project root, next, sync-tasks, run, attempt mutations, and complete SHALL refuse to run.

#### Scenario: Halt file
- **WHEN** `HALT` exists and next runs
- **THEN** the command exits with an error and does not print a work packet
