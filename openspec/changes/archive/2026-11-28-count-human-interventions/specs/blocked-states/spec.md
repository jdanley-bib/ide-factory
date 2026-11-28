## ADDED Requirements

### Requirement: Red-run stops are classified
A `verify run --red` that stops for `vacuous-red` or `retry-cap` SHALL fail with a blocked-state error carrying the matching invariant and the same message text as before, so that its stop is reportable and recordable.

#### Scenario: Vacuous red is a blocked error
- **WHEN** a red run exits zero
- **THEN** the command fails with invariant `vacuous-red`
- **AND** the message text is unchanged

#### Scenario: Retry cap is a blocked error
- **WHEN** the fourth identical red failure occurs
- **THEN** the command fails with invariant `retry-cap` and the message begins with `retry-cap:`
