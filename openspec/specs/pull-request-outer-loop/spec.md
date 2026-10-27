# pull-request-outer-loop Specification

## Purpose
Opens one pull request for each OpenSpec change, links the factory evidence, posts a stored verdict, and stores human comments.

## Requirements

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

### Requirement: Review verdict stores its role
An accepted or rejected attempt SHALL store the role `reviewer` with the verdict. A security-reviewer verdict SHALL store the role `security-reviewer` and the reviewer identity that produced it. The factory SHALL NOT invent a verdict when one was not stored.

#### Scenario: Accept stores the reviewer role
- **WHEN** an attempt transitions to accepted with a stored verdict
- **THEN** the attempt review record includes the role `reviewer`
- **AND** the verdict is the stored verdict

#### Scenario: Security reviewer stores its own role
- **WHEN** a security-reviewer verdict is stored on the attempt
- **THEN** that record includes the role `security-reviewer`
- **AND** the verdict is the one that was stored

#### Scenario: Missing security verdict is not invented
- **WHEN** the security-reviewer handoff stores no verdict
- **THEN** no security-reviewer verdict is written

#### Scenario: Security reviewer identity is stored and posted
- **WHEN** a security-reviewer verdict is stored with a reviewer identity
- **THEN** that record includes that reviewer identity
- **AND** the comment posted for that verdict names that reviewer, the same way an accept or reject comment already does

### Requirement: Stored verdict is posted to the pull request
When a pull request record exists for the change, storing a verdict and role SHALL post one comment that includes that role, that verdict, and the attempt id. Posting the same attempt and role again SHALL NOT create another comment. When no pull request record exists, storing the verdict SHALL succeed and SHALL NOT post.

#### Scenario: Existing pull request receives one comment
- **WHEN** a verdict and role are stored and the change has a pull request record
- **THEN** the forge receives one comment containing that role, verdict, and attempt id

#### Scenario: Second store does not post again
- **WHEN** the same attempt and role are stored again
- **THEN** the forge is not asked to post another comment for that pair

#### Scenario: No pull request record still stores the verdict
- **WHEN** a verdict and role are stored and the change has no pull request record
- **THEN** the verdict remains stored
- **AND** the forge is not called

### Requirement: Review comments use the stub in tests
Unit tests for these posts SHALL use the stub forge. `npm test` SHALL NOT invoke a live forge client for this behavior.

#### Scenario: Stub records the comment
- **WHEN** the unit test stores a verdict for a change with a pull request record
- **THEN** the stub records the comment
- **AND** no live forge client is executed

### Requirement: Deliverable change names its pull request
A change SHALL NOT be deliverable unless the `.factory/pull-requests/<change>.json` record written by `idefactory pr open` names that change's open pull request number and URL on the `factory/<change>` branch. Archive SHALL stop without moving the change when that record is missing or incomplete. The stage 1 exit test SHALL fail when a change under test lacks that record.

#### Scenario: Missing record blocks archive
- **WHEN** archive is requested for a change with no pull-request record
- **THEN** the deliverable check fails
- **AND** the change directory stays where it is

#### Scenario: Incomplete record blocks archive
- **WHEN** the record omits the pull request number or URL, or names a branch other than `factory/<change>`
- **THEN** the deliverable check fails
- **AND** the change directory stays where it is

#### Scenario: Exit test fails without the record
- **WHEN** the stage 1 exit test evaluates a change with no pull-request record
- **THEN** the exit test result for that change is fail

#### Scenario: Named pull request passes the record check
- **WHEN** the record from `pr open` includes a pull request number, a URL, and branch `factory/<change>`
- **THEN** the deliverable check passes
