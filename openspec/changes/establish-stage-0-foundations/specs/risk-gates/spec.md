# risk-gates Specification

## MODIFIED Requirements

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
