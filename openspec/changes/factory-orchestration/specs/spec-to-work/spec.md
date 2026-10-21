# spec-to-work Specification

## Purpose
Turns unchecked tasks in a human-authored OpenSpec change into first-party work items under `.factory/work/`, which are the only execution queue.

## Requirements

### Requirement: Human-authored change
The system SHALL read `openspec/changes/<name>/` and SHALL NOT invent a product idea or write a new OpenSpec proposal on its own.

#### Scenario: Sync refuses a missing change
- **WHEN** sync-tasks runs for a change that does not exist
- **THEN** the command exits with an error and creates no work item

### Requirement: Create work items from unchecked boxes
The system SHALL create one work item under `.factory/work/items/` for each unchecked task in the change's `tasks.md`, keyed by change and checkbox id, and SHALL skip a checkbox that already has a matching work item.

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

### Requirement: Behavior-based acceptance criteria
Work items SHALL store acceptance criteria derived from the task title and optional criteria lines, and SHALL NOT use "checkbox is checked" as the sole acceptance criterion.

#### Scenario: Default criterion from title
- **WHEN** sync-tasks creates a work item for title "Add login form"
- **THEN** the work item acceptance criteria include behavior text about that title, not only checkbox bookkeeping

### Requirement: No Backlog.md requirement
`sync-tasks` SHALL succeed without a Backlog.md CLI or `backlog/` directory.

#### Scenario: Sync without backlog
- **WHEN** sync-tasks runs in a project with OpenSpec tasks and no `backlog/` directory
- **THEN** work items are created and the command exits zero
