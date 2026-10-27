# spec-to-backlog

## MODIFIED Requirements

### Requirement: Create tasks from unchecked boxes
The system SHALL create one `.factory/work/` item for each unchecked task in the change's `tasks.md` that the task locator does not already tie to a work item, and SHALL skip a checkbox that already has a work item. A wording-preserving rewrite of a task that already has a work item SHALL NOT create a second work item.

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

## ADDED Requirements

### Requirement: Task locator and provenance
Sync SHALL tie one change and one checkbox task to one work item, and SHALL store a provenance hash of that task's normalized text on the item it creates.

#### Scenario: Provenance stored on first sync
- **WHEN** sync-tasks creates a work item for an unchecked task
- **THEN** the item stores a provenance hash of that task's normalized text
- **AND** the item's id is the checkbox id

#### Scenario: Repeated sync is idempotent
- **WHEN** sync-tasks runs again and `tasks.md` is unchanged
- **THEN** work-item ids and statuses are unchanged

### Requirement: Unambiguous reorder keeps one item
When every stored task text matches exactly one current task text and a checkbox id changes, sync SHALL keep one work item for that task and SHALL preserve its status.

#### Scenario: Renumbered task
- **WHEN** one synced task keeps its normalized text and its checkbox id changes
- **THEN** the work item at the new checkbox id has the status it had before
- **AND** no second work item exists for that task

### Requirement: Ambiguous remap fails closed
When an edit splits, merges, or reorders tasks so that stored tasks do not match current tasks one to one, sync SHALL leave `.factory/work/` unchanged and SHALL return a reconciliation report.

#### Scenario: Split leaves the queue unchanged
- **WHEN** one synced task is replaced by two tasks that do not match the stored tasks one to one
- **THEN** sync-tasks exits with an error
- **AND** no work item is created, updated, or deleted
- **AND** the output is a reconciliation report

#### Scenario: Merge leaves the queue unchanged
- **WHEN** two synced tasks are replaced by one task
- **THEN** sync-tasks exits with an error
- **AND** `.factory/work/` is unchanged

### Requirement: Hand-checked box is not completion
A checkbox marked done by editing OpenSpec `tasks.md` SHALL NOT mark its work item done, SHALL NOT accept an attempt, and SHALL NOT satisfy factory completion.

#### Scenario: Hand-checked box
- **WHEN** a synced task's checkbox is changed from unchecked to checked without complete
- **AND** sync-tasks runs again
- **THEN** the work item status is unchanged
- **AND** the attempt is not accepted

### Requirement: Archive and spec sync preserve factory state
Moving a change into the OpenSpec archive, or writing accepted specs into the main specs, SHALL NOT change attempt state, evidence, or work-item status, and SHALL NOT accept an attempt.

#### Scenario: Archive preserves evidence
- **WHEN** the change directory is moved under the OpenSpec archive path
- **THEN** attempt state, stored evidence, and work-item status are unchanged
- **AND** the attempt is not accepted

#### Scenario: Spec sync preserves evidence
- **WHEN** accepted spec text is written into the main spec
- **THEN** attempt state, stored evidence, and work-item status are unchanged
- **AND** the attempt is not accepted

### Requirement: Pinned OpenSpec package
The project SHALL depend on `@fission-ai/openspec` at exactly `1.14.3` and SHALL NOT gain a Backlog.md, Squad, or Squad4Cursor package.

#### Scenario: Exact OpenSpec version
- **WHEN** the package manifest is read
- **THEN** `@fission-ai/openspec` is `1.14.3` with no version range
- **AND** the manifest does not gain `@bradygaster/squad` or a `@squad4cursor/*` package
