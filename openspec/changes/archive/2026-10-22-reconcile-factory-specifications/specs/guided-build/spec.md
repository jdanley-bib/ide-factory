# Spec Delta

## MODIFIED Requirements

### Requirement: One role per packet
`idefactory next` and `idefactory run` SHALL name exactly one active role and SHALL include only that role's charter and history paths as required role context.

#### Scenario: Engineer packet
- **WHEN** a work item is ready and next runs
- **THEN** the packet names the engineer role and the engineer charter and history paths
- **AND** it does not include other agents' charters as required reading

### Requirement: Method and review
The work packet and factory skills SHALL require a failing test before production code when the verification profile includes a test check, verification evidence before review, and review by a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read for a tested work item
- **THEN** it requires a failing test first, verification, and a different role for review

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous build loop; human-started orchestration SHALL return a role-scoped request when an IDE agent step is needed.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

#### Scenario: Run requests an IDE step
- **WHEN** run reaches a work item stage that needs an IDE role
- **THEN** it exits with the needs-agent code and prints one role-scoped orchestration request
- **AND** it does not spawn a model process

### Requirement: Halt
When a file named `HALT` exists in the project root, next, sync-tasks, run, attempt mutations, and complete SHALL refuse to mutate factory state.

#### Scenario: Halt file
- **WHEN** `HALT` exists and run executes
- **THEN** the command exits with an error and does not emit an agent request

## ADDED Requirements

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes and retain evidence supplied for red, verification, security, and review stages.

#### Scenario: Illegal transition
- **WHEN** an attempt transition skips from assigned directly to accepted
- **THEN** the command exits with an illegal-transition error

### Requirement: Security review stage
Run SHALL request the security-reviewer role before the reviewer when a work item's `securityProfile` is `security-sensitive` or when its checks include a security-patterned check (for example threat-review, sast, secret, or audit). Run SHALL NOT treat `verificationProfile` alone as that trigger, and SHALL NOT make the security-checking transition mandatory.

#### Scenario: Security-sensitive verification
- **WHEN** an attempt whose work item has `securityProfile: security-sensitive` or a security-patterned check reaches verification
- **THEN** the next orchestration request names the security-reviewer role

### Requirement: Separate reviewer
Completion SHALL require recorded implementer and reviewer identifiers and SHALL refuse when the two identifiers are equal.

#### Scenario: Same reviewer and implementer
- **WHEN** complete receives an accepted attempt whose reviewer identifier equals its implementer identifier
- **THEN** completion fails and the work item remains unfinished

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt and passing evidence for every required check, then mark the work item and matching OpenSpec checkbox complete and record finalization.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers and all required evidence
- **THEN** the work item is done, the matching checkbox is checked, and the attempt is finalized

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized
