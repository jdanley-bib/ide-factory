# Spec Delta

## ADDED Requirements

### Requirement: Review requires what the red gate requires
The factory-review command and the Review section of the factory-build skill SHALL tell the reviewer to accept only when every required verification check has a passing CLI record on the current clean HEAD and, for a `code` item whose checks include a test kind, each such kind has a recorded failing red or a valid recorded red exception.

#### Scenario: Code item with a test check
- **WHEN** the review command is read for a `code` work item whose checks include `unit`
- **THEN** it requires a recorded failing red or a valid red exception for `unit` and a passing CLI record for each required check

#### Scenario: Unconditional wording is gone
- **WHEN** the review command and the build skill are read
- **THEN** neither says to accept only if a failing test was written first
- **AND** neither says acceptance requires red evidence without naming the conditions

### Requirement: Review guidance names the cases that need no red
The review guidance SHALL say that a `lightweight` item, and a `code` item whose checks include no test kind, need no failing test. It SHALL say that a red exception is not a red that ran, that the reviewer relies on the evidence recorded on the attempt, and that the reviewer does not ask for a new failing test where a valid exception is recorded. It SHALL keep review by a role other than the implementer.

#### Scenario: Lightweight item
- **WHEN** the review command is read for a `lightweight` work item
- **THEN** it does not require a failing test

#### Scenario: No test check
- **WHEN** the review command is read for a `code` item whose checks include no test kind
- **THEN** it does not require a failing test

#### Scenario: Recorded exception
- **WHEN** the attempt holds a valid reuse or waiver exception for a required kind
- **THEN** the guidance tells the reviewer to accept the exception as satisfying that kind
- **AND** it does not tell the reviewer to treat the exception as a red that ran or to ask for a new failing test

#### Scenario: Independent review remains
- **WHEN** the review command is read
- **THEN** it still says the reviewer is a different role from the implementer and that clean-revision verification must pass

### Requirement: Charters match the review guidance
The engineer and reviewer charters that init writes for a new project SHALL state the same conditions for a failing test as the review guidance: required only for a `code` item whose checks include a test kind, satisfied by a recorded red or a valid red exception.

#### Scenario: New project charters
- **WHEN** init runs in a directory with no `.factory/`
- **THEN** the engineer charter requires a failing test only for a `code` item whose checks include a test kind
- **AND** the reviewer charter accepts a valid recorded red exception in place of a red

### Requirement: Packet states the red requirement
The work packet SHALL state the work item's task class and the check kinds that need red evidence, or that none do. A `lightweight` item and a `code` item with no test kind SHALL show none.

#### Scenario: Code item with a test check
- **WHEN** a packet is rendered for a `code` item whose checks are `unit` and `build`
- **THEN** it states task class `code` and red required for `unit`

#### Scenario: Lightweight item
- **WHEN** a packet is rendered for a `lightweight` item whose checks include `unit`
- **THEN** it states task class `lightweight` and that no red is required

#### Scenario: No test kind
- **WHEN** a packet is rendered for a `code` item whose checks are `build`
- **THEN** it states task class `code` and that no red is required

### Requirement: Run request matches the red gate
An implementing-stage run request for a `code` attempt whose checks include no test kind SHALL say that a failing test is not required and SHALL name `verifying` as the next state. A `code` attempt whose checks include a test kind SHALL still be asked for a red, unless every such kind already has a red or a valid exception.

#### Scenario: Code item with no test kind
- **WHEN** run reaches the implementing stage for a `code` attempt whose checks are `build`
- **THEN** the request says a failing test is not required
- **AND** its next state is `verifying`

#### Scenario: Code item with a test kind
- **WHEN** run reaches the implementing stage for a `code` attempt whose checks include `unit` and no red or exception is recorded
- **THEN** the request asks for a failing test recorded with `idefactory verify run --red`
- **AND** its next state is `red-confirmed`
