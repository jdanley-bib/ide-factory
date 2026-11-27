## ADDED Requirements

### Requirement: Authorization help
Help SHALL document `idefactory authorize` and `idefactory revoke`, state that `authorize` is read-only and never performs the action, and list the closed set of `reason` values. The global usage text SHALL stay unchanged, and both commands SHALL be reachable through `help <command>` and `help --json`.

#### Scenario: Authorize help
- **WHEN** the user runs `idefactory help authorize`
- **THEN** the output says the command is read-only and lists every reason value

#### Scenario: Revoke help
- **WHEN** the user runs `idefactory help revoke`
- **THEN** the output says the original record is left unchanged

#### Scenario: Global help unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
