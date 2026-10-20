# spec-to-backlog Specification

## Purpose
Turns unchecked tasks in a human-authored OpenSpec change into Backlog.md tasks, which are the only execution queue.

## Requirements

### Requirement: Human-authored change
The system SHALL read `openspec/changes/<name>/` and SHALL NOT invent a product idea or write a new OpenSpec proposal on its own.

#### Scenario: Sync refuses a missing change
- **WHEN** sync-tasks runs for a change that does not exist
- **THEN** the command exits with an error and creates no backlog task

### Requirement: Create tasks from unchecked boxes
The system SHALL create one Backlog.md task for each unchecked task in the change's `tasks.md`, labeled with that change, and SHALL skip a checkbox that already has a backlog task.

#### Scenario: First sync
- **WHEN** `tasks.md` has two unchecked boxes and no matching backlog tasks
- **THEN** sync-tasks creates two backlog tasks

#### Scenario: Second sync
- **WHEN** sync-tasks runs again for the same change
- **THEN** it does not create another task for an already synced checkbox

### Requirement: Skip completed checkboxes
The system SHALL NOT create a backlog task for a checked task in `tasks.md`.

#### Scenario: Checked box
- **WHEN** `tasks.md` marks a task done and sync-tasks runs
- **THEN** no backlog task is created for that checkbox id

### Requirement: Single queue
The system SHALL NOT write an execution backlog under `.factory/`.

#### Scenario: No factory backlog file
- **WHEN** sync-tasks completes
- **THEN** `.factory/` contains no `backlog.md` task list
