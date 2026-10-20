# guided-build Specification

## Purpose
Gives the IDE one role-scoped packet for the next backlog task and requires test-first work plus a separate review.

## Requirements

### Requirement: One role per packet
`idefactory next` SHALL name exactly one implementing role and SHALL include only that role's charter path, not the other agents' charters.

#### Scenario: Engineer packet
- **WHEN** a backlog task is To Do and next runs
- **THEN** the packet names the engineer role and the engineer charter path and does not include other agents' charter paths as required reading

### Requirement: Method and review
The work packet and the factory-build skill SHALL require a failing test before production code, a verification command before claiming done, and a review by a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read
- **THEN** it requires a failing test first, a verification step, and a different role for review

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous build loop.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

### Requirement: Halt
When a file named `HALT` exists in the project root, next and sync-tasks SHALL refuse to run.

#### Scenario: Halt file
- **WHEN** `HALT` exists and next runs
- **THEN** the command exits with an error and does not print a work packet
