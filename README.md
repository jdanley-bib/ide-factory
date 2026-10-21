# IDE Factory

A software factory that runs inside Cursor, GitHub Copilot, and Claude Code. The human defines what to build with [OpenSpec](https://openspec.dev). `.factory/work/` is the only execution queue. Shared team memory lives in `.factory/`. The IDE's own model does the work.

There is no Ollama host, no model HTTP client, and no loop that browses the web for product ideas. Backlog.md is not required.

## Add it to a project

From a checkout of this repository:

```bash
npm install
npm link

cd /path/to/your-project
idefactory init
idefactory doctor
```

`init` works in a new directory or an existing repo. It creates `.factory/` and the Cursor, Copilot, and Claude adapters. It does not delete application files. A second run keeps `decisions.md`, agent histories, charters, and the roster. Text already in `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` stays; the factory inserts a marked section. A `.squad/` directory is left untouched.

Without a global link:

```bash
node /path/to/ide-factory/src/cli.mjs init --path /path/to/your-project
```

Optional OpenSpec scaffold (uses the OpenSpec CLI via Node; Backlog.md is not required):

```bash
idefactory init --with-openspec
```

`--with-backlog` is ignored (deprecated). The execution queue is `.factory/work/`.

Refresh adapter files after you pull a newer factory, without rewriting decisions:

```bash
idefactory upgrade
```

## How a change gets built

1. You author an OpenSpec change (`/opsx-propose` or equivalent). The factory will not invent the product for you.
2. Plan with `/factory-plan`, or run `idefactory sync-tasks <change>`. Each unchecked box in `tasks.md` becomes one work item under `.factory/work/`. Optional `factory:` YAML under a checkbox sets kind, roles, checks, and dependencies.
3. Build one item with `/factory-build`, run a bounded multi-item loop with `/factory-run` / `idefactory run --change <name> --until human-gate`, or use `/factory-full` for explore → propose (if needed) → plan → run in one flow.
4. Attempts record red/verify/security/review evidence. Finalize with `idefactory complete <change> <id> --attempt <attemptId>`.
5. Record spend, publishing, or deployment yourself:

```bash
idefactory approve <id> --note "what you are allowing"
idefactory reject <id> --note "why not"
```

`HALT` in the project root stops mutating factory commands. `idefactory resume` clears it.

## Commands

| Command | What it does |
| --- | --- |
| `idefactory init` | Install `.factory/` and IDE adapters |
| `idefactory upgrade` | Refresh factory-owned skills, commands, and rules |
| `idefactory doctor` | Fail if team state or the coordinator skill is missing |
| `idefactory status` | Show halt, the active change, the roster, and work queue counts |
| `idefactory sync-tasks <change>` | Create work items from unchecked OpenSpec boxes |
| `idefactory next` | Print one role-scoped work packet. Does not launch a model |
| `idefactory run` | Emit the next orchestration request or stop reason (exit 2 = needs agent) |
| `idefactory attempt …` | Start/transition/show execution attempts |
| `idefactory complete` | Atomically finalize an accepted attempt |
| `idefactory approve` / `reject` | Append a human decision. Does not publish or spend |
| `idefactory lockout` | Record a reviewer rejection |
| `idefactory halt` / `resume` | Set or clear the kill switch |

Slash commands: `/factory-status`, `/factory-plan`, `/factory-build`, `/factory-run`, `/factory-full`, `/factory-review`.

## What gets installed

```text
.factory/                  roster, routing, decisions, work queue, attempts, profiles
.cursor/skills/factory-*   Cursor skills
.cursor/commands/factory-* Cursor slash commands
.cursor/rules/factory.mdc  applies only when you ask the factory to work
.github/agents/factory.agent.md
.github/prompts/factory-*.prompt.md
.github/skills/factory-*
.claude/skills/factory-*
.claude/commands/factory-*
.agents/skills/factory-*
```

Operational baseline lives in `.factory/governance.md`.

## Develop

```bash
npm install
npm test
```

Node.js 20 or newer. Behavior specs are in `openspec/specs/`. Active change: `openspec/changes/factory-orchestration`.
