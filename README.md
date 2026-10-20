# IDE Factory

A software factory that runs inside Cursor, GitHub Copilot, and Claude Code. The human defines what to build with [OpenSpec](https://openspec.dev). [Backlog.md](https://backlog.md) is the only execution queue. Shared team memory lives in `.factory/`. The IDE's own model does the work.

There is no Ollama host, no model HTTP client, and no loop that browses the web for product ideas.

It combines two existing workflows:

- The spec, backlog, test-first build, and human approval path from Jason Danley's factory.
- The shared roster, per-agent memory, and IDE command layout from Squad4Cursor.

OpenSpec still owns proposals, specs, and archive. Backlog.md still owns task files. This tool installs the team memory and the instructions that tell the IDE how to staff a change.

## Add it to a project

From a checkout of this repository:

```bash
npm install
npm link

cd /path/to/your-project
idefactory init
idefactory doctor
```

`init` works in a new directory or an existing repo. It creates `.factory/` and the Cursor, Copilot, and Claude adapters. It does not delete application files. A second run keeps `decisions.md`, agent histories, charters, and the roster. Text already in `AGENTS.md`, `CLAUDE.md`, or `.github/copilot-instructions.md` stays; the factory inserts a marked section. A `.squad/` directory is left untouched. An existing `GOLDEN_RULES.md` is not replaced.

Without a global link:

```bash
node /path/to/ide-factory/src/cli.mjs init --path /path/to/your-project
```

Optional CLIs, only when those folders are not already there:

```bash
idefactory init --with-openspec --with-backlog
```

Refresh adapter files after you pull a newer factory, without rewriting decisions:

```bash
idefactory upgrade
```

## How a change gets built

1. You author an OpenSpec change. In Cursor or Copilot that is `/opsx-propose`. In Claude Code it is `/opsx:propose`. The factory will not invent the product for you.
2. Plan it with `/factory-plan`, or run `idefactory sync-tasks <change>`. Each unchecked box in `tasks.md` becomes one Backlog.md task labeled with the change. Checked boxes are skipped. Running it again does not duplicate tasks.
3. Build with `/factory-build`, or run `idefactory next` and let the IDE session implement that packet. The packet names one role and only that role's charter. The engineer writes a failing test first. A different role reviews.
4. You record spend, publishing, or deployment yourself:

```bash
idefactory approve <id> --note "what you are allowing"
idefactory reject <id> --note "why not"
```

`HALT` in the project root stops `next` and `sync-tasks`. `idefactory resume` clears it.

## Commands

| Command | What it does |
| --- | --- |
| `idefactory init` | Install `.factory/` and IDE adapters |
| `idefactory upgrade` | Refresh factory-owned skills, commands, and rules |
| `idefactory doctor` | Fail if team state or the coordinator skill is missing |
| `idefactory status` | Show halt, the active change, the roster, and backlog counts |
| `idefactory sync-tasks <change>` | Create Backlog.md tasks from unchecked OpenSpec boxes |
| `idefactory next` | Print one role-scoped work packet. Does not launch a model |
| `idefactory approve` / `reject` | Append a human decision. Does not publish or spend |
| `idefactory lockout` | Record a reviewer rejection |
| `idefactory halt` / `resume` | Set or clear the kill switch |

Slash commands in the IDE: `/factory-status`, `/factory-plan`, `/factory-build`, `/factory-review`.

## What gets installed

```text
.factory/                  roster, routing, decisions, charters, histories, approvals
.cursor/skills/factory-*   Cursor skills
.cursor/commands/factory-* Cursor slash commands
.cursor/rules/factory.mdc  applies only when you ask the factory to work
.github/agents/factory.agent.md
.github/prompts/factory-*.prompt.md
.github/skills/factory-*
.claude/skills/factory-*
.claude/commands/factory-*
.agents/skills/factory-*   same skills for other AGENTS.md tools
```

The Cursor rule tells the session to leave unrelated requests alone, so a test-first skill is not fighting a team router on every turn. If Superpowers skills such as `test-driven-development` are already installed, `factory-build` follows those. Otherwise it follows the bundled `factory-tdd`, `factory-verify`, and `factory-debug` skills.

`idefactory upgrade` overwrites files that carry `<!-- idefactory:owned -->`. Other skills, including OpenSpec's, stay in place.

## Develop

```bash
npm install
npm test
```

Node.js 20 or newer. The behavior spec for this repository is in `openspec/specs/`. The change that introduced it is archived at `openspec/changes/archive/2026-10-20-ide-native-factory`. Backlog tasks TASK-1 through TASK-8 are Done.

```bash
npx openspec validate --specs --strict
npx backlog task list --plain
```
