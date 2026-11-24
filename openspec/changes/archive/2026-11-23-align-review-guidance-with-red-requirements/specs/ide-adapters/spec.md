# Spec Delta

## ADDED Requirements

### Requirement: Adapters carry the conditional review wording
Every generated factory-review command, in the Cursor, Claude Code, GitHub Copilot, and Cline adapters, and every shipped copy of the factory-build skill SHALL carry the same conditional review and red wording as the source templates. None SHALL tell the reviewer to accept only if a failing test was written first, or say acceptance requires red evidence without conditions.

#### Scenario: Generated review commands
- **WHEN** init finishes in a new project
- **THEN** the review command in each of the four adapters names the lightweight and no-test-check cases and the red exception
- **AND** none contains the unconditional failing-test wording

#### Scenario: Shipped build skill copies
- **WHEN** the factory-build skill in `templates/skills` and in each shipped IDE skill directory is read
- **THEN** each carries the same conditional review wording

#### Scenario: Upgrade restores the conditional wording
- **WHEN** a generated review command holds the old unconditional wording and upgrade runs
- **THEN** it holds the conditional wording again
