# Spec Delta

## MODIFIED Requirements

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and passing evidence for every required check. It SHALL journal deterministic target contents, idempotently apply every pre-commit target, and atomically mark the work item done as the final correctness-critical write. A failure before that commit point SHALL leave the item not done and recoverable by repeating complete.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers and all required evidence
- **THEN** the matching journal is ready to commit, the OpenSpec checkbox is checked, scribe and identity records are current, the attempt is finalized, and the work item is done
- **AND** the atomic work-item done update was the final correctness-critical write

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized

#### Scenario: Recover interrupted completion
- **WHEN** complete is repeated for a matching journal whose work item is not done
- **THEN** it resumes remaining journal steps without duplicate finalization records
- **AND** it marks the item done only after every pre-commit target matches the journal
