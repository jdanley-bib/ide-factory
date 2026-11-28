## ADDED Requirements

### Requirement: Pointer events carry ids only
An applied attempt repair SHALL append one `attempt.repointed` event naming the change, task, previous attempt id, new attempt id, and resolver. The event SHALL NOT include the reason text, the plan digest inputs, or evidence contents.

#### Scenario: Repair event content
- **WHEN** a repair is applied with a reason
- **THEN** the log gains one `attempt.repointed` event with the two attempt ids
- **AND** the event omits the reason text
