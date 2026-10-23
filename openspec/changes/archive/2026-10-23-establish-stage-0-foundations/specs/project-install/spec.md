# project-install Specification

## ADDED Requirements

### Requirement: New install policy version
A new init SHALL set governance policy version to 2 in `.factory/config.json`. A later init SHALL leave an existing policy version unchanged.

#### Scenario: First init sets version 2
- **WHEN** init runs in a directory that has no `.factory/`
- **THEN** `.factory/config.json` records governance policy version 2

#### Scenario: Reinstall keeps the policy version
- **WHEN** `config.json` already records governance policy version 1 and init runs again
- **THEN** that policy version is still 1

### Requirement: Preserve check registry
A later init SHALL leave an existing `.factory/checks.json` byte-for-byte unchanged.

#### Scenario: Existing registry survives reinstall
- **WHEN** `checks.json` already contains a project-specific entry and init runs again
- **THEN** that file is byte-for-byte unchanged
