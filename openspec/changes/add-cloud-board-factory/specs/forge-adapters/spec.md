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
`idefactory forge configure --provider github` SHALL store the GitHub provider. `idefactory forge configure --provider azure-devops` SHALL require an organization, project, and repository and SHALL write nothing without them. Any other provider SHALL fail.

#### Scenario: Azure without repository
- **WHEN** forge configure runs for `azure-devops` without a repository
- **THEN** the command exits non-zero and config is unchanged

### Requirement: Azure pull request per change
With the `azure-devops` provider, `pr open` SHALL create one pull request from `factory/<change>` with `az repos pr create`, store its id and web URL, and update the same pull request on a second open. `pr comment` and verdict posts SHALL add one thread through `az devops invoke`. `pr capture` SHALL store each human comment once keyed by thread and comment id and SHALL skip system comments.

#### Scenario: Second open updates
- **WHEN** pr open runs twice with the Azure provider
- **THEN** the forge receives one create and one update
- **AND** the record URL is the Azure Repos pull request web URL

#### Scenario: Capture skips system comments
- **WHEN** a thread has one human comment and one system comment
- **THEN** capture stores only the human comment

### Requirement: Azure forge never completes
Azure forge argv SHALL NOT contain `merge`, `--auto-complete`, `--bypass-policy`, `--status`, or a policy or ref command. A change SHALL be deliverable only when its record names the open pull request on `factory/<change>`, for either provider.

#### Scenario: Auto-complete refused
- **WHEN** a forge argv contains `--auto-complete`
- **THEN** the forge is not invoked
