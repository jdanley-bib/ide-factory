# human-governance Specification

## ADDED Requirements

### Requirement: Approve usage names principal flags
The printed `idefactory approve` usage line SHALL include `--principal-provider` and `--principal-subject`.

#### Scenario: Help lists the principal flags
- **WHEN** command help is printed
- **THEN** the approve usage line includes `--principal-provider`
- **AND** the approve usage line includes `--principal-subject`
