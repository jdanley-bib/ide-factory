# pull-request-outer-loop Specification

## Purpose
Opens one pull request for each OpenSpec change, links the factory evidence, posts a stored verdict, and stores human comments.

## ADDED Requirements

### Requirement: One pull request per change
`idefactory pr open` SHALL open at most one pull request for a change, on one stable branch derived from that change name. A second open for the same change SHALL update that pull request and SHALL NOT open another.

#### Scenario: First open creates the pull request
- **WHEN** `pr open` runs for a change that has no pull request record
- **THEN** the forge receives one open request
- **AND** the local record stores that change, branch, and pull request identity

#### Scenario: Second open updates the same pull request
- **WHEN** `pr open` runs again for a change that already has a pull request record
- **THEN** the existing pull request is updated
- **AND** no second pull request is opened

### Requirement: Evidence links in the body
The pull request body SHALL name the change and link its source revision and attempt identifiers. The body SHALL NOT include check logs, environment values, or secrets.

#### Scenario: Body links the revision and attempt
- **WHEN** `pr open` builds the body for a change with a recorded attempt
- **THEN** the body includes the source revision
- **AND** the body includes that attempt identifier

#### Scenario: Logs stay out of the body
- **WHEN** `pr open` builds the body
- **THEN** the body does not include a check log
- **AND** the body does not include an environment value

### Requirement: Stored verdict is posted
`idefactory pr comment` SHALL post a verdict only when that verdict is already stored on the attempt. It SHALL fail when the verdict is missing, and it SHALL NOT create a verdict.

#### Scenario: Stored verdict is posted
- **WHEN** `pr comment` runs for an attempt whose review record already has a verdict
- **THEN** the forge receives that stored verdict

#### Scenario: Missing verdict fails
- **WHEN** `pr comment` runs for an attempt with no stored verdict
- **THEN** the command exits non-zero
- **AND** no verdict is written onto the attempt

### Requirement: Human comments are stored
`idefactory pr capture` SHALL store each human pull request comment once, keyed by its forge comment id. A second capture of the same id SHALL NOT duplicate it. A stored comment SHALL NOT authorize accept or complete.

#### Scenario: Comment stored once
- **WHEN** `pr capture` reads the same forge comment id twice
- **THEN** the local record contains that comment once

#### Scenario: Comment is not an approval
- **WHEN** a human comment has been stored and no scoped approval exists
- **THEN** the human gate still refuses accept and complete

### Requirement: No merge and no admin API
`pr open`, `pr comment`, and `pr capture` SHALL NOT merge a pull request and SHALL NOT call the forge admin API to create or change branch protection.

#### Scenario: Open does not merge
- **WHEN** `pr open` completes
- **THEN** the forge was not asked to merge
- **AND** the forge admin API was not called

### Requirement: Tests use a stub forge
The unit tests for these commands SHALL run through a stub forge. `npm test` SHALL NOT invoke a live forge client and SHALL NOT require network access for this behavior.

#### Scenario: Stub records the open
- **WHEN** the unit test runs `pr open`
- **THEN** the stub records the request
- **AND** no live forge client is executed
