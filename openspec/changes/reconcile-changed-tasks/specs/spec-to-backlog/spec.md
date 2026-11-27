## MODIFIED Requirements

### Requirement: Create tasks from unchecked boxes
The system SHALL create one `.factory/work/` item for each unchecked task in the change's `tasks.md` that the task locator does not already tie to a work item, including a task added after the first sync, and SHALL skip a checkbox that already has a work item. A wording-preserving rewrite of a task that already has a work item SHALL NOT create a second work item.

#### Scenario: First sync
- **WHEN** `tasks.md` has two unchecked boxes and no matching work items
- **THEN** sync-tasks creates two work items

#### Scenario: Second sync
- **WHEN** sync-tasks runs again for the same change
- **THEN** it does not create another work item for an already synced checkbox

#### Scenario: Wording-preserving rewrite
- **WHEN** a synced task keeps the same normalized text and the same checkbox id, aside from whitespace
- **THEN** sync-tasks does not create a second work item
- **AND** that work item's id and status stay the same

#### Scenario: Task added after the first sync
- **WHEN** a change has synced work items and an unchecked task with a new id and new text is added to `tasks.md`
- **AND** no other task was reworded, removed, or renumbered
- **THEN** sync-tasks creates one work item for it
- **AND** every existing work item is unchanged

#### Scenario: Addition together with a rewording
- **WHEN** a task is added and another task is reworded in the same edit
- **THEN** sync-tasks treats the edit as ambiguous, changes nothing, and returns a reconciliation report

### Requirement: Ambiguous remap fails closed
When an edit splits, merges, removes, or reorders tasks so that stored tasks do not match current tasks one to one, sync SHALL leave `.factory/work/` unchanged and SHALL return a reconciliation report. The report SHALL name each unmatched stored item and each unmatched current task, and SHALL name the plan command that previews the decisions needed.

#### Scenario: Split leaves the queue unchanged
- **WHEN** one synced task is replaced by two tasks that do not match the stored tasks one to one
- **THEN** sync-tasks exits with an error
- **AND** no work item is created, updated, or deleted
- **AND** the output is a reconciliation report

#### Scenario: Merge leaves the queue unchanged
- **WHEN** two synced tasks are replaced by one task
- **THEN** sync-tasks exits with an error
- **AND** `.factory/work/` is unchanged

#### Scenario: Removed task
- **WHEN** a synced task is removed from `tasks.md`
- **THEN** sync-tasks exits with an error and leaves `.factory/work/` unchanged
- **AND** the report names the stored item and the plan command
