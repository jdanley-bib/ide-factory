# Spec Delta

## ADDED Requirements

### Requirement: Security review verdict
When a work item requires the security stage, moving from `security-checking` to `awaiting-review` SHALL require a stored verdict of `ACCEPT` and a security reviewer identity distinct from the implementer identity. Without both, the transition SHALL be rejected and the attempt SHALL remain in `security-checking`. A stored verdict of `REJECT` with a distinct security reviewer identity SHALL transition the attempt directly to `rejected` instead.

#### Scenario: Missing verdict blocks review
- **WHEN** security-stage work has no stored verdict and the next step would move it to `awaiting-review`
- **THEN** the transition is rejected
- **AND** the attempt remains in `security-checking`

#### Scenario: Same reviewer and implementer is rejected
- **WHEN** the stored security reviewer identity equals the implementer identity
- **THEN** the transition is rejected
- **AND** the attempt remains in `security-checking`

#### Scenario: Accepted verdict advances to review
- **WHEN** a stored verdict of `ACCEPT` and a distinct security reviewer identity are present
- **THEN** the transition to `awaiting-review` succeeds

#### Scenario: Rejected verdict ends the attempt
- **WHEN** a stored verdict of `REJECT` and a distinct security reviewer identity are present
- **THEN** the attempt transitions directly to `rejected`
- **AND** no review request is made

#### Scenario: Work not requiring the stage is unaffected
- **WHEN** the work item does not require the security stage
- **THEN** this requirement does not apply to its transitions
