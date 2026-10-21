# Spec Delta

## Purpose

Makes completion recoverable across process crashes by journaling deterministic writes and committing the work item only after every other required state is durable.

## ADDED Requirements

### Requirement: Finalization journal
Before changing finalization targets, complete SHALL atomically persist a schema-versioned journal bound to the change, task, attempt, and clean source revision. The journal SHALL identify each target's expected before and after digest, one stable completion date, and the ordered steps. An unsupported schema, unreadable journal, identity mismatch, or source-revision mismatch SHALL fail closed without marking the item done.

#### Scenario: Prepared journal
- **WHEN** an accepted attempt with valid evidence starts completion
- **THEN** a journal bound to its change, task, attempt, and source revision exists before a finalization target changes

#### Scenario: Corrupt journal
- **WHEN** a journal is unreadable or has an unsupported schema version
- **THEN** complete exits with an error
- **AND** the work item is not marked done

### Requirement: Last-write commit point
Complete SHALL make the atomic work-item status update to `done` the last correctness-critical finalization write. Before that write, the journal SHALL be ready to commit, the OpenSpec checkbox SHALL be checked, the scribe and identity records SHALL contain the finalization, the attempt SHALL be finalized, and the work index SHALL contain the intended result.

#### Scenario: Successful commit
- **WHEN** complete returns success
- **THEN** every required pre-commit target has its journaled after digest
- **AND** the work item is done

#### Scenario: Failure before commit
- **WHEN** a correctness-critical finalization write before the commit point fails
- **THEN** complete exits with an error
- **AND** the work item is not done

### Requirement: Idempotent recovery
When a journal exists and the work item is not done, rerunning complete for the same change, task, and attempt SHALL resume its unfinished steps. A target already at its journaled after digest SHALL be skipped. A target at neither the before nor after digest SHALL cause a conflict error without marking the item done.

#### Scenario: Resume after crash
- **WHEN** a prior complete stopped after one or more pre-commit writes
- **THEN** rerunning the same complete reaches one finalized state
- **AND** it does not duplicate a scribe entry, attempt history event, or checkbox edit

#### Scenario: External conflict
- **WHEN** a journal target differs from both its expected before and after content
- **THEN** recovery exits with a conflict error
- **AND** the work item remains not done

### Requirement: Repeat after commit
When the matching journal and work item already show a successful commit, repeating complete SHALL return the same finalized result without changing finalization targets or duplicating records.

#### Scenario: Repeat successful completion
- **WHEN** complete is repeated after the work item commit point
- **THEN** it succeeds without changing target bytes
- **AND** the scribe and attempt histories contain one finalization event each

### Requirement: Crash-boundary verification
The finalizer SHALL expose deterministic in-process fault injection before and after every correctness-critical pre-commit write and immediately before the commit point. The hook SHALL be available to tests without adding a CLI flag or environment-controlled production bypass.

#### Scenario: Every injected crash is recoverable
- **WHEN** a test injects failure at any supported finalization boundary
- **THEN** the work item is not done after the failed call
- **AND** a call without injection recovers to one consistent finalized result
