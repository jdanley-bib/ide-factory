## ADDED Requirements

### Requirement: Lockout errors match help
The usage text in every lockout error SHALL match the usage of the corresponding lockout help entry, including every required flag.

#### Scenario: Usage names every required flag
- **WHEN** lockout create fails because a required flag is missing or malformed
- **THEN** the usage text in the error equals the usage in `idefactory help lockout create`
- **AND** it names `--reviewer`

#### Scenario: Unknown lockout subcommand
- **WHEN** `idefactory lockout bogus` runs
- **THEN** the error lists the usage of both `lockout create` and `lockout resolve` as shown in their help entries
