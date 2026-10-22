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

### Requirement: Durable commit target on journal
The schema version 1 journal SHALL durably include the work-item commit target (exact after bytes and digests) and the frozen `finalizedAt` timestamp so process-restart recovery can apply the commit without rebuilding plan bytes. That commit target SHALL NOT be a pre-commit target and SHALL remain the atomic last write.

#### Scenario: Journal carries commit bytes
- **WHEN** a prepared journal exists
- **THEN** it includes the durable work-item commit target and frozen `finalizedAt`
- **AND** those fields are used unchanged on process-restart recovery

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
- **AND** the commit uses the journaled commit-target bytes and frozen `finalizedAt`

#### Scenario: External conflict
- **WHEN** a journal target differs from both its expected before and after content
- **THEN** recovery exits with a conflict error
- **AND** the work item remains not done

### Requirement: Finalize-failed only before journal durability
Complete MAY write attempt status `finalize-failed` only when failure occurs before journal durability. After the journal is durable, recovery SHALL replay frozen attempt bytes and SHALL NOT rewrite the attempt to `finalize-failed`.

#### Scenario: Failure before journal durability
- **WHEN** completion fails before the journal is durable
- **THEN** complete MAY record attempt status `finalize-failed`
- **AND** the work item is not done

#### Scenario: Failure after journal durability
- **WHEN** completion fails after the journal is durable and the work item is not done
- **THEN** complete does not rewrite the attempt to `finalize-failed`
- **AND** a later retry resumes from the frozen journal bytes

### Requirement: Dirty worktree only for partial finalization
A retry MAY proceed with a dirty worktree only when that dirt is exactly partial finalization state from journaled targets and a valid journal remains bound to an unchanged clean source HEAD. Unrelated dirt, a changed HEAD, a missing or unbound journal, or a target conflict SHALL fail closed.

#### Scenario: Dirty worktree from partial finalization
- **WHEN** a valid journal remains bound to the current clean source HEAD and the only worktree dirt is partial application of that journal's targets
- **THEN** rerunning complete may proceed and resume those targets

#### Scenario: Unrelated dirty worktree or HEAD drift
- **WHEN** the worktree has dirt unrelated to journaled finalization targets, or HEAD no longer equals the journaled source revision, or a target conflicts
- **THEN** recovery fails closed
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
