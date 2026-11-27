## ADDED Requirements

### Requirement: Setup help documents structured argv
The help for `setup` SHALL name the JSON array form and the equals form of the argv input, and SHALL show one example whose argv contains a flag that begins with `--` and a quoted expression containing `|`.

#### Scenario: Setup help names the structured form
- **WHEN** the user runs `idefactory help setup`
- **THEN** the output names the JSON array form and the equals form
- **AND** it shows an example with `--filter` and a quoted expression containing `|`

#### Scenario: Machine-readable setup help
- **WHEN** the user runs `idefactory help setup --json`
- **THEN** the document lists the JSON array flag alongside the repeated element flag
