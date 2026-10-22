# Spec Delta

## MODIFIED Requirements

### Requirement: Doctor
`idefactory doctor` SHALL exit non-zero when `.factory/` or a required adapter file is missing, including `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md`, and SHALL exit zero when init has completed and the required files exist.

#### Scenario: Missing install
- **WHEN** doctor runs in an empty directory
- **THEN** the exit code is non-zero

#### Scenario: Healthy install
- **WHEN** doctor runs after init
- **THEN** the exit code is zero

#### Scenario: Missing Cline adapter
- **WHEN** doctor runs in a project that has factory state and is missing `.cline/rules/factory.md` or `.cline/skills/factory-coordinator/SKILL.md`
- **THEN** the exit code is non-zero
- **AND** the report names the missing Cline path
