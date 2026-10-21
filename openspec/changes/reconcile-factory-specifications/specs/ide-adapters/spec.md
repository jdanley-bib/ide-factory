# Spec Delta

## MODIFIED Requirements

### Requirement: Shared command set
The system SHALL install status, plan, build, run, full, and review commands for Cursor, GitHub Copilot, and Claude Code.

#### Scenario: Command files
- **WHEN** init finishes
- **THEN** each supported IDE has adapter files for status, plan, build, run, full, and review
- **AND** each command directs the IDE to its corresponding factory skill

### Requirement: No model launcher
Installed factory instructions SHALL tell the IDE session to do the work and SHALL NOT direct the CLI to launch a model process.

#### Scenario: Adapter instructions
- **WHEN** installed factory skills and commands are inspected
- **THEN** they state that the IDE session model does the work
- **AND** they contain no instruction for the factory CLI to launch a model
