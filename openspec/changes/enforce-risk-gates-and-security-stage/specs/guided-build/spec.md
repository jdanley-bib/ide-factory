# Spec Delta

## MODIFIED Requirements

### Requirement: Security review stage
Run SHALL request the security-reviewer role before the reviewer when a work item's `securityProfile` is `security-sensitive` or when its checks include a security-patterned check (for example threat-review, sast, secret, or audit). Run SHALL NOT treat `verificationProfile` alone as that trigger. For that work, a transition from `verifying` to `awaiting-review` SHALL be rejected and SHALL leave the attempt state unchanged.

#### Scenario: Security-sensitive verification
- **WHEN** an attempt whose work item has `securityProfile: security-sensitive` or a security-patterned check reaches verification
- **THEN** the next orchestration request names the security-reviewer role

#### Scenario: Direct review is rejected
- **WHEN** that attempt transitions from `verifying` to `awaiting-review`
- **THEN** the transition is rejected
- **AND** the attempt remains in `verifying`

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt and passing evidence for every required check. When the verification profile `humanGate` is true, complete SHALL also require a valid scoped approval whose action is `complete`. Complete SHALL then mark the work item and matching OpenSpec checkbox complete and record finalization.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted attempt with distinct role identifiers, all required evidence, and a verification profile whose `humanGate` is false
- **THEN** the work item is done, the matching checkbox is checked, and the attempt is finalized

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized

#### Scenario: Gated completion
- **WHEN** `humanGate` is true and no valid `complete` approval exists
- **THEN** complete fails and the work item remains unfinished
