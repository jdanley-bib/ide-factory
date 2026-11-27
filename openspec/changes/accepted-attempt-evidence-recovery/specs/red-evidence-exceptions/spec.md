## MODIFIED Requirements

### Requirement: Reuse of a rejected attempt's red
`idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>` SHALL record a reuse exception only when the source attempt is an earlier, `rejected` attempt for the same change and task as the target, and holds a valid failing CLI red for each named kind. The target SHALL be a `code` attempt that has not entered `verifying`, or an attempt reopened for each named kind under the evidence-recovery capability, and each kind SHALL be a required test kind of its work item.

#### Scenario: Eligible reuse
- **WHEN** a rejected attempt has a failing CLI red for `unit`
- **AND** a later attempt for the same task has not entered `verifying`
- **AND** a human runs reuse for `unit` with an approver and a reason
- **THEN** a reuse exception is recorded for `unit` on the later attempt
- **AND** the rejected attempt's file is unchanged

#### Scenario: Source not rejected
- **WHEN** the source attempt is not in state `rejected`
- **THEN** reuse fails and records nothing

#### Scenario: Source has no genuine red for the kind
- **WHEN** the source attempt has no failing CLI red for a named kind
- **THEN** reuse fails and records nothing

#### Scenario: Different task
- **WHEN** the source and target attempts belong to different changes or tasks
- **THEN** reuse fails and records nothing

#### Scenario: Lightweight target
- **WHEN** the target work item is `lightweight`
- **THEN** reuse fails and records nothing

#### Scenario: Reopened target
- **WHEN** the target attempt was reopened for `unit` and the other conditions hold
- **THEN** reuse for `unit` is recorded on the target attempt

#### Scenario: Reopened for a different kind
- **WHEN** the target attempt was reopened for `contract` and reuse names `unit`
- **THEN** reuse fails and records nothing

### Requirement: Red waiver override
`idefactory red waive <targetAttemptId> --kind <kind>` SHALL record a waiver exception for a `code` attempt that has not entered `verifying`, or that was reopened for that kind under the evidence-recovery capability, without requiring a source attempt or any earlier red. The waiver SHALL record that no red exists for that kind, the reason, and the approver. It SHALL be available to a human at any time, subject to the stuck warning.

#### Scenario: Waiver after a stuck signal
- **WHEN** the target attempt has a recorded `vacuous-red` for the kind
- **AND** a human runs waive with an approver and a reason
- **THEN** a waiver exception is recorded for that kind on that attempt
- **AND** the waiver file states that no red exists for the kind

#### Scenario: Waiver needs a reason
- **WHEN** waive runs with no reason
- **THEN** it fails and records nothing

#### Scenario: Waiver on a reopened attempt
- **WHEN** the target attempt was reopened for the kind and a human runs waive with an approver and a reason
- **THEN** a waiver exception is recorded for that kind on that attempt

#### Scenario: Waiver on an accepted attempt that was not reopened
- **WHEN** the target attempt is `accepted` and was not reopened
- **THEN** waive fails and the error names `idefactory attempt reopen`
