# guided-build Specification

## Purpose
Gives the IDE one role-scoped packet for the next factory work item and requires test-first work plus a separate review.

## Requirements

### Requirement: One role per packet
`idefactory next` and `idefactory run` SHALL name exactly one active role and SHALL include only that role's charter and history paths as required role context.

#### Scenario: Engineer packet
- **WHEN** a work item is ready and next runs
- **THEN** the packet names the engineer role and the engineer charter and history paths
- **AND** it does not include other agents' charters as required reading

### Requirement: Method and review
The work packet and factory skills SHALL require a failing test before production code when the verification profile includes a test check, verification evidence produced by the verification command before review, and review by a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read for a tested work item
- **THEN** it requires a failing test first, verification, and a different role for review

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous build loop. Human-started orchestration SHALL return one role-scoped request only when the persisted session still has remaining budget and the work state changed since the previous request.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

#### Scenario: Run requests an IDE step
- **WHEN** run reaches a work item stage that needs an IDE role and the persisted session has remaining budget and a changed work state
- **THEN** it exits with the needs-agent code and prints one role-scoped orchestration request
- **AND** it does not spawn a model process

#### Scenario: Budget stops the request
- **WHEN** the persisted session has no remaining agent-step budget
- **THEN** run does not exit with the needs-agent code
- **AND** it prints no orchestration request

#### Scenario: Unchanged work stops the request
- **WHEN** the work state is unchanged since the previous request
- **THEN** run prints no orchestration request
- **AND** it does not spawn a model process

### Requirement: Halt
When a file named `HALT` exists in the project root, next, sync-tasks, run, attempt mutations, and complete SHALL refuse to mutate factory state.

#### Scenario: Halt file
- **WHEN** `HALT` exists and run executes
- **THEN** the command exits with an error and does not emit an agent request

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes. Review notes are accepted from the reviewer. Red, verification, and security check records SHALL be retained only when the verification command wrote them.

#### Scenario: Illegal transition
- **WHEN** an attempt transition skips from assigned directly to accepted
- **THEN** the command exits with an illegal-transition error

#### Scenario: Caller-supplied check result
- **WHEN** an attempt transition includes a caller-supplied red, verification, or security result
- **THEN** the transition is rejected and the attempt does not store that result

### Requirement: Security review stage
Run SHALL request the security-reviewer role before the reviewer when a work item's `securityProfile` is `security-sensitive` or when its checks include a security-patterned check (for example threat-review, sast, secret, or audit). Run SHALL NOT treat `verificationProfile` alone as that trigger. For that work, a transition from `verifying` to `awaiting-review` SHALL be rejected and SHALL leave the attempt state unchanged.

#### Scenario: Security-sensitive verification
- **WHEN** an attempt whose work item has `securityProfile: security-sensitive` or a security-patterned check reaches verification
- **THEN** the next orchestration request names the security-reviewer role

#### Scenario: Direct review is rejected
- **WHEN** that attempt transitions from `verifying` to `awaiting-review`
- **THEN** the transition is rejected
- **AND** the attempt remains in `verifying`

### Requirement: Separate reviewer
Completion SHALL require recorded implementer and reviewer identifiers and SHALL refuse when the two identifiers are equal.

#### Scenario: Same reviewer and implementer
- **WHEN** complete receives an accepted attempt whose reviewer identifier equals its implementer identifier
- **THEN** completion fails and the work item remains unfinished

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and, for every required check, a schema-valid passing attestation whose exit code is zero and whose source revision equals the current clean HEAD. It SHALL journal deterministic target contents, idempotently apply every pre-commit target, and atomically mark the work item done as the final correctness-critical write. A failure before that commit point SHALL leave the item not done and recoverable by repeating complete. When the verification profile `humanGate` is true, complete SHALL also require a valid scoped approval whose action is `complete`.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers, a schema-valid passing attestation for every required check at the current clean HEAD, and a verification profile whose `humanGate` is false
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

#### Scenario: Forged pass boolean
- **WHEN** an attempt carries a caller-supplied check object whose pass boolean is true and no verification-command attestation
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Unknown or unmapped check
- **WHEN** a required check kind is absent from the registry or has no argv mapping
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Stale source revision
- **WHEN** a required attestation names a source revision other than the current clean HEAD
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Gated completion
- **WHEN** `humanGate` is true and no valid `complete` approval exists
- **THEN** complete fails and the work item remains unfinished
