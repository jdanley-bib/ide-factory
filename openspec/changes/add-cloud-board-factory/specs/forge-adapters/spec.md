# Spec Delta

## Purpose

Keeps one pull request per change while the product repository moves between Azure Repos and GitHub.

## ADDED Requirements

### Requirement: GitHub is the default forge
When `.factory/config.json` has no `forge` entry, or its provider is `github`, `pr open`, `pr comment`, and `pr capture` SHALL use the existing `gh` argv.

#### Scenario: No forge config
- **WHEN** pr open runs with no forge config
- **THEN** the forge receives `pr create`

### Requirement: Forge configure
`idefactory forge configure --provider github` SHALL store the GitHub provider. `idefactory forge configure --provider azure-devops` SHALL require an organization, project, and repository, SHALL store the transport (`mcp` by default, or `az`) and the target branch (`main` by default), and SHALL write nothing without the required values. Any other provider SHALL fail.

#### Scenario: Azure without repository
- **WHEN** forge configure runs for `azure-devops` without a repository
- **THEN** the command exits non-zero and config is unchanged

### Requirement: Azure pull request per change
With the `azure-devops` provider, `pr open` SHALL create one pull request from `factory/<change>` (through an MCP plan, or `az repos pr create` with the `az` transport), store its id and web URL, and update the same pull request on a second open.

#### Scenario: Second open updates
- **WHEN** pr open runs twice with the Azure provider
- **THEN** the forge receives one create and one update
- **AND** the record URL is the Azure Repos pull request web URL

### Requirement: Azure comments and capture
`pr comment` SHALL add one thread. Verdict posts after an attempt transition SHALL add one thread with the `az` transport and SHALL be left to an explicit `pr comment` with the `mcp` transport. `pr capture` SHALL store each human comment once keyed by thread and comment id and SHALL skip system comments.

#### Scenario: Capture skips system comments
- **WHEN** a thread has one human comment and one system comment
- **THEN** capture stores only the human comment

### Requirement: Azure forge never completes
Azure forge argv and MCP plans SHALL NOT contain `merge`, `--auto-complete`, `--bypass-policy`, `--status`, or a policy or ref command, and a pull request plan SHALL NOT carry `autoComplete`, `bypassReason`, `vote`, or `status`. A change SHALL be deliverable only when its record names the open pull request on `factory/<change>`, for either provider.

#### Scenario: Auto-complete refused
- **WHEN** a forge argv contains `--auto-complete`
- **THEN** the forge is not invoked

#### Scenario: MCP plan refuses auto-complete
- **WHEN** a pull request plan is built with an `autoComplete` argument
- **THEN** the plan builder throws and no plan is saved
