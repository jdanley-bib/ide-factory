# Spec Delta

## ADDED Requirements

### Requirement: Doctor checks optional integrations
Doctor SHALL NOT require `forge` or `board` config or an `ADO_TOKEN`. When `forge` exists, doctor SHALL fail for an unknown provider or an `azure-devops` provider missing organization, project, or repository, or a transport other than `mcp` or `az`. When `board` exists, doctor SHALL fail for a transport other than `mcp` or `az`, when the organization or project is missing or the ready state equals another configured state.

#### Scenario: Local install stays healthy
- **WHEN** doctor runs after init and setup with no forge or board config and no `ADO_TOKEN`
- **THEN** doctor exits zero

#### Scenario: Ready state collision
- **WHEN** board config sets the ready state equal to the in-progress state
- **THEN** doctor exits non-zero and names the board state
