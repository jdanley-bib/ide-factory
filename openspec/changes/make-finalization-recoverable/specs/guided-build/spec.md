# Spec Delta

## MODIFIED Requirements

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and passing evidence for every required check. It SHALL journal deterministic target contents, idempotently apply every pre-commit target, and atomically mark the work item done as the final correctness-critical write. A failure before that commit point SHALL leave the item not done and recoverable by repeating complete.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers and all required evidence
- **THEN** the matching journal is ready to commit, the OpenSpec checkbox is checked, scribe and identity records are current, the attempt is finalized, and the work item is done
- **AND** the atomic work-item done update was the final correctness-critical write
- **AND** the journal includes the durable commit target and frozen `finalizedAt` applied last, not as a pre-commit target

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized

#### Scenario: Recover interrupted completion
- **WHEN** complete is repeated for a matching journal whose work item is not done
- **THEN** it resumes remaining journal steps without duplicate finalization records
- **AND** it marks the item done only after every pre-commit target matches the journal
- **AND** the commit uses the journaled commit-target bytes and frozen `finalizedAt`

#### Scenario: Finalize-failed only before journal
- **WHEN** completion fails before the journal is durable
- **THEN** complete MAY record attempt status `finalize-failed`
- **AND** after journal durability it resumes frozen bytes instead of rewriting finalize-failed

#### Scenario: Dirty worktree only for partial finalization
- **WHEN** retry dirt is exactly partial journaled finalization and a valid journal remains bound to unchanged clean source HEAD
- **THEN** complete may proceed
- **AND** unrelated dirt, HEAD drift, or conflict fails closed
