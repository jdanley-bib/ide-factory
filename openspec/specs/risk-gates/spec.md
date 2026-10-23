# risk-gates Specification

## Purpose
Makes profile human gates and scoped approvals executable, and requires the security stage plus its evidence before review of security-sensitive work.

## Requirements

### Requirement: Profile human gate
The run and complete commands SHALL read `humanGate` from the work item's verification profile. When that value is true, accepting the attempt and completing the item SHALL each require a valid scoped approval for that action. Without it, run SHALL emit no request and SHALL report stop reason `human-gate` without closing the session. Complete SHALL exit with an error and SHALL NOT mark the item done.

#### Scenario: Accept stops at the gate
- **WHEN** `humanGate` is true, no valid `accept` approval exists, and the next step would accept the attempt
- **THEN** run prints no orchestration request
- **AND** the reported stop reason is `human-gate`
- **AND** the run session stays open

#### Scenario: Completion stops at the gate
- **WHEN** `humanGate` is true and no valid `complete` approval exists
- **THEN** complete exits with an error
- **AND** the work item is not done

### Requirement: Missing gate value
When the verification profile is missing, or `humanGate` is not a boolean, the factory SHALL treat the gate as true.

#### Scenario: Non-boolean gate
- **WHEN** the profile `humanGate` is not a boolean and no valid approval exists
- **THEN** run reports stop reason `human-gate` and prints no orchestration request

### Requirement: Scoped approval
An approval SHALL record the change, task, source revision, action, approver, issuance time, expiry time, and policy version. The action SHALL be `accept` or `complete`. The approver SHALL differ from the implementer. The approval SHALL authorize that action only while the source revision equals the current clean HEAD and the policy version matches. When governance policy version is 2, only a schema version 2 approval whose approver equals a verified principal subject SHALL authorize the action. A schema version 1 approval SHALL NOT authorize an action at policy version 2. At policy version 1, a schema version 1 approval SHALL authorize as before.

#### Scenario: Matching approval authorizes the action
- **WHEN** every scope field matches the attempt, the current clean HEAD, and the requested action
- **THEN** that action is authorized

#### Scenario: Mismatched scope does not authorize
- **WHEN** the change, task, source revision, action, or policy version differs from the attempt
- **THEN** the approval does not authorize the action

#### Scenario: Same approver and implementer
- **WHEN** the approver identifier equals the implementer identifier
- **THEN** the approval does not authorize the action

#### Scenario: Policy version 2 rejects a schema 1 approval
- **WHEN** governance policy version is 2 and the only matching approval is schema version 1
- **THEN** the approval does not authorize the action

#### Scenario: Verified principal authorizes policy version 2
- **WHEN** governance policy version is 2 and a schema version 2 approval matches the action and its approver equals the verified principal subject
- **THEN** that action is authorized

### Requirement: Approval lifetime
The expiry time SHALL be later than issuance and no more than 24 hours after issuance. An approval SHALL authorize a gate only when the current time is at or after issuance and before expiry.

#### Scenario: Expired approval
- **WHEN** the current time is at or after the expiry time
- **THEN** the approval does not authorize the action

#### Scenario: Lifetime too long
- **WHEN** expiry is more than 24 hours after issuance
- **THEN** the approval is not valid

### Requirement: Security stage
When `securityProfile` is `security-sensitive`, or a check is security-patterned (for example threat-review, sast, secret, or audit), the attempt SHALL enter `security-checking` before `awaiting-review`. A transition from `verifying` to `awaiting-review` SHALL be rejected and SHALL leave the state unchanged. `verificationProfile` alone SHALL NOT require this stage.

#### Scenario: Bypass is rejected
- **WHEN** security-sensitive work transitions from `verifying` to `awaiting-review`
- **THEN** the transition is rejected
- **AND** the attempt remains in `verifying`

#### Scenario: Profile name alone does not require the stage
- **WHEN** the only security-looking value is `verificationProfile` and no security-patterned check or `securityProfile` is set
- **THEN** a transition from `verifying` to `awaiting-review` is legal

### Requirement: Security evidence
Moving from `security-checking` to `awaiting-review` SHALL require a passing CLI security record for each required security check kind, bound to that attempt and the current clean source revision. A red result or a caller-supplied security payload SHALL NOT count. When no check is security-patterned, the required kind SHALL be `threat-review`.

#### Scenario: Missing security record
- **WHEN** security-checking work moves to `awaiting-review` without a passing CLI security record
- **THEN** the transition is rejected
- **AND** the attempt remains in `security-checking`

#### Scenario: Passing record allows review
- **WHEN** a passing CLI security record for each required kind is bound to the attempt and the current clean source revision
- **THEN** the transition to `awaiting-review` succeeds

#### Scenario: Red result is not security evidence
- **WHEN** the only new security result is a recorded red result
- **THEN** the transition to `awaiting-review` is rejected

### Requirement: Ungated review
When `humanGate` is false and the security stage is not required, run SHALL request review without an approval, and a transition from `verifying` to `awaiting-review` SHALL be legal.

#### Scenario: False gate
- **WHEN** `humanGate` is false and the work is not security-sensitive
- **THEN** run may request review without an approval

### Requirement: Skill stop text
Each shipped factory-run skill copy SHALL describe `human-gate` as the stop for a true profile `humanGate`, and SHALL NOT describe that stop as the release profile alone.

#### Scenario: Skill copies
- **WHEN** the factory-run skill copies under `.cursor/skills`, `.github/skills`, `.agents/skills`, `.claude/skills`, and `templates/skills` are read
- **THEN** each describes `human-gate` as the profile `humanGate` stop
- **AND** none limits that stop to the release profile alone
