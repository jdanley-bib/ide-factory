## MODIFIED Requirements

### Requirement: Human instructions win
A proposal SHALL be refused when the work item has an explicit `factory.taskType`, when any covered kind has a stored failing red that has not been invalidated or an exception on the attempt, when a covered kind is not required for the item, or when a method review for an earlier attempt of the item rejected a `no-red` method.

#### Scenario: Explicit class
- **WHEN** a work item states `factory.taskType: code` and an agent proposes `no-red`
- **THEN** the proposal is refused naming the explicit class
- **AND** no human prompt is created

#### Scenario: Red already stored
- **WHEN** a failing red for `unit` is stored and a proposal covers `unit`
- **THEN** the proposal is refused naming `unit`
- **AND** the refusal names `red invalidate`

#### Scenario: Invalidated red does not block
- **WHEN** the stored failing red for `unit` has been invalidated and a proposal covers `unit`
- **THEN** the red does not cause a refusal

#### Scenario: Earlier rejection
- **WHEN** an earlier attempt's `no-red` method was rejected in review
- **THEN** a new proposal for that item is refused
