# Spec Delta

## ADDED Requirements

### Requirement: Cloud skill
Init and upgrade SHALL install a `factory-cloud` skill beside the other factory skills. It SHALL state that the IDE session model does the work, that a board claim decides whether the run begins, that `--new-run` is used only when the claim decides `resume`, and that Azure DevOps is reached only through the operations the CLI prints. The coordinator skill SHALL route a board claim request to `factory-cloud`.

#### Scenario: Cloud skill installed
- **WHEN** init runs
- **THEN** `.cursor/skills/factory-cloud/SKILL.md` exists and names `idefactory board claim`
- **AND** the coordinator skill names `factory-cloud`

### Requirement: Cloud skill keeps gates
The `factory-cloud` skill SHALL state that the agent never merges, approves for itself, resolves a lockout, calls the MCP with `autoComplete`, `bypassReason`, `vote`, or an abandon status, clears `HALT`, moves a story to ready or done, or runs `idefactory red waive` or `idefactory red reuse`.

#### Scenario: Cloud skill keeps gates
- **WHEN** the installed `factory-cloud` skill is read
- **THEN** it says the agent never merges and uses `--new-run` only for a `resume` decision
