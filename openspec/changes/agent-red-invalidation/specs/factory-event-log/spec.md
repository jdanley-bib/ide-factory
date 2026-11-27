## ADDED Requirements

### Requirement: Invalidation events carry codes only
A recorded red invalidation SHALL append one `red.invalidated` event naming the change, task, attempt id, kind, class, and the identity as resolver. The event SHALL NOT include the note, the invalidated red's log, or the red digest inputs.

#### Scenario: Invalidation event content
- **WHEN** a red invalidation is recorded with a note
- **THEN** the log gains one `red.invalidated` event naming the class
- **AND** the event omits the note
