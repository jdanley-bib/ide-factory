# risk-gates Specification

## ADDED Requirements

### Requirement: Approval write keeps the bound revision
After a successful approve whose only new uncommitted paths are the approval file and `.factory/decisions.md`, that approval SHALL still authorize its action at the same HEAD.

#### Scenario: Gate matches after approve
- **WHEN** approve succeeds and the only new uncommitted paths are the approval file and `.factory/decisions.md`
- **THEN** the approval authorizes its action
- **AND** the source revision is unchanged
