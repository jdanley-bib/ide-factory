# task-reconciliation Specification

## Purpose
Lets a changed task list be reconciled with existing work items through a preview, explicit recorded decisions, and held items, without losing history, rewriting in-flight gates, or selecting stale work.

## Requirements

### Requirement: Checked tasks without items are ignored
Sync SHALL ignore a checked task that has no work item and SHALL NOT treat it as an unmatched current task.

#### Scenario: Pre-checked task
- **WHEN** a change has synced items and `tasks.md` also holds a checked task with no work item
- **THEN** sync-tasks does not report it as unmatched and does not create an item for it

### Requirement: In-flight classification is never rewritten silently
A sync SHALL NOT change the classification, dependencies, or acceptance criteria of a work item that has an attempt. A wording change SHALL update the item's title and provenance and keep the earlier text in a title history. A difference between the stored classification and the plan SHALL be reported as drift.

#### Scenario: Reclassification in the plan
- **WHEN** an in-progress item is `code` with `unit` checks and the plan now marks it `lightweight` with `build` checks
- **AND** sync-tasks runs without a decision
- **THEN** the item's class, checks, and dependencies are unchanged
- **AND** the output reports drift naming the old and new requirement sets

#### Scenario: Reworded task
- **WHEN** an in-progress item's task text changes and its classification does not
- **THEN** the title and provenance are updated and the earlier text is kept in the item's title history

### Requirement: The plan previews reconciliation
`idefactory sync-tasks <change> --plan` SHALL print, without writing anything, the automatic actions, each unmatched stored item and unmatched current task, each item with an attempt and its state, each classification drift, each dependent of an item that would be held, each other active change whose capability deltas overlap this change's, and a plan digest. With `--json` it SHALL print one JSON document with `schemaVersion` 1.

#### Scenario: Plan lists the work
- **WHEN** the user runs `sync-tasks --plan` for a change with one removed task whose item is in progress
- **THEN** the output names that item and its attempt state
- **AND** it names its dependents and a plan digest
- **AND** the project directory is unchanged

#### Scenario: Overlapping change
- **WHEN** another active change with unfinished work has a delta for a capability that this change also changes
- **THEN** the plan names that change and capability

### Requirement: Decisions are explicit
`idefactory sync-tasks <change> --apply` SHALL read a decisions file, a plan digest, and a `--decided-by` identity, and SHALL apply only when the digest matches current state. Each item sync cannot match automatically SHALL have one decision (`keep`, `renumber`, `defer`, `drop`, `split`, `merge`, `move`) and each drift one classification decision. It SHALL NOT infer mappings from text similarity, and an incomplete or conflicting file SHALL change nothing.

#### Scenario: Missing decision
- **WHEN** the decisions file omits a stored item that sync cannot match automatically
- **THEN** apply exits non-zero naming the item and changes nothing

#### Scenario: Stale plan
- **WHEN** `tasks.md` or the queue changed after the plan was printed
- **THEN** apply refuses with the mismatch and changes nothing

#### Scenario: Split
- **WHEN** one stored item is decided as `split` into two new tasks
- **THEN** two new work items are created in `todo`
- **AND** the old item is dropped and names both as its successors
- **AND** no evidence moves to the new items

### Requirement: Held items are never selected
A deferred or dropped item SHALL keep its file, attempts, and evidence. `next` and `run` SHALL NOT select it, `run` SHALL NOT treat it as in-progress work, and `complete` SHALL refuse it naming its hold. `status` SHALL show it as deferred or dropped. A deferred item SHALL return to its previous status through `resume` or when the same task reappears unchanged.

#### Scenario: Deferred in-progress item
- **WHEN** an in-progress item is deferred
- **THEN** `run` selects other ready work or reports none
- **AND** the item's attempt and evidence are byte-for-byte unchanged

#### Scenario: Complete refuses a held item
- **WHEN** `complete` is run for an attempt whose item is dropped
- **THEN** it fails naming the hold and the item stays unfinished

#### Scenario: Task returns
- **WHEN** a deferred task reappears in `tasks.md` with the same id and text and a plan is applied with `resume`
- **THEN** the item returns to its previous status with its attempt intact

### Requirement: Dependents of held items are reported
A plan and an apply SHALL name every item that depends on an item that would be deferred or dropped. For a dropped item each decision SHALL state `block` or `release` for its dependents, and for a deferred item dependents SHALL stay blocked unless the decision states `release`.

#### Scenario: Dependent blocked
- **WHEN** an item is deferred and a later item depends on it
- **THEN** the later item is not selected until the item resumes or a `release` decision is applied

### Requirement: Decisions that loosen in-flight work need an independent identity
Applying `adopt-classification`, `drop`, `merge`, or `move` for an item with an attempt past `planned` SHALL require a `--decided-by` identity that differs from the attempt's implementer. Under governance policy version 2 it SHALL equal a verified principal subject. A refusal SHALL change nothing.

#### Scenario: Implementer decides
- **WHEN** the deciding identity equals the implementer of the item's attempt and the decision is `adopt-classification`
- **THEN** apply refuses and changes nothing

#### Scenario: Independent identity
- **WHEN** the deciding identity differs from the implementer
- **THEN** the decision is applied and recorded

### Requirement: Reconciliation is recorded
Each applied reconciliation SHALL write one immutable record containing the plan digest, the decisions, the deciding identity, the time, and the before and after digests of each touched item, and SHALL append a control event. Re-applying the same record SHALL change nothing.

#### Scenario: Record written
- **WHEN** a reconciliation is applied
- **THEN** one record exists naming the decisions and the touched items' digests

#### Scenario: Repeat apply
- **WHEN** the same plan digest and decisions are applied again
- **THEN** no item and no record changes

### Requirement: Reconciliation help and guidance
Help SHALL document `--plan`, `--apply`, the decisions file format, and each decision. The shipped OpenSpec and coordinator skills SHALL tell the session to run the plan when sync reports a reconciliation error, and not to create a separate change as a workaround.

#### Scenario: Help names the decisions
- **WHEN** the user runs `idefactory help sync-tasks`
- **THEN** the output names `--plan`, `--apply`, and each decision

#### Scenario: Skill points to the plan
- **WHEN** the installed factory-openspec skill is read
- **THEN** it names `sync-tasks --plan` as the response to a reconciliation error
