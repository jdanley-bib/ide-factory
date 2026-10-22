# Spec Delta

## MODIFIED Requirements

### Requirement: Method and review
The work packet and factory skills SHALL require a failing test before production code when the verification profile includes a test check, verification evidence produced by the verification command before review, and review by a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read for a tested work item
- **THEN** it requires a failing test first, verification, and a different role for review

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes. Review notes are accepted from the reviewer. Red, verification, and security check records SHALL be retained only when the verification command wrote them.

#### Scenario: Illegal transition
- **WHEN** an attempt transition skips from assigned directly to accepted
- **THEN** the command exits with an illegal-transition error

#### Scenario: Caller-supplied check result
- **WHEN** an attempt transition includes a caller-supplied red, verification, or security result
- **THEN** the transition is rejected and the attempt does not store that result

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt and, for every required check, a schema-valid passing attestation whose exit code is zero and whose source revision equals the current clean HEAD. It SHALL then mark the work item and matching OpenSpec checkbox complete and record finalization.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers and a schema-valid passing attestation for every required check at the current clean HEAD
- **THEN** the work item is done, the matching checkbox is checked, and the attempt is finalized

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized

#### Scenario: Forged pass boolean
- **WHEN** an attempt carries a caller-supplied check object whose pass boolean is true and no verification-command attestation
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Unknown or unmapped check
- **WHEN** a required check kind is absent from the registry or has no argv mapping
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Stale source revision
- **WHEN** a required attestation names a source revision other than the current clean HEAD
- **THEN** complete fails and the work item remains unfinished
