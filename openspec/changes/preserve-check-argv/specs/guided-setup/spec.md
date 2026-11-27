## MODIFIED Requirements

### Requirement: Stored test command is an argv
A confirmed test command SHALL be stored as a non-empty argv array under the check kind, with every element exactly as the human supplied it. Setup SHALL reject a shell command string, meaning an argv of exactly one element that contains whitespace, and SHALL write no registry entry for that kind.

#### Scenario: Shell string is rejected
- **WHEN** the confirmed test command is a single shell string
- **THEN** setup writes no argv for that kind
- **AND** the exit code is non-zero

#### Scenario: Argv is stored
- **WHEN** the human confirms the argv `dotnet`, `test` for kind `unit`
- **THEN** the check registry maps `unit` to that argv array

#### Scenario: Later elements may contain whitespace
- **WHEN** the human supplies the argv `dotnet`, `test`, `--filter`, `Category=Unit | Category=Integration`
- **THEN** the registry maps the kind to those four elements unchanged

## ADDED Requirements

### Requirement: Structured argv input
Setup SHALL accept a check kind's argv as one JSON array of strings, and SHALL store it element for element without splitting, trimming, or re-quoting. A value that is not an array of non-empty strings SHALL be refused with a message that names the value, and nothing SHALL be written.

#### Scenario: JSON array is stored verbatim
- **WHEN** the human runs setup with the kind `unit` and the JSON array `["dotnet","test","--filter","A|B"]`
- **THEN** the registry maps `unit` to exactly those four strings

#### Scenario: Malformed JSON is refused
- **WHEN** the JSON value is not valid JSON, is not an array, or holds a non-string or empty element
- **THEN** setup exits non-zero naming the value
- **AND** it writes no registry entry

### Requirement: Flag-like argv elements are preserved
Setup SHALL bind a value that begins with `--` to the flag it was supplied with when the equals form is used. A flag that needs a value and receives none SHALL fail, naming the flag and the structured alternatives, and SHALL NOT store a placeholder value.

#### Scenario: Equals form keeps a leading double dash
- **WHEN** the human supplies the argv elements `dotnet`, `test` and, in the equals form, `--filter`
- **THEN** the registry maps the kind to `dotnet`, `test`, `--filter`

#### Scenario: Bare argv flag is refused
- **WHEN** an argv flag is followed by another flag instead of a value
- **THEN** setup exits non-zero naming the argv flag and the JSON array form
- **AND** no registry entry stores `true` or any other placeholder

### Requirement: Registered argv is visible exactly
The registry preview and the status report SHALL print each registered argv as a JSON array, so the stored command can be compared character for character with the intended one.

#### Scenario: Preview shows the JSON array
- **WHEN** the registry maps `unit` to `dotnet`, `test`, `--filter`, `A | B`
- **THEN** the preview and the status report show `["dotnet","test","--filter","A | B"]` for `unit`
