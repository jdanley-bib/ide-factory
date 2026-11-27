# Spec Delta

## ADDED Requirements

### Requirement: Reviewers and implementers rely on valid evidence
The generated factory-review command in each adapter, every shipped copy of the factory-build and factory-verify skills, and the reviewer charter template SHALL say that a valid verification record is relied on and not re-run, that the reviewer still reviews the change independently and runs a focused check when the change warrants it, and that a stale record is re-run with `verify run`. None SHALL tell the reviewer or implementer to re-run every required check when every record is valid.

#### Scenario: Review command names reliance
- **WHEN** init finishes in a new project
- **THEN** the factory-review command in each of the four adapters says a valid record is relied on and a stale record is re-run

#### Scenario: Build and verify skills carry the same wording
- **WHEN** the factory-build and factory-verify skills in the templates and in each shipped IDE skill directory are read
- **THEN** each carries the same reliance wording

#### Scenario: Charter applies to new installs
- **WHEN** init creates a reviewer charter in a project that has none
- **THEN** the charter carries the reliance wording
- **AND WHEN** upgrade runs in a project whose reviewer charter already exists
- **THEN** the existing charter is left unchanged
