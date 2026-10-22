# spec-to-backlog Specification

## Purpose
Turns unchecked tasks in a human-authored OpenSpec change into `.factory/work/` items, while OpenSpec `tasks.md` remains the human plan.

## Requirements

### Requirement: Human-authored change
The system SHALL read `openspec/changes/<name>/` and SHALL NOT invent a product idea or write a new OpenSpec proposal on its own.

#### Scenario: Sync refuses a missing change
- **WHEN** sync-tasks runs for a change that does not exist
- **THEN** the command exits with an error and creates no work item

### Requirement: Create tasks from unchecked boxes
The system SHALL create one `.factory/work/` item for each unchecked task in the change's `tasks.md`, associated with that change, and SHALL skip a checkbox that already has a work item.

#### Scenario: First sync
- **WHEN** `tasks.md` has two unchecked boxes and no matching work items
- **THEN** sync-tasks creates two work items

#### Scenario: Second sync
- **WHEN** sync-tasks runs again for the same change
- **THEN** it does not create another work item for an already synced checkbox

### Requirement: Skip completed checkboxes
The system SHALL NOT create a work item for a checked task in `tasks.md`.

#### Scenario: Checked box
- **WHEN** `tasks.md` marks a task done and sync-tasks runs
- **THEN** no work item is created for that checkbox id

### Requirement: Single queue
The system SHALL use `.factory/work/` as the only machine execution queue and SHALL keep OpenSpec `tasks.md` as the human-authored plan.

#### Scenario: No factory backlog file
- **WHEN** sync-tasks completes
- **THEN** `.factory/` contains no `backlog.md` task list

#### Scenario: Factory work queue
- **WHEN** sync-tasks completes for a change with an unchecked task
- **THEN** the corresponding work item exists under `.factory/work/`
- **AND** no Backlog.md task is required
