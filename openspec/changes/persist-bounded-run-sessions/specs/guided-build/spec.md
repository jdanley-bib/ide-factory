# Spec Delta

## MODIFIED Requirements

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous build loop. Human-started orchestration SHALL return one role-scoped request only when the persisted session still has remaining budget and the work state changed since the previous request.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

#### Scenario: Run requests an IDE step
- **WHEN** run reaches a work item stage that needs an IDE role and the persisted session has remaining budget and a changed work state
- **THEN** it exits with the needs-agent code and prints one role-scoped orchestration request
- **AND** it does not spawn a model process

#### Scenario: Budget stops the request
- **WHEN** the persisted session has no remaining agent-step budget
- **THEN** run does not exit with the needs-agent code
- **AND** it prints no orchestration request

#### Scenario: Unchanged work stops the request
- **WHEN** the work state is unchanged since the previous request
- **THEN** run prints no orchestration request
- **AND** it does not spawn a model process
