## MODIFIED Requirements

### Requirement: Scoped approval
An approval SHALL record the change, task, source revision, action, approver, issuance time, expiry time, and policy version. The action SHALL be one of the actions in the action table. The approver SHALL differ from the implementer. A task-bound approval SHALL authorize its action only while the source revision equals the current clean HEAD and the policy version matches. A standing authorization is separate and is not bound to a task or revision.

#### Scenario: Matching approval authorizes the action
- **WHEN** every scope field matches the attempt, the current clean HEAD, and the requested action
- **THEN** that action is authorized

#### Scenario: Mismatched scope does not authorize
- **WHEN** the change, task, source revision, action, or policy version differs from the attempt
- **THEN** the approval does not authorize the action

#### Scenario: Same approver and implementer
- **WHEN** the approver identifier equals the implementer identifier
- **THEN** the approval does not authorize the action

#### Scenario: External-effect action approval
- **WHEN** an approval for `deploy` matches the change, task, target, current clean HEAD, and policy version
- **THEN** `deploy` is authorized for that target

### Requirement: Approval lifetime
The expiry time SHALL be later than issuance. A task-bound approval SHALL expire no more than 24 hours after issuance, and a standing authorization no more than the policy maximum after issuance. An approval SHALL authorize only when the current time is at or after issuance and before expiry.

#### Scenario: Expired approval
- **WHEN** the current time is at or after the expiry time
- **THEN** the approval does not authorize the action

#### Scenario: Lifetime too long
- **WHEN** a task-bound approval's expiry is more than 24 hours after issuance
- **THEN** the approval is not valid

## ADDED Requirements

### Requirement: Action table
The factory SHALL define each approvable action once, in a machine-readable table. The table SHALL contain `accept`, `complete`, `publish`, `deploy`, `spend`, and `account`. Each row SHALL name what the action binds to and whether a profile `humanGate` of false can waive it. Approve, authorize, validation, help, and the governance text SHALL read the same table.

#### Scenario: Every action is accepted
- **WHEN** approve is run with each action in the table
- **THEN** the action is accepted as valid

#### Scenario: Unknown action
- **WHEN** approve or authorize is run with an action not in the table
- **THEN** the command exits non-zero, writes nothing, and lists the valid actions

### Requirement: External-effect actions always need approval
The actions `publish`, `deploy`, `spend`, and `account` SHALL require a valid authorization whatever the profile `humanGate` value. Only `accept` and `complete` MAY be waived by a profile `humanGate` of false.

#### Scenario: Profile gate off does not waive deploy
- **WHEN** the profile `humanGate` is false and no valid authorization for `deploy` exists
- **THEN** `deploy` is not authorized

### Requirement: Authorization check
`idefactory authorize --change <c> [--task <t>] --action <a> [--target <x>]` SHALL report whether the action is authorized and SHALL NOT write any file or perform the action. With `--json` it SHALL print `authorized`, the approval id when allowed, and otherwise a `reason` from the closed set below plus the `approve` command a human would run. It SHALL exit zero for both outcomes.

#### Scenario: Authorized
- **WHEN** a matching valid approval exists
- **THEN** the output has `authorized: true` and names the approval id
- **AND** no file is written

#### Scenario: Not authorized
- **WHEN** no approval exists for the action
- **THEN** the output has `authorized: false` and reason `no-approval`
- **AND** it names the `approve` command with the change, action, and target filled in

#### Scenario: Revision moved
- **WHEN** an approval exists whose source revision is not the current clean HEAD
- **THEN** the reason is `revision-mismatch`

#### Scenario: Closed reason set
- **WHEN** authorize reports `authorized: false`
- **THEN** the reason is one of `no-approval`, `expired`, `revoked`, `revision-mismatch`, `dirty-worktree`, `same-approver`, `policy-mismatch`, `principal-required`, or `target-mismatch`

### Requirement: Standing authorization
At policy version 2, a verified principal MAY record a standing authorization bound to one change, one external-effect action, and one target, with no task and no revision. It SHALL expire no later than the governance policy maximum, which SHALL default to 168 hours and SHALL be configurable up to 720 hours. At policy version 1, and for `accept` and `complete`, a standing authorization SHALL NOT be recorded.

#### Scenario: Standing authorization across commits
- **WHEN** a valid standing authorization for `deploy` of the change to target `staging` exists and HEAD has moved
- **THEN** authorize reports `deploy` of that change to `staging` as authorized

#### Scenario: Other target
- **WHEN** the requested target differs from the standing authorization's target
- **THEN** the reason is `target-mismatch`

#### Scenario: Standing gate action refused
- **WHEN** a standing authorization is requested for `accept`
- **THEN** the command exits non-zero and writes nothing

#### Scenario: Policy version 1
- **WHEN** a standing authorization is requested at policy version 1
- **THEN** the command exits non-zero and writes nothing

#### Scenario: Lifetime above the maximum
- **WHEN** a standing authorization's expiry exceeds the policy maximum
- **THEN** the command exits non-zero and writes nothing

### Requirement: Revocation
`idefactory revoke <id> --note "..."` SHALL record a revocation for an existing approval or standing authorization in the approvals directory and `decisions.md`, and the revoked record SHALL NOT authorize any action afterward. The original record SHALL be left unchanged.

#### Scenario: Revoked
- **WHEN** an authorization is revoked
- **THEN** authorize reports reason `revoked`
- **AND** the original approval file is unchanged

#### Scenario: Unknown id
- **WHEN** revoke names an id with no approval
- **THEN** the command exits non-zero and writes nothing
