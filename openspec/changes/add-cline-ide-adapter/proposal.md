# Proposal

## Why

`idefactory init` installs factory skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code, and it does not install the matching Cline project files. Cline already reads `AGENTS.md` and `.agents/skills/`, but that is incidental discovery, not the same owned adapter surface the other IDEs get.

## What Changes

- On `idefactory init` and `idefactory upgrade`, install the existing factory skills, the six factory commands, and one narrow factory rule into Cline's current project directories under `.cline/`.
- Keep `.factory/work/` as the only execution queue. Do not add a Cline queue, a Cline runtime, or a second orchestration path.
- Extend the install parity tests so Cline is checked the same way Cursor, Copilot, and Claude already are.
- Leave Cursor, Copilot, and Claude adapter paths in place.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ide-adapters`: The shared command set, narrow activation rule, and upgrade refresh include Cline as well as Cursor, GitHub Copilot, and Claude Code.
- `project-install`: Init creates the Cline rule, the Cline `factory-coordinator` skill, and the Cline workflow commands, and still preserves unrelated project files.
- `human-governance`: After init, `doctor` treats the Cline factory rule and Cline `factory-coordinator` skill as required adapter files, the same way it already treats the other IDE adapters.

## Impact

Affected code is `src/lib/install.mjs`, `src/lib/govern.mjs` only if `doctor` should require the new Cline files the way it already requires the other IDE adapters, `templates/fragments/instructions.md` so the shared instruction section names the Cline rule, and `test/install.test.mjs`. No new dependency. No change to `.factory/work/`, attempt lifecycle, verification evidence, or lockout.

Cline's current project layout, from its configuration docs, is `.cline/rules/`, `.cline/workflows/`, and `.cline/skills/`. Cline still also reads the older `.clinerules/` tree, root `AGENTS.md`, and skills under `.agents/skills/` and `.claude/skills/`. This change writes only the `.cline/` copies so rules and skills are not installed twice.

Cline workflow files are invoked with the filename, for example `/factory-status.md`, not the extensionless `/factory-status` used by Cursor and Claude. Skill directories remain invocable as `/factory-status` because Cline treats a skill name as a slash command. The workflow file is the command adapter; the skill file remains the procedure.

### Out of scope

- Applying or archiving this change, and any edit to factory queue, gate, evidence, or lockout behavior.
- Cline hooks, plugins, `.cline/agents/`, global `~/.cline/` or `~/Documents/Cline/` files, and the Cline UI toggle store.
- Copying rules into both `.cline/` and `.clinerules/`.
- Removing the existing Claude or `.agents/skills/` copies that Cline may also discover.
- Changing `openspec init --tools`, CI workflows, or Semgrep.
- Teaching Cline to launch a model. The installed text keeps "the IDE session model does the work."

### Acceptance criteria

- After init, `.cline/rules/factory.md` exists, tells Cline to follow factory skills only for factory requests, and says unrelated requests are left alone.
- After init, each factory skill directory under `templates/skills/` is copied to `.cline/skills/<name>/`, and `.cline/skills/factory-coordinator/SKILL.md` states that the IDE session model does the work.
- After init, `.cline/workflows/` contains `factory-status.md`, `factory-plan.md`, `factory-build.md`, `factory-run.md`, `factory-full.md`, and `factory-review.md`, each directing Cline to the same skill the other IDE commands use.
- Those Cline files contain no instruction for the factory CLI to launch a model.
- Upgrade refreshes a factory-owned Cline skill and leaves a custom `.factory/decisions.md` entry in place.
- Init does not modify an existing application file, `.squad/`, or a user file already under `.cline/` that this change does not own.
- `.factory/work/` remains the only execution queue. No new queue file or Cline-specific orchestration command is added.

### Migration and rollback

- New projects get the Cline files on the first init after this change is applied.
- Existing projects get them by running `idefactory upgrade`, which rewrites factory-owned adapter files and does not replace `decisions.md` or agent histories.
- Upgrade overwrites `.cline/rules/factory.md`, `.cline/skills/factory-*`, and `.cline/workflows/factory-*.md` when those names are factory-owned, matching the Cursor rule overwrite. It does not delete other files in `.cline/`.
- Rollback is reverting the install commit, or deleting only those factory-owned `.cline` paths. No data migration and no queue rewrite.

### Verification

- `npx openspec validate add-cline-ide-adapter --strict`
- `npx openspec validate --all`
- `node --test test/install.test.mjs`

### Threats

- Cline can list the same skill from `.cline/skills/`, `.claude/skills/`, and `.agents/skills/`. This change does not remove the other copies.
- A workflow that is toggled off in Cline's Rules and Workflows panel will not appear as a slash command even though the file is present. Install does not write Cline's UI toggle state.
- Writing the same rule into both `.cline/rules/` and `.clinerules/` would apply it twice. This change uses `.cline/` only.
- An always-on rule consumes context. The Cline rule stays as short as `.cursor/rules/factory.mdc`.
