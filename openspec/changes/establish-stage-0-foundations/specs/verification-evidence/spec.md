# verification-evidence Specification

## ADDED Requirements

### Requirement: Check registry preview
The factory SHALL print a preview of registry entries for profile check kinds missing from `checks.json`. It SHALL infer a `unit` entry from a `package.json` test script only when `unit` is missing. The preview SHALL NOT write `checks.json`, SHALL NOT replace an existing entry, and SHALL NOT run a check.

#### Scenario: Missing unit check is previewed
- **WHEN** a profile requires `unit`, `checks.json` has no `unit` entry, and `package.json` has a test script
- **THEN** the preview includes a `unit` entry
- **AND** `checks.json` is unchanged

#### Scenario: Existing entry is kept
- **WHEN** `checks.json` already maps `unit`
- **THEN** the preview does not replace that entry

#### Scenario: Preview does not execute
- **WHEN** the preview command runs
- **THEN** no registered check process starts
