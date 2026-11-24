# Spec Delta

## MODIFIED Requirements

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes. Review notes are accepted from the reviewer. Red, verification, and security check records SHALL be retained only when the verification command wrote them. A `code` attempt SHALL NOT enter `verifying` until each required test kind has a stored failing red record or a valid red exception from the red-evidence-exceptions capability. A `lightweight` attempt MAY enter `verifying` from `implementing` with no red record.

#### Scenario: Illegal transition
- **WHEN** an attempt transition skips from assigned directly to accepted
- **THEN** the command exits with an illegal-transition error

#### Scenario: Caller-supplied check result
- **WHEN** an attempt transition includes a caller-supplied red, verification, or security result
- **THEN** the transition is rejected and the attempt does not store that result

#### Scenario: Code attempt needs every test kind
- **WHEN** a `code` attempt requires `unit` and `integration` and only `unit` has a stored failing red record
- **THEN** the transition into `verifying` is rejected

#### Scenario: Exception satisfies one kind
- **WHEN** a `code` attempt requires `unit` and `integration`, has a stored failing red record for `unit`, and has a valid red exception for `integration`
- **THEN** the transition into `verifying` is accepted

#### Scenario: Lightweight attempt skips red
- **WHEN** a `lightweight` attempt transitions from `implementing` to `verifying` with no red record
- **THEN** the transition is accepted

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and, for every required check, a schema-valid passing attestation whose exit code is zero and whose source revision equals the current clean HEAD. A `code` item SHALL also have, for each required test kind, a stored failing CLI red record or a valid red exception from the red-evidence-exceptions capability. A `lightweight` item SHALL NOT require a red record.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted `code` attempt with distinct role identifiers, a schema-valid passing attestation for every required check at the current clean HEAD, a stored failing red record or valid red exception for each required test kind, and a verification profile whose `humanGate` is false
- **THEN** the matching journal is ready to commit, the OpenSpec checkbox is checked, scribe and identity records are current, the attempt is finalized, and the work item is done
- **AND** the atomic work-item done update was the final correctness-critical write
- **AND** the journal includes the durable commit target and frozen `finalizedAt` applied last, not as a pre-commit target

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

#### Scenario: Lightweight completion without red
- **WHEN** complete receives an accepted `lightweight` attempt that meets every passing-attestation requirement and has no red record
- **THEN** the missing red record does not fail completion

#### Scenario: Code completion missing one red kind
- **WHEN** a `code` item requires `unit` and `integration` and the attempt has a failing red record for `unit` only
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Code completion with an exception
- **WHEN** a `code` item requires `unit` and the accepted attempt has a valid reuse exception for `unit` and every other completion requirement
- **THEN** complete succeeds
- **AND** the attempt still has no CLI red record for `unit`

#### Scenario: Altered exception at completion
- **WHEN** the attempt's only red for a required kind is an exception whose file no longer matches its stored digest
- **THEN** complete fails and the work item remains unfinished
