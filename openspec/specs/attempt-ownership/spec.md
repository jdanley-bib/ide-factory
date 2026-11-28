# attempt-ownership Specification

## Purpose
TBD - created by archiving change protect-attempt-ownership. Update Purpose after archive.

## Requirements

### Requirement: Start does not displace an active attempt
`attempt start` SHALL refuse when the work item's current attempt is live and has recorded evidence. A live attempt is one whose state is not `accepted`, `rejected`, or `abandoned`. Evidence is any red record or diagnostic, verification record, method proposal or review, red exception, or review verdict. The refusal SHALL be reported as a blocked state with invariant `attempt-active` that names the attempt id, its state, and a count of each kind of evidence, and SHALL write nothing.

#### Scenario: Start with evidence on the current attempt
- **WHEN** the current attempt has a verification record and `attempt start` runs for the same work item
- **THEN** the command is refused with invariant `attempt-active`
- **AND** the report names the current attempt id and its state
- **AND** the work item file and the attempts directory are unchanged

#### Scenario: Each kind of evidence blocks
- **WHEN** the current attempt has only a red record, only a method proposal, only a red exception, or only a review verdict
- **THEN** `attempt start` is refused for each case

### Requirement: Start reuses an empty live attempt
When the current attempt is live and has no recorded evidence, `attempt start` SHALL return that attempt, report that it was reused, and create no new attempt.

#### Scenario: Retried start
- **WHEN** `attempt start` runs twice in a row for the same work item
- **THEN** both calls return the same attempt id
- **AND** only one attempt file exists
- **AND** the work item file is byte-identical after the second call

### Requirement: Terminal attempts may be replaced with history
When the current attempt is `rejected` or `abandoned`, `attempt start` SHALL create a new attempt and point the work item at it. Every change of a work item's current attempt SHALL append an entry to the work item's attempt history with the previous attempt id (or null), the new attempt id, a cause of `first`, `after-rejection`, `after-abandon`, or `repair`, and the time. History SHALL be append-only and SHALL remain after the work item is completed.

#### Scenario: Start after rejection
- **WHEN** the current attempt is `rejected` and `attempt start` runs
- **THEN** a new attempt is created and becomes current
- **AND** history gains an entry with cause `after-rejection` naming both attempt ids

#### Scenario: First start
- **WHEN** `attempt start` runs for a work item with no attempt
- **THEN** history gains one entry with cause `first` and a null previous attempt id

#### Scenario: History survives completion
- **WHEN** a work item with history is completed
- **THEN** its history entries are still present

### Requirement: Pointer repair is previewed
`attempt repoint <change> <task> --attempt <id>` without `--apply` SHALL print the current and target attempt ids, an evidence summary of each, and a plan digest, and SHALL write nothing.

#### Scenario: Preview writes nothing
- **WHEN** `attempt repoint` runs without `--apply`
- **THEN** the output contains the plan digest and both evidence summaries
- **AND** every file under `.factory/` is unchanged

### Requirement: Pointer repair is applied against a digest
With `--apply`, `--plan-digest <digest>`, `--decided-by <identity>`, and `--reason <text>`, repoint SHALL recompute the digest and refuse if it differs. Otherwise it SHALL set the work item's current attempt to the target, append a history entry with cause `repair`, and record the decision under `.factory/work/repairs/`. It SHALL NOT modify any attempt file.

#### Scenario: Apply moves only the pointer
- **WHEN** repoint is applied with the matching digest, an identity, and a reason
- **THEN** the work item's current attempt is the target
- **AND** history gains a `repair` entry naming the previous and new attempt ids
- **AND** no attempt file changed

#### Scenario: Stale plan
- **WHEN** the work item changes between preview and apply
- **THEN** apply is refused because the digest no longer matches
- **AND** nothing is written

#### Scenario: Missing decision fields
- **WHEN** apply is run without `--decided-by`, `--plan-digest`, or `--reason`
- **THEN** it is refused and nothing is written

### Requirement: Repair identity is checked
When the attempt being displaced has recorded evidence, repair SHALL require a `--decided-by` identity that differs from that attempt's implementer, and under policy version 2 SHALL require the project's principal verifier to confirm it. When the displaced attempt has no evidence, any recorded identity SHALL be accepted.

#### Scenario: Implementer repairs own displaced attempt
- **WHEN** the displaced attempt has evidence and `--decided-by` equals its implementer
- **THEN** apply is refused and nothing is written

#### Scenario: Empty displaced attempt
- **WHEN** the displaced attempt has no evidence
- **THEN** any recorded identity is accepted

### Requirement: Repair targets are checked
The target attempt SHALL exist, belong to the same change and task, differ from the current attempt, and be neither `rejected` nor `abandoned`. Repair SHALL be refused while HALT is set.

#### Scenario: Wrong target
- **WHEN** the target belongs to another task, equals the current attempt, or is rejected
- **THEN** repair is refused with a message naming which rule failed

#### Scenario: Halted
- **WHEN** HALT is set
- **THEN** repair is refused

### Requirement: Orphan attempts are reported
`run` and `status` SHALL report any attempt file that matches a work item's change and task but is neither the item's current attempt nor in its history. The notice SHALL name the attempt id and the `attempt repoint` command and SHALL NOT stop the run.

#### Scenario: Orphan present
- **WHEN** an attempt file for a work item is not referenced by that item
- **THEN** `status` and `run` print a notice naming it and the repair command
- **AND** `run` continues as it would without the notice

#### Scenario: Repaired orphan
- **WHEN** a repair appends the displaced attempt to history
- **THEN** that attempt is no longer reported as an orphan
