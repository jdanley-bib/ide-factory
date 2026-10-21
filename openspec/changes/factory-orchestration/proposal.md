# Proposal: Factory Orchestration

## Why

The first end-to-end run showed a role-guided task runner, not a software-development factory. Lifecycle, evidence, reviewer separation, and completion were prompt conventions. Backlog.md was a thin external dependency. `GOLDEN_RULES.md` belonged to an older ideation-factory design.

## What Changes

- Replace Backlog.md as the required execution queue with a first-party work queue under `.factory/work/`.
- Add execution attempts with an explicit lifecycle, structured evidence, and atomic `idefactory complete`.
- Add task classification metadata, dependency ordering, and risk-based verification profiles.
- Expand the roster with test-engineer and security-reviewer; select pipelines from classification.
- Add orchestration requests, model profile hints, and a human-started bounded `/factory-run` loop (CLI never launches a model).
- Retire shipped `GOLDEN_RULES.md`; keep a lean operational baseline in `.factory/governance.md`.
- Keep Squad4Cursor coexistence (never touch `.squad/`); borrow patterns only, no dependency.

## Capabilities

- `spec-to-work` (replaces `spec-to-backlog` as the sync story)
- `factory-orchestration` (attempts, complete, run, stop conditions)
- `task-classification` (metadata, deps, profiles, role pipelines)
- Deltas to `guided-build`, `shared-team-state`, `ide-adapters`, `human-governance`, `project-install`

## Out of Scope

- Ollama / model HTTP APIs / paid model clients
- Unattended Ralph-style watch loops / wrapping `s4c watch --execute`
- Inventing OpenSpec product changes from the web
- Replacing OpenSpec propose/archive
- Depending on or merging Squad4Cursor
- Backlog.md compatibility adapter
- Product-morality golden-rules document
