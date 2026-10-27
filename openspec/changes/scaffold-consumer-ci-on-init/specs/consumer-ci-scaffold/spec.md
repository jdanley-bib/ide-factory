# consumer-ci-scaffold

## REMOVED Requirements

### Requirement: Scaffold stays narrower than this repository

**Reason**: The requirement said `idefactory init` must not write the consumer workflow, and its scenario "Init leaves the workflow absent" records that. Init now writes the workflow, so that requirement is no longer true.
**Migration**: Node 24, no Semgrep, and no `pull_request_target` move to "Init writes the narrow consumer workflow". `idefactory upgrade` still does not write the file. A checkout that already exists gets it from `idefactory ci scaffold`.

## ADDED Requirements

### Requirement: Init writes the narrow consumer workflow
`idefactory init` SHALL write the consumer workflow when that file is absent. When the file already exists, init SHALL leave its bytes unchanged and exit 0. `idefactory upgrade` SHALL NOT write that workflow. The workflow SHALL set `node-version` to 24. It SHALL NOT install or run Semgrep and SHALL NOT use `pull_request_target`.

#### Scenario: Init writes the absent workflow
- **WHEN** `idefactory init` runs in a project that has no consumer workflow
- **THEN** the consumer workflow file is created
- **AND** init exits 0

#### Scenario: Init keeps an existing workflow
- **WHEN** `idefactory init` runs and the consumer workflow file already exists
- **THEN** the file bytes are unchanged
- **AND** init exits 0

#### Scenario: Upgrade leaves the workflow absent
- **WHEN** `idefactory upgrade` runs in a project that has no consumer workflow
- **THEN** the consumer workflow file is still absent

#### Scenario: Workflow pins Node and skips the scanner
- **WHEN** the written workflow is read
- **THEN** every `node-version` is 24
- **AND** the file does not mention Semgrep
- **AND** the file does not use `pull_request_target`

#### Scenario: Init does not copy this repository's workflows
- **WHEN** `idefactory init` runs in a consumer project
- **THEN** that project does not gain this repository's `ci.yml` or `release.yml`
- **AND** this repository's own CI workflow bytes are unchanged

### Requirement: Init reports the workflow it creates
When `idefactory init` creates the consumer workflow, the command SHALL name `.github/workflows/factory-consumer.yml` among the files it created. When that file already exists, the command SHALL NOT name that path as a created file.

#### Scenario: Fresh init lists the workflow
- **WHEN** `idefactory init` creates the consumer workflow in a new project
- **THEN** the command output names `.github/workflows/factory-consumer.yml`

#### Scenario: Re-init lists only the missing workflow
- **WHEN** factory state already exists, the consumer workflow is absent, and `idefactory init` runs again
- **THEN** the consumer workflow file is created
- **AND** the command output names `.github/workflows/factory-consumer.yml`

#### Scenario: An existing workflow is not listed
- **WHEN** `idefactory init` runs and the consumer workflow file already exists
- **THEN** the file bytes are unchanged
- **AND** the command output does not name `.github/workflows/factory-consumer.yml`

### Requirement: Consumer checkout uses ci scaffold
`idefactory ci scaffold` SHALL write that same workflow in a consumer checkout whose file is absent, including a checkout that already has factory state. The command SHALL leave this repository's own CI workflows unchanged.

#### Scenario: Existing checkout receives the workflow
- **WHEN** `ci scaffold` runs in a consumer checkout that has factory state and no consumer workflow
- **THEN** the consumer workflow file is created in that checkout
- **AND** this repository does not gain the consumer workflow
- **AND** this repository's own CI workflow bytes are unchanged

### Requirement: Scaffold path selects the checkout
A path passed to `idefactory ci scaffold` SHALL select the checkout that receives the consumer workflow, including when that path is not the process working directory. The working directory SHALL NOT gain the workflow in that case.

#### Scenario: Positional checkout is not the working directory
- **WHEN** `idefactory ci scaffold <checkout>` runs in a different working directory and that checkout has factory state and no consumer workflow
- **THEN** the consumer workflow file is created in the checkout
- **AND** the working directory does not gain the consumer workflow
- **AND** this repository's own CI workflow bytes are unchanged
