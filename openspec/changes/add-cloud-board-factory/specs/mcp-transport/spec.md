# Spec Delta

## Purpose

Lets a cloud agent write to Azure DevOps through Cursor's MCP connection, with no Azure DevOps secret on the VM, while the CLI keeps deciding what may be written and recording what was.

## ADDED Requirements

### Requirement: MCP is the default transport
With `board.transport` or `forge.transport` unset or `mcp`, commands that would write to Azure DevOps SHALL NOT start a child process, read `ADO_TOKEN`, or call the network. They SHALL save a plan and print it.

#### Scenario: Publish prints a plan
- **WHEN** `board publish <change>` runs with the `mcp` transport
- **THEN** the output names one `wit_work_item_write` create operation with the organization, project, work item type, title, tag, and change field filled in
- **AND** no board record exists until the plan is acknowledged

### Requirement: Plans are deterministic
A plan SHALL hold ordered `{ tool, arguments }` operations and the record to store. Its id SHALL be a digest of its content.

#### Scenario: Same plan, same id
- **WHEN** the same command runs twice with the same inputs
- **THEN** both runs print the same plan id and one plan file exists

### Requirement: Plans are restricted
The builder SHALL accept only `wit_work_item_write` (`create`, `update`), `wit_work_item_comment_write` (`add`), `wit_work_item_link_write` (`link`), `repo_pull_request_write` (`create`, and `update` of the description), and `repo_pull_request_thread_write` (`create`), and SHALL refuse pull request arguments `autoComplete`, `mergeStrategy`, `mergeCommitMessage`, `bypassReason`, `deleteSourceBranch`, `vote`, `status`, `reviewerIds`, and `isDraft`.

#### Scenario: Other tool refused
- **WHEN** a plan is built with a tool or action outside the allowlist
- **THEN** the builder throws and no plan is saved

### Requirement: Ack records the result
`idefactory mcp ack <planId> --result <json>` SHALL write the plan's record, set the work item id or pull request number from the result when the plan creates one, append an `mcp-ack` control event, and delete the plan. It SHALL fail for an unknown plan, for a result that lacks the id a create plan needs, and for a plan whose content no longer matches its id. `idefactory mcp pending` SHALL list unacknowledged plans.

#### Scenario: Create ack stores the id
- **WHEN** a publish plan is acknowledged with `{"workItemId": 321}`
- **THEN** `.factory/boards/<change>.json` names work item 321
- **AND** the plan file is gone

#### Scenario: Missing id
- **WHEN** a publish plan is acknowledged with an empty result
- **THEN** ack exits non-zero and the plan file remains

### Requirement: Reads come from agent snapshots
With the `mcp` transport, `board claim` SHALL require `--snapshot <file>` containing the story as returned by `wit_work_item get`, and `pr capture` SHALL require `--threads-file <file>` containing the output of `repo_pull_request_thread list`. Without the file each SHALL fail and name the MCP read to run.

#### Scenario: Claim without snapshot
- **WHEN** `board claim` runs with the `mcp` transport and no snapshot
- **THEN** it exits non-zero and names `wit_work_item`

### Requirement: Plans never complete a pull request
A pull request plan SHALL NOT merge, auto-complete, bypass policy, vote, or abandon.

#### Scenario: Pull request plan carries no completion argument
- **WHEN** `pr open` prints a plan for the Azure provider
- **THEN** no operation carries `autoComplete`, `bypassReason`, `vote`, or `status`
