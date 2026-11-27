## ADDED Requirements

### Requirement: Operation decision events carry codes only
A recorded operation decision SHALL append an event naming the plan id, operation number, outcome, cause, decision, and read-back result. The event SHALL NOT carry error text, tool responses, notes, or tokens.

#### Scenario: Decision event content
- **WHEN** the agent records a decision for an operation
- **THEN** the appended event names the plan, operation, cause, and decision
- **AND** the event omits error text and notes
