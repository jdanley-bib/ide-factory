## ADDED Requirements

### Requirement: Malformed markers are explained with the repair
For a shared instruction file with a missing, unpaired, reversed, or repeated marker, init, upgrade, and doctor SHALL report the file, the problem, the 1-based line numbers of the markers found, and one sentence naming the edit that fixes it. The report SHALL say an agent may make that edit and run upgrade again. The file SHALL remain unchanged.

#### Scenario: Start without end
- **WHEN** a file holds a start marker at line 12 and no end marker
- **THEN** the report names the file and line 12
- **AND** it says to add the end marker after the factory section or delete the start marker
- **AND** the file is unchanged

#### Scenario: Reversed markers
- **WHEN** the end marker appears before the start marker
- **THEN** the report gives both line numbers and says to swap them or delete the pair

#### Scenario: Repeated markers
- **WHEN** a file holds two start markers
- **THEN** the report names both lines and says to keep one pair

#### Scenario: Doctor shows the same text
- **WHEN** doctor runs in a project with a malformed instruction file
- **THEN** it prints the same repair sentence as upgrade
