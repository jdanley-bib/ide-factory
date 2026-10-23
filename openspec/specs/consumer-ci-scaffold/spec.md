# consumer-ci-scaffold Specification

## Purpose
Writes a consumer baseline workflow when that file is absent, and leaves this repository's own CI unchanged.

## Requirements

### Requirement: Scaffold writes once
`idefactory ci scaffold` SHALL write the consumer workflow only when that file is absent. When the file exists, the command SHALL leave it unchanged and exit non-zero.

#### Scenario: Absent file is written
- **WHEN** `ci scaffold` runs and the consumer workflow file is absent
- **THEN** the workflow file is created

#### Scenario: Existing file is kept
- **WHEN** `ci scaffold` runs and the consumer workflow file already exists
- **THEN** the file bytes are unchanged
- **AND** the command exits non-zero

### Requirement: Scaffold runs the baseline commands
The written workflow SHALL run `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`. The job SHALL fail when any of those commands exits non-zero.

#### Scenario: Four commands are present
- **WHEN** the written workflow is read
- **THEN** it contains `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`

### Requirement: Scaffold stays narrower than this repository
The written workflow SHALL set `node-version` to 24. It SHALL NOT install or run Semgrep and SHALL NOT use `pull_request_target`. `idefactory init` SHALL NOT write that workflow.

#### Scenario: Init leaves the workflow absent
- **WHEN** `idefactory init` runs in a project that has no consumer workflow
- **THEN** the consumer workflow file is still absent

#### Scenario: Workflow pins Node and skips the scanner
- **WHEN** the written workflow is read
- **THEN** every `node-version` is 24
- **AND** the file does not mention Semgrep
- **AND** the file does not use `pull_request_target`

### Requirement: Scaffold does not administer the forge
`idefactory ci scaffold` SHALL NOT call the forge admin API.

#### Scenario: Scaffold is local
- **WHEN** `ci scaffold` writes the workflow
- **THEN** no forge admin API is called
