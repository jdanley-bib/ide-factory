# Design

## Context

`writeAdapters` in `src/lib/install.mjs` copies `templates/skills/` into `.cursor/skills`, `.claude/skills`, `.github/skills`, and `.agents/skills`, writes the six factory commands into Cursor commands, Claude commands, and Copilot prompts, and writes `.cursor/rules/factory.mdc` plus `.github/agents/factory.agent.md`. `mergeInstructions` inserts the marked section from `templates/fragments/instructions.md` into `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`. `upgradeProject` calls those two functions and does not replace `decisions.md` or agent histories. `doctor` in `src/lib/govern.mjs` requires the Cursor rule, the Copilot agent, and the Cursor, Copilot, and Claude `factory-coordinator` skills.

Cline's current project root is `.cline/rules/`, `.cline/workflows/`, and `.cline/skills/`. A rule file with no `paths` frontmatter is always active. Workflow slash commands include the filename extension (`/factory-status.md`). Skill directories are also slash-invoked by directory name (`/factory-status` is not the workflow). Cline still reads the older `.clinerules/` tree, root `AGENTS.md`, and skills under `.claude/skills/` and `.agents/skills/`.

## Goals / Non-Goals

**Goals:**

- Add Cline to the same init, upgrade, and parity-test path the other IDE adapters already use.
- Keep factory-owned Cline files limited to `.cline/rules/factory.md`, `.cline/skills/<name>/`, and `.cline/workflows/factory-*.md`.
- Keep `.factory/work/` as the only execution queue.

**Non-Goals:**

- A Cline queue, runtime, hook, plugin, or `.cline/agents/` file.
- Global `~/.cline/` or `~/Documents/Cline/` files, and Cline's Rules and Workflows UI toggle store.
- A second copy under `.clinerules/`.
- Removing the Claude or `.agents/skills/` copies Cline may also discover.
- Changing `openspec init --tools cursor,github-copilot,claude`, CI, or Semgrep.
- Any change to queue, gate, evidence, lockout, or attempt behavior.

## Decisions

### Install only under `.cline/`

Write the rule, skills, and workflows under `.cline/` and do not create `.clinerules/`. Cline reads both trees, so a second copy would apply the rule twice. The older tree stays an untouched compatibility read, not an install target.

Alternative considered: write both trees so older Cline builds see the files. Rejected because current Cline reads `.cline/` and applying both copies doubles the rule.

### Workflows are the command adapter

Add `.cline/workflows/<command>.md` inside the existing command loop. The file body is the shared command template plus the `<!-- idefactory:owned -->` marker. Do not add Cursor's `description` frontmatter or Copilot's `agent: factory` frontmatter. Cline invokes that file as `/factory-<name>.md`. The skill directory remains the procedure and stays invocable as `/<skill-name>`.

Alternative considered: rely on skill slash commands and skip workflow files. Rejected because Cursor, Copilot, and Claude each get an explicit command file that points at the skill.

### Copy skills by adding one destination

Add `.cline/skills` to the existing skill destination list. Every directory under `templates/skills/` is copied as `.cline/skills/<name>/SKILL.md`, including `factory-coordinator`, `factory-openspec`, `factory-build`, `factory-run`, `factory-full`, `factory-governance`, `factory-tdd`, `factory-verify`, and `factory-debug`. Do not fork skill text for Cline. Cline's `name` field must keep matching the directory name, which the current templates already do.

### One short always-on rule

Add `templates/cline/rules/factory.md` and write it to `.cline/rules/factory.md` the same way the Cursor rule is written. No `paths` frontmatter, so Cline treats it as always active. The text matches the intent of `templates/cursor/rules/factory.mdc`: follow factory skills for factory plan, build, run, full, review, status, and OpenSpec apply requests; leave unrelated requests alone; do not change `.factory/` or adapters for unrelated work; the IDE session model does the work; the human authors OpenSpec proposals; end with the owned marker. Keep it as short as the Cursor rule.

Alternative considered: a `.cline/agents/` factory agent. Rejected. That directory is not part of the confirmed rules, skills, and workflows layout, and the other adapters do not need a new agent type to install commands.

### Doctor requires the same kind of files it already requires

Add `.cline/rules/factory.md` and `.cline/skills/factory-coordinator/SKILL.md` to the `REQUIRED` list. Do not require every workflow or every skill. That matches the current doctor set, which requires the Cursor rule and coordinator skill rather than every command file. A missing required path is reported as `missing <path>` and the command exits non-zero.

### Name the rule in the existing instruction section

Add one line to `templates/fragments/instructions.md` naming `.cline/rules/factory.md`. `mergeInstructions` already rewrites that marked section on init and upgrade. Do not add a new instruction-file target. Cline reads `AGENTS.md`, which is already merged. The deprecated Custom Instructions text box is not a target.

### Tests extend the current parity suite

In `test/install.test.mjs`, add `.cline/workflows/factory-<command>.md` to `adapterPaths`, include `.cline/skills` in the no-model-launcher scan, assert the nine skill directories and the narrow rule text, assert upgrade restores an edited factory-owned Cline skill while keeping `CUSTOM-DECISION-KEEP`, assert `.cline/rules/team-style.md` is byte-for-byte unchanged across init and upgrade, assert init does not create `.clinerules/`, and assert doctor names a removed Cline required path. No new test runner and no network.

### OpenSpec tool ids stay as they are

`--with-openspec` keeps `--tools cursor,github-copilot,claude`. This change does not add a Cline tool id to that command.

## Risks / Trade-offs

- [Cline lists the same skill from `.cline/skills/`, `.claude/skills/`, and `.agents/skills/`] → Leave the other copies in place. Document the duplicate as a known listing, not as a second install to remove.
- [A workflow toggled off in Cline's Rules and Workflows panel does not appear as a slash command] → Install writes the file and does not write UI toggle state. The file is the supported surface.
- [Writing `.cline/rules/` and `.clinerules/` would apply the rule twice] → Install `.cline/` only, and test that init does not create `.clinerules/`.
- [An always-on rule spends context] → Keep the Cline rule as short as `.cursor/rules/factory.mdc`.
- [Upgrade overwrites factory-owned Cline paths] → That is the same refresh Cursor already gets. Upgrade does not delete other files under `.cline/` and does not replace `decisions.md` or histories.

## Migration Plan

- Projects initialized after this change is applied receive the Cline files from `idefactory init`.
- Existing projects receive them from `idefactory upgrade`. Upgrade rewrites factory-owned adapter files. It does not replace `.factory/decisions.md` or agent histories.
- Upgrade overwrites `.cline/rules/factory.md`, `.cline/skills/factory-*`, and `.cline/workflows/factory-*.md`. It does not delete any other `.cline/` file.
- Rollback is reverting the install commit, or deleting only those factory-owned `.cline` paths. There is no data migration and no queue rewrite.
- Verify with `npx openspec validate add-cline-ide-adapter --strict`, `npx openspec validate --all`, and `node --test test/install.test.mjs`.

## Open Questions

None. The layout, the workflow filename convention, and the doctor file set are decided above.
