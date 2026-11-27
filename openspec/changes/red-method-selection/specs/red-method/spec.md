# Spec Delta

## Purpose

Lets the implementing agent choose, before implementation, whether a code item's tests are written red-first, records that choice with a rationale, and requires independent review of it, without involving a human unless a human's explicit instruction or an unresolved review requires it.

## ADDED Requirements

### Requirement: Method defaults to red-first
Each attempt SHALL have the method `red-first` unless a `no-red` method is recorded for it. An attempt with no method record SHALL be judged exactly as it was before methods existed.

#### Scenario: No record
- **WHEN** a `code` attempt has no method record and requires `unit`
- **THEN** the transition into `verifying` needs a stored failing red or a valid exception for `unit`

### Requirement: Agent proposes a no-red method
`idefactory method propose` SHALL record a `no-red` method on an attempt of a `code` item when the attempt has not entered `red-confirmed` or `verifying`. The record SHALL name the covered check kinds, one reason class, a rationale, the proposer, the source revision, and the count of changed files at that moment. It SHALL be immutable once written.

#### Scenario: Proposal is recorded
- **WHEN** an implementer proposes `no-red` for `unit` with reason class `configuration` and a rationale
- **THEN** a method record is bound to the attempt
- **AND** it holds the proposer, the source revision, and the changed-file count

#### Scenario: Proposal too late
- **WHEN** the attempt is in `verifying`
- **THEN** the proposal is refused and nothing is recorded

### Requirement: Reason classes are a closed set
A proposal's reason class SHALL be one of `docs-or-text`, `configuration`, `behavior-preserving`, `mechanical`, or `exploratory`. A `behavior-preserving` proposal SHALL cite at least one test file that exists in the repository and is tracked by git. Any other class or a missing or untracked test file SHALL refuse the proposal.

#### Scenario: Unknown class
- **WHEN** a proposal names the reason class `faster`
- **THEN** it is refused naming the allowed classes

#### Scenario: Behavior-preserving without a test
- **WHEN** a `behavior-preserving` proposal cites no test file, or a file that does not exist
- **THEN** it is refused and nothing is recorded

### Requirement: Human instructions win
A proposal SHALL be refused when the work item has an explicit `factory.taskType`, when any covered kind has a stored failing red or an exception on the attempt, when a covered kind is not required for the item, or when a method review for an earlier attempt of the item rejected a `no-red` method.

#### Scenario: Explicit class
- **WHEN** a work item states `factory.taskType: code` and an agent proposes `no-red`
- **THEN** the proposal is refused naming the explicit class
- **AND** no human prompt is created

#### Scenario: Red already stored
- **WHEN** a failing red for `unit` is stored and a proposal covers `unit`
- **THEN** the proposal is refused naming `unit`

#### Scenario: Earlier rejection
- **WHEN** an earlier attempt's `no-red` method was rejected in review
- **THEN** a new proposal for that item is refused

### Requirement: Reviewer decides the method
The reviewer SHALL record a method review with `idefactory method review`, giving a verdict of `ACCEPT` or `REJECT` and a note. The reviewer SHALL differ from the implementer. An attempt with a `no-red` method SHALL NOT be accepted without an `ACCEPT` method review, and a `REJECT` review SHALL leave the attempt unable to be accepted.

#### Scenario: Accept needs the review
- **WHEN** an attempt with a `no-red` method is moved to `accepted` with no method review
- **THEN** the transition is refused naming the missing method review

#### Scenario: Same role refused
- **WHEN** the implementer records the method review
- **THEN** the command refuses and records nothing

#### Scenario: Rejected method
- **WHEN** the reviewer records `REJECT`
- **THEN** the attempt cannot be accepted
- **AND** the next attempt for the item starts with the `red-first` method

### Requirement: Method satisfies red only for covered kinds
A recorded `no-red` method SHALL satisfy the red requirement for exactly its covered kinds. It SHALL NOT satisfy any other kind, SHALL NOT waive passing verification, distinct review, lockouts, or human gates, and SHALL NOT be described as a red that ran or as an exception.

#### Scenario: Covered kind
- **WHEN** a method covers `unit` and the attempt requires `unit` and `integration`, with a stored failing red for `integration`
- **THEN** the transition into `verifying` is accepted

#### Scenario: Uncovered kind
- **WHEN** a method covers `unit` and the attempt also requires `integration` with no red or exception
- **THEN** the transition into `verifying` is refused naming `integration`

#### Scenario: Verification still required
- **WHEN** a method covers `unit` and no passing `unit` record exists at the current clean HEAD
- **THEN** completion fails naming `unit`

### Requirement: Method is visible
The work packet, the run request, the reviewer packet, status, and the pull request verdict comment SHALL state the method, its reason class, its rationale, its covered kinds, and its review verdict. They SHALL NOT say that a red ran or that an exception exists for a covered kind.

#### Scenario: Reviewer packet
- **WHEN** a reviewer packet is rendered for an attempt with a `no-red` method
- **THEN** it shows the reason class, rationale, covered kinds, source revision, and changed-file count at proposal
- **AND** it says the reviewer must record a method review

### Requirement: Guidance explains the choice
The shipped build, test-first, and verify skills, the engineer and reviewer charters, and the review command SHALL say that `red-first` is the default, name the reason classes, tell the implementer to propose `no-red` only when a failing test cannot specify the change, and tell the reviewer to reject a method whose reason class does not fit the diff.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read
- **THEN** it names `idefactory method propose` and the five reason classes
- **AND** it states that an explicit task class is not overridden
