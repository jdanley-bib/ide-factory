# Spec Delta

## MODIFIED Requirements

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
