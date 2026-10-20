# Proposal

## Why

Jason Danley's factory specs work with OpenSpec and Backlog.md, then builds it under Superpowers-style discipline, but it depends on Ollama and invents products from the web. Squad4Cursor keeps a shared team memory and Cursor adapters, but it does not own that spec-to-backlog pipeline. People working in Cursor, GitHub Copilot, or Claude Code need one factory that uses the IDE's own model and lets the human say what to build.

## What Changes

- Add an `idefactory` command that installs shared team state and IDE instructions into a new or existing project.
- Install the same skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code.
- Read a human-authored OpenSpec change and create Backlog.md tasks from its unchecked boxes.
- Print a single-role work packet the IDE session implements. Do not launch a model.
- Record human approvals, a halt switch, and a doctor check.
- Ship golden rules that forbid autonomous web ideation, unapproved spend, and publishing.

## Capabilities

### New Capabilities

- `project-install`: Install and reinstall the factory without discarding an existing project.
- `shared-team-state`: One roster, decision log, and per-agent memory for every IDE.
- `ide-adapters`: Skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code.
- `spec-to-backlog`: Turn a human-authored OpenSpec change into Backlog.md tasks.
- `guided-build`: Hand the IDE one role-scoped task and require test-first work plus a separate review.
- `human-governance`: Approvals, halt, lockout notes, and an install health check.

### Modified Capabilities

- None.

## Impact

- New CLI and templates in this repository.
- Consumer projects gain `.factory/`, `.cursor/`, `.github/`, and `.claude/` factory files.
- Depends on the OpenSpec and Backlog.md CLIs for authoring and task storage. This tool does not replace either store.
- No Ollama, no hosted model client, and no web ideation loop.

## Out of scope

- Choosing product ideas from Hacker News, Reddit, npm, or any other web source.
- Running Ollama or calling GitHub Models, OpenAI, Anthropic, or OpenRouter.
- A continuous unattended loop that edits the repo without a person in the IDE.
- Publishing, deploying, or spending money.
- Replacing OpenSpec propose/archive or Backlog.md's own task files.
