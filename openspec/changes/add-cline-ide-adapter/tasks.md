# Tasks

## 1. Cline adapter files

- [x] 1.1 Add a failing test that init writes `.cline/rules/factory.md` stating that unrelated requests are left alone, copies `factory-coordinator`, `factory-openspec`, `factory-build`, `factory-run`, `factory-full`, `factory-governance`, `factory-tdd`, `factory-verify`, and `factory-debug` into `.cline/skills/<name>/SKILL.md`, writes `.cline/workflows/factory-status.md`, `factory-plan.md`, `factory-build.md`, `factory-run.md`, `factory-full.md`, and `factory-review.md` directing the same skills as the matching Cursor commands, and does not create `.cline/work/` or `.clinerules/`. Add `templates/cline/rules/factory.md` and the `writeAdapters` writes for that rule, `.cline/skills`, and those workflows. Verify with `node --test test/install.test.mjs`.
- [x] 1.2 Add a failing test that init leaves an existing application file and `.cline/rules/team-style.md` byte-for-byte unchanged, and that upgrade restores an edited `.cline/skills/factory-coordinator/SKILL.md` while keeping a custom `.factory/decisions.md` entry and the same team-style file. Confirm the existing upgrade overwrite covers those factory-owned Cline paths and does not delete other `.cline/` files. Verify with `node --test test/install.test.mjs`.
- [x] 1.3 Add a failing test that `.cline/skills/factory-coordinator/SKILL.md` states that the IDE session model does the work and that installed Cline skills and workflow files contain no instruction for the factory CLI to launch a model. Extend the existing no-model scan to those paths. Verify with `node --test test/install.test.mjs`.
- [x] 1.4 Add a failing test that the marked factory section merged into `AGENTS.md` names `.cline/rules/factory.md`. Add that line to `templates/fragments/instructions.md`. Verify with `node --test test/install.test.mjs`.

## 2. Doctor

- [x] 2.1 Add a failing test that `idefactory doctor` exits zero after init, and exits non-zero and reports `missing .cline/rules/factory.md` or `missing .cline/skills/factory-coordinator/SKILL.md` when that file is removed. Add those two paths to the doctor required list in `src/lib/govern.mjs`. Verify with `node --test test/install.test.mjs`.

## 3. Integration

- [ ] 3.1 Run `npx openspec validate add-cline-ide-adapter --strict`, `npx openspec validate --all`, and `node --test test/install.test.mjs`. Confirm the diff adds no second queue and does not change gate, evidence, or lockout behavior. Record the commands and results in this change's implementation notes. Do not launch a model and do not archive.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request.
- Archive only after implementation is accepted and the human asks to archive.
