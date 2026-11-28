## ADDED Requirements

### Requirement: Red failure entries bind to a revision and command
Each `redFailures` entry SHALL also carry `commandDigest`, the digest of the registered argv that ran, and `sourceRevision`, the git commit at the time or null when there is none. The entry SHALL NOT carry raw output.

#### Scenario: Vacuous entry binding
- **WHEN** a red run exits zero for `unit` in a git repository
- **THEN** the `redFailures` entry holds the registered command digest and the current commit

#### Scenario: No git history
- **WHEN** a red run exits zero where git has no commit
- **THEN** the entry's `sourceRevision` is null
