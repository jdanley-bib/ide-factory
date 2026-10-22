# Spec Delta

## Purpose

Runs the factory repository's baseline CI so a pull request cannot look green unless install, tests, dependency audit, and OpenSpec validation pass.

## ADDED Requirements

### Requirement: Baseline commands
The baseline CI job SHALL run `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all` for pull requests and for pushes. The job SHALL fail when any of those commands exits non-zero.

#### Scenario: All four commands pass
- **WHEN** a pull request runs the baseline job and each of the four commands exits zero
- **THEN** the baseline job passes

#### Scenario: One command fails
- **WHEN** any of the four commands exits non-zero
- **THEN** the baseline job fails
- **AND** later commands in that job do not change the failed result into a pass

### Requirement: Phase 0 gate
Phase 0 SHALL be met only when the baseline job has passed its four commands on the revision being claimed. A local command run SHALL NOT by itself mark that CI job passed.

#### Scenario: Local checks are not the CI result
- **WHEN** the four commands pass on a workstation and the baseline job has not passed for that revision
- **THEN** Phase 0 is not met for that revision

#### Scenario: Baseline job passes
- **WHEN** the baseline job passes for a revision
- **THEN** Phase 0 is met for that revision

### Requirement: Baseline permissions
The baseline job SHALL use read-only contents permission. It SHALL NOT use `pull_request_target`, `continue-on-error`, or a floating third-party action reference.

#### Scenario: Untrusted pull request
- **WHEN** the baseline workflow runs for a pull request
- **THEN** it checks out that pull request's head
- **AND** it does not request write permission or a workflow token that can change repository administration

#### Scenario: Action reference
- **WHEN** the baseline workflow uses a third-party action
- **THEN** that action is pinned to a full commit SHA
