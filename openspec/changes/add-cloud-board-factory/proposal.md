# Proposal

## Why

The factory runs only when a human opens an IDE session and starts `/factory-run`. Product repositories live in Azure Repos, and the team tracks work on an Azure DevOps board. Stage 0 deliberately left ticket intake, Azure DevOps, and a headless executor out of scope, and `require-pr-open-for-delivery` said later Azure DevOps credentials would be runtime secrets. This change adds that next stage: a human moves one Azure DevOps User Story to a ready state, a Cursor cloud agent claims it, and the factory carries the OpenSpec change to an open pull request while the story mirrors progress.

## What Changes

- Add `idefactory board configure|publish|claim|report|comment|transition`. One Azure DevOps User Story per OpenSpec change is the human board, the start signal, and the progress mirror. `.factory/boards/<change>.json` stores the work item id, the last mirrored state, posted comment keys, and claimed revisions. The default transport is `mcp`: the CLI never contacts Azure DevOps. It prints a plan of exact Azure DevOps MCP operations, the cloud agent applies them through Cursor's Azure DevOps MCP connection, and `idefactory mcp ack` records the result. No Azure DevOps secret is on the VM. The optional `az` transport runs the Azure CLI with `ADO_TOKEN` passed through the child environment, never argv, for use outside a cloud agent.
- Add `idefactory board claim`. It checks that the story is in the ready state, carries the factory tag, and names an on-disk OpenSpec change. It decides `start`, `resume`, `skip`, `duplicate`, `not-ready`, or `halted`. Only a story returned to ready after a human stop (`waiting` or `blocked`) resumes. A repeated revision is a no-op. Each claim appends a `board-claim` event.
- Split the forge into `github` and `azure-devops` adapters selected by `idefactory forge configure`. GitHub stays the default. The Azure adapter opens, updates, comments on, and captures comments for one pull request per change, through MCP plans by default or `az repos pr` and `az devops invoke` with the `az` transport. Plans and argv refuse merge, auto-complete, policy bypass, votes, and status changes.
- Add `idefactory mcp ack|pending`. A plan is a persisted, deterministic list of MCP operations restricted to an allowlist of tools and actions. Board and pull-request state in the record changes only when a plan is acknowledged. Claim reads the story from an MCP snapshot file, and its writes carry an optimistic-concurrency `Test` on the story revision, so two cloud runs cannot both claim it.
- Add a `factory-cloud` skill that a Cursor Automation prompt points at, and a reference Azure DevOps service-hook filter under `tools/ado-bridge/`. `idefactory init` installs the skill with the other factory skills and does not install the bridge or create Azure DevOps hooks.
- Doctor validates `forge` and `board` config, including `transport`, only when present. A project with neither, and no `ADO_TOKEN`, stays healthy.

## Capabilities

### New Capabilities

- `board-projection`: publish, comment, transition, and report one Azure DevOps story per OpenSpec change.
- `automation-start`: idempotent board claims that decide whether a cloud run starts, resumes, or stops.
- `forge-adapters`: GitHub and Azure DevOps pull-request adapters behind one forge port.
- `mcp-transport`: plan and acknowledge Azure DevOps writes through the agent's MCP connection instead of a secret on the VM.

### Modified Capabilities

- `ide-adapters`: installed skills include `factory-cloud`, and the coordinator routes a board claim to it.
- `human-governance`: doctor checks optional forge and board config and does not require Azure DevOps.

## Impact

- New `src/lib/board.mjs`, `src/lib/azure-cli.mjs`, and `src/lib/integration-config.mjs`; changes to `src/lib/forge.mjs`, `src/lib/pull-request.mjs`, `src/lib/run.mjs`, `src/lib/writer-lease.mjs`, `src/lib/event-log.mjs`, and `src/lib/govern.mjs`.
- New `templates/skills/factory-cloud/SKILL.md`, coordinator and run skill text, and the Cursor, Cline, and Copilot rule templates.
- New `tools/ado-bridge/` reference filter with no runtime dependency.
- New `src/lib/mcp-plan.mjs`. New stub `support/fake-az.mjs` for the `az` transport. `npm test` does not call Azure DevOps or GitHub.
- No new runtime dependency. The CLI still does not launch a model. `config.runtime` stays `ide`.

## Out of scope

- The CLI starting Cursor, a model, or a cloud agent. A Cursor Automation is the runner.
- Mirroring each factory checkbox as an Azure DevOps task.
- Drafting an OpenSpec change from a blank story.
- Merging, auto-complete, self-approval, clearing `HALT`, resolving a lockout, or moving a story to Done.
- GitHub Issues or any second board provider.
- Creating Azure DevOps processes, states, fields, or service hooks from `idefactory`.
- Making Azure DevOps, a webhook, or a cloud agent required for local use.
- Pushing commits to Azure Repos. The Azure DevOps MCP can create a branch ref and pull request but cannot push, so the cloud agent's own git integration pushes `factory/<change>`.
