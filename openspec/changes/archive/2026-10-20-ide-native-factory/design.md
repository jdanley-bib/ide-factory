# Design

## Context

See proposal.md for why this exists. The consumer project already may contain application code, an `AGENTS.md`, OpenSpec skills, and sometimes a `.squad/` tree from Squad4Cursor. OpenSpec remains the spec store (`openspec/`). Backlog.md remains the task store (`backlog/`). This tool adds `.factory/` and IDE adapters. It does not vendor Ollama, Superpowers, or Squad4Cursor.

## Goals / Non-Goals

**Goals:**

- One install command for a new or existing repo.
- The same instructions in Cursor, GitHub Copilot, and Claude Code.
- A mechanical bridge from OpenSpec `tasks.md` checkboxes to Backlog.md tasks.
- A text work packet scoped to one agent charter.
- Human approval files and a `HALT` switch enforced by the CLI.

**Non-Goals:**

- Launching Cursor, Copilot, Claude, or any model.
- Authoring OpenSpec proposals. The human (or OpenSpec's own propose skill) does that.
- Web research, idea scoring, or a daily autonomous loop.
- A second task database inside `.factory/`.
- Editing `.squad/` or replacing Squad4Cursor when it is already installed.

## Decisions

### Shared memory root is `.factory/`

Squad4Cursor owns `.squad/`. Using that path would collide on upgrade and on `alwaysApply` rules. `.factory/` holds team.md, routing.md, decisions.md, config.json, identity, agent charters and histories, approvals, and orchestration notes. All three IDEs are told to read and append there.

Alternative considered: reuse `.squad/` so Copilot's squad agent and this factory share files. Rejected because this product must install cleanly beside Squad and must not rewrite Squad skills.

### The CLI never calls a model

`idefactory next` prints Markdown. `sync-tasks` shells out only to the Backlog.md CLI. Status, doctor, approve, reject, halt, and lockout are file operations. Model choice stays in the IDE UI. `config.json` `models` values are the literal hint `ide-session`.

Alternative considered: optional provider block like the upstream factory. Rejected. A provider block is a model client even when disabled by default.

### Adapters are copies of one template

Canonical skills live in `templates/skills/`. Init copies them to `.cursor/skills/`, `.claude/skills/`, and `.github/skills/`. Commands are one body with IDE-specific frontmatter, written to `.cursor/commands/`, `.claude/commands/`, and `.github/prompts/`. A Cursor rule and a Copilot custom agent point at the coordinator skill. Owned files carry `<!-- idefactory:owned -->`. Upgrade overwrites only those adapter files.

If a Superpowers skill such as `test-driven-development` is already installed, the factory-build skill tells the agent to follow that skill. Otherwise the agent follows the bundled `factory-tdd`, `factory-verify`, and `factory-debug` skills. Those skills are original procedure text, not a copy of the Superpowers repository.

### OpenSpec and Backlog stay external

`sync-tasks <change>` reads `openspec/changes/<change>/tasks.md`, parses `- [ ] 1.2 Title` lines, and runs `backlog task create` with the label of the change name plus `factory`, and the description line `openspec-task: 1.2`. A second run lists tasks and skips ids already present. Checked boxes are ignored. The active change is recorded in `.factory/active-change.json`, which is a pointer, not a task list.

Init options `--with-openspec` and `--with-backlog` invoke those CLIs only when the project does not already have them, and only when the binary is on PATH or in `node_modules`.

### Roster preservation

First init writes the default roster: Lead, Architect, Engineer, Reviewer, Scribe. Scribe's charter forbids product code. Re-init creates missing state files and does not rewrite `decisions.md`, histories, `team.md`, charters, or `config.json` when they already exist. `--force-roster` rewrites team, routing, and charters only. Histories and decisions stay.

`AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` get a section between `<!-- idefactory:start -->` and `<!-- idefactory:end -->`. Existing text outside that section stays. `GOLDEN_RULES.md` is copied only when the file is absent.

### Routing for the next packet

Default primary role is Engineer. A task whose title or body matches architecture or production-architecture language routes to Architect. The packet embeds that role's charter path and history path and no other charter path. It tells the session to write a failing test first, run a verification command, and hand review to a different role (Reviewer).

### Governance files

`approve` and `reject` append a dated entry to `decisions.md` and write `.factory/approvals/<stamp>-<id>.md`. They do not run git push, package publish, or cloud CLIs. `lockout` writes `.factory/orchestration/<stamp>-lockout.md`. `HALT` in the project root makes `next` and `sync-tasks` exit with an error before they read or write tasks.

### Cursor rule is short and conditional

The rule file is always available so the session can see it, and its text says to apply the factory workflow only when the human asks for factory plan, build, review, or status. Unrelated work is left alone. This avoids the split where an always-on team router fights a test-first skill on every turn.

## Risks / Trade-offs

- [Agents can ignore skills] → The CLI still enforces install shape, one-role packets, backlog creation, halt, and approval files. Doctor reports missing adapters. TDD itself remains a prompt the IDE must follow.
- [Backlog.md CLI is absent] → `sync-tasks` exits with an install hint. It does not hand-write `backlog/tasks/*.md`.
- [Upgrade overwrites owned skills] → Documented. Other skill directories are not deleted. Removing the owned marker pins a file.
- [Last writer wins if two IDEs edit `.factory/` together] → Instructions say one session writes team memory at a time. Git is the merge tool.

## Migration Plan

This is the first release. Install with `idefactory init` in the target repo. Re-running init is the rollback-safe path: it will not delete decisions or histories. Removing the factory means deleting `.factory/` and the `factory-*` adapter files; OpenSpec and Backlog files stay.

## Open Questions

None that change the spec. Archive of this change waits until the tasks below are checked and reviewed.
