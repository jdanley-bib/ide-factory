# pull-request-outer-loop Specification

## ADDED Requirements

### Requirement: Review verdict stores its role
An accepted or rejected attempt SHALL store the role `reviewer` with the verdict. A security-reviewer verdict SHALL store the role `security-reviewer`. The factory SHALL NOT invent a verdict when one was not stored.

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
