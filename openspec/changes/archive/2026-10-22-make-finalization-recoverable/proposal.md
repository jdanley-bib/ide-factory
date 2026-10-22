# Proposal

## Why

`complete` marks a work item done before updating the OpenSpec checkbox, scribe memory, and attempt. A crash can therefore claim completion while later writes are missing. Lockouts have no supported resolution, and the one-writer rule is advisory, so recovery currently requires manual file edits and concurrent commands can race.

## What Changes

- **BREAKING:** `complete` uses a versioned transaction journal and writes the work item `done` marker last. A crash before that commit point leaves the item not done; rerunning the same completion resumes the journal idempotently without duplicate history or notes.
- Add deterministic fault injection around every correctness-critical finalization write and crash-recovery tests for each boundary.
- Replace filename-only lockout detection with versioned lockout records and a supported `lockout resolve` command. Resolution preserves the creation and resolution events and is idempotent.
- Enforce one writer for mutating CLI commands with an atomic, expiring lease. A concurrent writer fails clearly without running its mutation; a crashed writer's stale lease can be reclaimed.
- Keep `HALT` available as the safety override while a writer lease is held. Read-only commands do not take the lease.

Out of scope:

- CI workflows, branch protection, scanners, SBOMs, SLSA or other provenance.
- OpenTelemetry, dashboards, metrics export, retention, and operational runbooks.
- Distributed coordination, network locks, database transactions, or multi-repository leases.
- Host-issued identity and cryptographic signatures for lease owners or lockout resolvers.
- Changing verification evidence, approval scope, security-stage policy, or run-session budgets.
- Archiving earlier changes, or editing `.factory/` execution state in this planning change.

## Capabilities

### New Capabilities

- `recoverable-finalization`: Versioned completion journals, a last-write commit point, idempotent recovery, and crash-boundary guarantees.
- `writer-lease`: Command-scoped, expiring one-writer leases for factory mutations.

### Modified Capabilities

- `guided-build`: Finalization becomes journaled, resumable, and committed only when the work item is atomically marked done.
- `human-governance`: Lockout records gain a supported, history-preserving resolution path.

## Impact

- Affected specs: new `recoverable-finalization` and `writer-lease`; modified `guided-build` and `human-governance`.
- Affected runtime, when applied: top-level CLI mutation dispatch, `complete`, work-item/index writes, attempt finalization, OpenSpec checkbox updates, scribe memory, lockout creation/detection/resolution, and the factory governance skill text.
- Affected state, when applied: journals under `.factory/orchestration/finalizations/`, the active writer lease under `.factory/orchestration/`, and lockout event records under `.factory/orchestration/lockouts/`.
- Dependencies: no package, service, model launcher, database, or network coordinator.
- Verification commands for this planning change: `npx openspec validate make-finalization-recoverable --strict` and `npm test`.
- Threats, migration, rollback, and exact commit-point decisions are specified in `design.md`. This proposal does not apply, implement, or archive the change.

## Acceptance criteria

- Strict validation of this change passes, and `npm test` passes with no runtime or `.factory/` execution edits in the planning commit.
- After implementation, fault injection before or after each correctness-critical pre-commit write leaves the work item status other than `done`. Re-running `complete` for that attempt reaches one consistent finalized state without duplicate scribe entries, attempt history, or checkbox edits.
- After implementation, a successful completion has a ready-to-commit journal, a finalized attempt, a checked matching OpenSpec task, one scribe entry, a matching identity note, and a work item whose atomic `done` write was the transaction's final correctness-critical write.
- After implementation, an active lockout blocks completion. `lockout resolve <id>` with a distinct resolver and reason records one immutable resolution event; a repeat with the same inputs succeeds without duplication, and a conflicting repeat fails.
- After implementation, while one mutating command holds the writer lease, a second mutating command exits non-zero with a clear lease-held error and does not mutate factory state. Read-only commands and `halt` remain available.
- After implementation, a command releases its lease on normal success or error. A lease whose expiry has passed can be reclaimed by exactly one contender; a non-expired lease cannot be stolen.
