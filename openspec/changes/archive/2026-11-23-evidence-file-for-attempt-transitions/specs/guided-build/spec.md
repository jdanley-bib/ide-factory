# Spec Delta

## ADDED Requirements

### Requirement: Transition evidence sources
`idefactory attempt transition` SHALL accept its evidence from exactly one of `--evidence <json>`, which carries inline JSON, or `--evidence-file <path>`, which names a file holding JSON. A relative path SHALL resolve from the current working directory. Evidence from either source SHALL go through the same validation and produce the same attempt result. `--evidence-file` SHALL NOT accept inline JSON, and the command SHALL NOT modify, move, or delete the file.

#### Scenario: Evidence from a file
- **WHEN** a transition is run with `--evidence-file` naming a file that holds a JSON object with a reviewer id and verdict
- **THEN** the attempt moves to the requested state with that evidence
- **AND** the stored attempt equals the one the same evidence passed inline would produce

#### Scenario: Evidence file with spaces and escaped quotes
- **WHEN** the evidence file holds a note containing spaces and escaped quotation marks
- **THEN** the stored note equals the file content character for character

#### Scenario: Inline evidence is unchanged
- **WHEN** a transition is run with `--evidence` and valid inline JSON
- **THEN** it behaves as it did before this requirement

#### Scenario: File is left in place
- **WHEN** a transition with `--evidence-file` succeeds or fails
- **THEN** the named file still exists with its original content

#### Scenario: Both sources given
- **WHEN** a transition is run with both `--evidence` and `--evidence-file`
- **THEN** the command exits with an error that tells the user to include only one of them
- **AND** the attempt is not changed

#### Scenario: Inline JSON passed as the file value
- **WHEN** `--evidence-file` is given a value that is JSON text rather than the path of an existing file
- **THEN** the command exits with an error that names the missing file
- **AND** it does not parse the value as evidence

### Requirement: Transition evidence file encoding
The evidence file SHALL be read as UTF-8 and its content SHALL otherwise be parsed unchanged. The reader SHALL accept a leading UTF-8 byte-order mark and SHALL decode UTF-16LE content that begins with a UTF-16LE byte-order mark, because Windows PowerShell 5.1 writes both.

#### Scenario: UTF-8 with a byte-order mark
- **WHEN** the evidence file is UTF-8 with a leading byte-order mark
- **THEN** the transition accepts its JSON object

#### Scenario: UTF-16LE file
- **WHEN** the evidence file is UTF-16LE with a byte-order mark
- **THEN** the transition accepts its JSON object

#### Scenario: Non-ASCII text
- **WHEN** the evidence file is UTF-8 and the note contains non-ASCII characters
- **THEN** the stored note equals the file content

### Requirement: Transition evidence input errors
A transition that cannot obtain evidence SHALL fail before it changes the attempt and SHALL name the cause. A missing path, an unreadable file, a directory, an empty file, content that is not valid JSON, and JSON that is not an object SHALL each fail with a message that names the evidence file path. A flag given without a value SHALL fail with the transition usage. Inline JSON that does not parse SHALL fail with a message that names `--evidence-file` as the alternative.

#### Scenario: Missing file
- **WHEN** `--evidence-file` names a path that does not exist
- **THEN** the command exits with an error that names that path
- **AND** the attempt is not changed

#### Scenario: Directory
- **WHEN** `--evidence-file` names a directory
- **THEN** the command exits with an error that names that path

#### Scenario: Empty file
- **WHEN** the evidence file is empty
- **THEN** the command exits with an error that says the file is empty and names its path

#### Scenario: Malformed JSON in the file
- **WHEN** the evidence file holds text that is not valid JSON
- **THEN** the command exits with a parse error that names the file path

#### Scenario: JSON that is not an object
- **WHEN** the evidence file holds a JSON array, string, number, boolean, or null
- **THEN** the command exits with an error that says evidence must be a JSON object and names the file path

#### Scenario: Flag without a value
- **WHEN** `--evidence` or `--evidence-file` is given with no value
- **THEN** the command exits with the transition usage

#### Scenario: Malformed inline JSON
- **WHEN** `--evidence` holds text that is not valid JSON
- **THEN** the command exits with an error that names `--evidence-file` as an alternative
- **AND** the attempt is not changed

#### Scenario: Existing validation still applies
- **WHEN** the evidence file holds a caller-supplied verification result
- **THEN** the transition is rejected as it is for inline evidence

### Requirement: Packet names the evidence file option
The work packet SHALL tell the implementing role to record transition evidence with `--evidence-file`.

#### Scenario: Engineer packet
- **WHEN** a work packet is rendered for the engineer role
- **THEN** it names `idefactory attempt transition` and `--evidence-file`
