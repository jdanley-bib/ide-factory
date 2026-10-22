# Spec Delta

## Purpose

States the review and branch controls required before a protected branch accepts a change, without the workflow changing forge administration.

## ADDED Requirements

### Requirement: Declared controls
The repository SHALL declare that the protected branch requires the baseline CI check, at least one approving review, and no force-push. The declared check name SHALL match the baseline job name.

#### Scenario: Required check name matches
- **WHEN** the branch-control declaration is read
- **THEN** its required status check name is the baseline job name
- **AND** it requires one approving review
- **AND** it prohibits force-push

### Requirement: Human enablement
Enabling those controls on the forge SHALL be a human repository-admin action. Implementation SHALL NOT call the forge admin API to create or change branch protection.

#### Scenario: No admin API call
- **WHEN** this change is implemented
- **THEN** no workflow or script calls the forge admin API to change branch protection

#### Scenario: Declaration is not enforcement
- **WHEN** the declaration exists and the human has not enabled it on the forge
- **THEN** the repository still contains the declaration
- **AND** the declaration does not claim that the forge is already enforcing it
