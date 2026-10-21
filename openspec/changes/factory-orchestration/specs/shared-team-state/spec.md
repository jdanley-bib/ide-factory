# shared-team-state Delta

## MODIFIED Requirements

### Requirement: Default roster
Init SHALL install roles lead, architect, engineer, reviewer, scribe, test-engineer, and security-reviewer, each with charter and history under `.factory/agents/<id>/`. Scribe SHALL NOT implement product code.

#### Scenario: Seven roles
- **WHEN** init runs on a new project
- **THEN** `.factory/agents/` contains lead, architect, engineer, reviewer, scribe, test-engineer, and security-reviewer
