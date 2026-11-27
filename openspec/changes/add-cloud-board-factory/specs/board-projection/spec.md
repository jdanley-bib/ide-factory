# Spec Delta

## Purpose

Mirrors one OpenSpec change onto one Azure DevOps story through tested CLI commands, while OpenSpec stays the plan and `.factory/work/` stays the queue.

## ADDED Requirements

### Requirement: Board is optional
Board commands SHALL fail with a configuration error and SHALL NOT call Azure DevOps when `.factory/config.json` has no `board` entry. Commands other than `board` SHALL NOT call Azure DevOps.

#### Scenario: Unconfigured board
- **WHEN** `board publish` runs in a project with no board config
- **THEN** the command exits non-zero
- **AND** the board client is not invoked

### Requirement: Configure writes board settings
`idefactory board configure` SHALL write `board` into `.factory/config.json` with the transport (`mcp` by default, or `az`), the organization, project, work item type, tag, change field, branch field, run URL field, and state names, filling defaults for omitted values. It SHALL fail without an organization or project and SHALL write nothing then.

#### Scenario: Defaults are filled
- **WHEN** board configure runs with an organization and a project only
- **THEN** config stores transport `mcp`, work item type `User Story`, tag `factory`, change field `Custom.OpenSpecChange`, and ready state `Ready for Factory`

### Requirement: One story per change
`idefactory board publish <change>` SHALL create one story for an on-disk OpenSpec change, with the factory tag and the change field, and SHALL store its id in `.factory/boards/<change>.json`. A second publish SHALL update that story and SHALL NOT create another.

#### Scenario: Second publish updates
- **WHEN** publish runs twice for the same change
- **THEN** the board client receives one create and one update
- **AND** the record keeps the first work item id

#### Scenario: Missing change
- **WHEN** publish runs for a change with no `openspec/changes/<change>/`
- **THEN** the command exits non-zero and the board client is not invoked

### Requirement: Token stays off argv
With the `az` transport, board and Azure forge calls SHALL pass `ADO_TOKEN` to the child process only as `AZURE_DEVOPS_EXT_PAT` in its environment and SHALL NOT place a token on argv. With the default `mcp` transport, board commands SHALL NOT read `ADO_TOKEN` or start a child process.

#### Scenario: Token in environment
- **WHEN** publish runs with the `az` transport and `ADO_TOKEN` set
- **THEN** the board client sees `AZURE_DEVOPS_EXT_PAT`
- **AND** no argv contains the token value

### Requirement: Allowed transitions
`idefactory board transition <change> --to <key>` SHALL accept only `in-progress`, `waiting`, `blocked`, `in-review`, and `ready-for-human-review`, and SHALL map each to the configured state. Any other key, including `ready`, `new`, and `done`, SHALL fail without a board call.

#### Scenario: Agent cannot retrigger
- **WHEN** transition runs with `--to ready`
- **THEN** the command exits non-zero and the board client is not invoked

### Requirement: Keyed comments
`idefactory board comment <change> --message <text> --key <key>` SHALL post one comment per key. Repeating the key SHALL NOT post again.

#### Scenario: Repeated key
- **WHEN** the same comment key is posted twice
- **THEN** the board client receives one comment

### Requirement: Report mirrors factory state
`idefactory board report <change>` SHALL post one comment for each newly done work item naming the task and attempt and SHALL NOT include check logs. It SHALL move the story to `blocked` for `HALT` or an active lockout, to `ready-for-human-review` when a pull request record exists and every work item is done, to `in-review` when a pull request record exists otherwise, to `waiting` after a human-gate or budget stop, and to `in-progress` otherwise. It SHALL link the pull request once.

#### Scenario: Done task is reported once
- **WHEN** report runs twice after one work item is done
- **THEN** the board client receives one comment naming that task and attempt

#### Scenario: Pull request ready for human review
- **WHEN** a pull request record exists and every work item is done
- **THEN** the story moves to the ready-for-human-review state and links the pull request

#### Scenario: Human gate waits
- **WHEN** the latest run session stopped with `human-gate`
- **THEN** the story moves to the waiting state

### Requirement: Board mirror runs under HALT
`board comment`, `board transition`, and `board report` SHALL run while `HALT` exists and SHALL NOT remove it. `board publish` and `board configure` SHALL refuse while `HALT` exists.

#### Scenario: Report under HALT
- **WHEN** `HALT` exists and report runs
- **THEN** the story moves to the blocked state
- **AND** `HALT` still exists
