## MODIFIED Requirements

### Requirement: Method and review
The work packet and factory skills SHALL require a failing test before production code only when the work item's task class is `code`, its verification profile includes a test check, and the attempt has no recorded `no-red` method covering that check kind. A `lightweight` item SHALL NOT require a failing test. For a `code` item the skills SHALL name `idefactory verify run --check <kind> --red` for the failing test and `idefactory verify run --check <kind>` for the passing run. The skills SHALL NOT tell the session to attach a pass boolean to an attempt transition. Verification evidence SHALL still be produced by the verification command before review, and review SHALL still be a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read for a `code` work item whose profile includes a test check
- **THEN** it requires `idefactory verify run` with `--red` before production code, a later passing `idefactory verify run`, and a different role for review

#### Scenario: Build skill for a lightweight item
- **WHEN** the factory-build skill is read for a `lightweight` work item
- **THEN** it does not require a failing test before production code

#### Scenario: Packet with a recorded method
- **WHEN** a packet is rendered for a `code` attempt whose `no-red` method covers `unit`
- **THEN** it does not require a failing test for `unit`
- **AND** it states the method and that a method review is required

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes. Review notes are accepted from the reviewer. Red, verification, and security check records SHALL be retained only when the verification command wrote them. A `code` attempt SHALL NOT enter `verifying` until each required test kind has a stored failing red record, a valid red exception from the red-evidence-exceptions capability, or a recorded `no-red` method from the red-method capability that covers it. A `lightweight` attempt MAY enter `verifying` from `implementing` with no red record.

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

#### Scenario: Method satisfies one kind
- **WHEN** a `code` attempt requires `unit` and `integration`, has a stored failing red record for `unit`, and has a recorded `no-red` method covering `integration`
- **THEN** the transition into `verifying` is accepted

#### Scenario: Lightweight attempt skips red
- **WHEN** a `lightweight` attempt transitions from `implementing` to `verifying` with no red record
- **THEN** the transition is accepted

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and, for every required check, a schema-valid passing attestation whose exit code is zero and whose source revision equals the current clean HEAD. A `code` item SHALL also have, for each required test kind, a stored failing CLI red record, a valid red exception from the red-evidence-exceptions capability, or an accepted `no-red` method from the red-method capability that covers it. A `lightweight` item SHALL NOT require a red record.

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

#### Scenario: Code completion with an accepted method
- **WHEN** a `code` item requires `unit` and the accepted attempt has a `no-red` method covering `unit` with an `ACCEPT` method review and every other completion requirement
- **THEN** complete succeeds
- **AND** the attempt still has no CLI red record for `unit`

#### Scenario: Altered method at completion
- **WHEN** the attempt's only satisfier for a required kind is a method whose file no longer matches its stored digest
- **THEN** complete fails and the work item remains unfinished
