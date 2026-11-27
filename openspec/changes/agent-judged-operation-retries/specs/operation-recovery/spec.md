## Purpose
Lets a cloud agent evaluate why an external operation failed and decide whether to retry, with the facts it needs, a recorded decision, and guards that stop an uncertain effect from being duplicated.

## ADDED Requirements

### Requirement: Operations carry facts for judging a failure
Each operation in a plan SHALL carry `repeat`, either `safe` when repeating it cannot change the outcome or `check-first` when repeating it could duplicate an effect, and `verify`, the read operation that shows whether its effect landed. These facts SHALL be part of the plan content, so the plan id changes if they change.

#### Scenario: Create is check-first
- **WHEN** a plan contains an operation that creates a work item or a pull request
- **THEN** its `repeat` is `check-first`
- **AND** its `verify` names the read that lists or gets the created item

#### Scenario: Revision-tested update is safe
- **WHEN** a plan contains an update that begins with a revision test
- **THEN** its `repeat` is `safe`

### Requirement: The agent decides after a failure
The shipped cloud skill SHALL tell the agent, when an operation fails, to evaluate the cause, decide whether the effect may have landed, and choose to retry unchanged, retry after a read-back, regenerate the plan, treat the operation as applied, abandon, or escalate. It SHALL NOT tell the agent to stop on the first failed operation.

#### Scenario: Skill does not stop on first failure
- **WHEN** the shipped factory-cloud skill is read
- **THEN** it does not say to stop when an operation fails
- **AND** it names the options and the facts that inform the choice

### Requirement: Decisions are recorded
`idefactory mcp record <planId>` SHALL append one record naming the operation, the outcome (`applied`, `failed`, or `unknown`), the cause, the decision, and, when relevant, the read-back result. Causes SHALL be `transient`, `conflict`, `permission`, `invalid-request`, `not-found`, or `unknown`. Decisions SHALL be `retry`, `retry-after-readback`, `skip-applied`, `replan`, `abandon`, or `escalate`. A record SHALL NOT change the plan.

#### Scenario: Record a retry
- **WHEN** the agent records a transient failure of operation 2 with decision `retry`
- **THEN** one record is appended with those codes and a time
- **AND** the plan file is unchanged

#### Scenario: Unknown code
- **WHEN** a cause or decision is not in the set
- **THEN** the command exits non-zero and writes nothing

### Requirement: A check-first operation is not repeated blind
The factory SHALL refuse to record `retry` or `retry-after-readback` for a `check-first` operation unless the record carries a read-back result of `absent`. When the read-back is `present` the only accepted decision is `skip-applied`, and when it is `unavailable` the only accepted decision is `escalate`.

#### Scenario: Retry a create after absent read-back
- **WHEN** the agent records `retry-after-readback` for a create with read-back `absent`
- **THEN** the record is stored

#### Scenario: Retry a create without read-back
- **WHEN** the agent records `retry` for a create with no read-back
- **THEN** the command exits non-zero and writes nothing
- **AND** it names the `verify` read to run

#### Scenario: Effect already landed
- **WHEN** the read-back is `present`
- **THEN** only `skip-applied` is accepted

### Requirement: Retries are bounded
Each operation SHALL have at most the configured number of recorded retry decisions, with a default of 3 and a permitted range of 1 to 10. A further retry SHALL be refused, and the stop SHALL be reported as a blocked state with the invariant `operation-retry-cap`.

#### Scenario: Cap reached
- **WHEN** an operation has three recorded retries and the agent records a fourth
- **THEN** the command exits non-zero and writes nothing
- **AND** a blocked-state report names `operation-retry-cap`

#### Scenario: Out-of-range cap
- **WHEN** the configured cap is outside 1 to 10
- **THEN** the default of 3 applies

### Requirement: Ack never claims an unresolved write
`idefactory mcp ack` SHALL refuse when the latest record of any operation in the plan has outcome `failed` or `unknown`, and SHALL record nothing in that case. When no records exist for the plan, ack SHALL behave as before.

#### Scenario: Unresolved failure
- **WHEN** operation 2's latest record is `failed` and the agent runs ack
- **THEN** ack exits non-zero and records nothing
- **AND** the plan file remains

#### Scenario: Resolved by read-back
- **WHEN** operation 2's latest record is `applied` with decision `skip-applied`
- **THEN** ack is allowed

### Requirement: Pending shows progress
`idefactory mcp pending` SHALL show, for each pending plan and operation, the latest recorded outcome and the number of recorded retries.

#### Scenario: Pending after a retry
- **WHEN** a plan has one recorded retry on operation 2
- **THEN** pending shows operation 2 with that retry count

### Requirement: Conflict is not a failure to escalate
A record with cause `conflict` and decision `abandon` SHALL be a stop handled without a human, and SHALL NOT count as an intervention.

#### Scenario: Duplicate claim
- **WHEN** a claim's first operation fails because another run claimed the story and the agent records `abandon`
- **THEN** the stop is reported as handled
- **AND** the autonomy report counts no intervention

### Requirement: Recovery does not loosen plan integrity
Recording a decision SHALL NOT change a plan, its operations, or its arguments, and no decision SHALL permit an operation outside the allowlist, a forbidden pull-request argument, a merge or auto-complete, or approval of a pull request by its producer.

#### Scenario: Altered plan
- **WHEN** a plan file was changed after creation and the agent records a decision
- **THEN** the command refuses and names the plan modification

### Requirement: Escalation leaves a durable status
When the agent records `escalate`, the skill SHALL tell it to run the board report so the story shows the stop, and the factory SHALL keep the blocked-state record so a later authorized run can resume.

#### Scenario: Escalate
- **WHEN** the agent records `escalate`
- **THEN** a blocked-state record names the plan, the operation, and the cause
- **AND** the skill's next step is the board report

### Requirement: Operations outside plans follow the same judgment
The shipped cloud skill SHALL say that reads, pushes, and other commands the agent runs outside a plan follow the same evaluation: judge the cause, retry when it is safe, and stop when repeated failure shows retrying will not help. These attempts SHALL remain bounded by the run's wall-clock and step budgets.

#### Scenario: Skill covers pushes
- **WHEN** the shipped factory-cloud skill is read
- **THEN** it applies the evaluation to a failed push or read
- **AND** it says the run budgets still apply
