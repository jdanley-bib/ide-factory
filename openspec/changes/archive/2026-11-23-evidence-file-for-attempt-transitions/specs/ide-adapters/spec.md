# Spec Delta

## ADDED Requirements

### Requirement: Skills pass transition evidence by file
The installed factory-build and factory-run skills SHALL tell the session to record attempt transition evidence with `--evidence-file`, naming a file in the operating system temporary directory and not inside the project, and to remove that file after the command whether it succeeds or fails. They SHALL say that `--evidence` accepts inline JSON, that `--evidence-file` accepts only a path, and that only one may be given.

#### Scenario: Skills name the file option
- **WHEN** the installed factory-build or factory-run skill is read
- **THEN** it names `--evidence-file`
- **AND** it names `--evidence` as the inline alternative and says to give only one

#### Scenario: Skills keep the file out of the project
- **WHEN** the installed factory-build or factory-run skill is read
- **THEN** it tells the session to create the evidence file in the operating system temporary directory
- **AND** it tells the session to remove the file after the command whether it succeeds or fails

#### Scenario: Every shipped copy
- **WHEN** the factory skills in `templates/skills` and each shipped IDE skill directory are read
- **THEN** each copy carries the same evidence-file guidance
