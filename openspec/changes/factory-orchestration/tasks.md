# Tasks: Factory Orchestration

## 1. Governance baseline

- [x] 1.1 Retire GOLDEN_RULES.md shipping: update init, templates, skills, charters, fragments, protectedPaths, and tests so init does not create GOLDEN_RULES.md and agents read `.factory/governance.md` instead. Verify with install tests.

- [x] 1.2 Rewrite `templates/factory/governance.md` with the lean operational baseline and refresh openspec config context that still says Backlog.md is the only queue. Verify grep/tests no longer require GOLDEN_RULES content on init.

## 2. Native work queue

- [x] 2.1 Implement `.factory/work/` store (`src/lib/work.mjs`) with list/get/upsert/ready selection and dependency checks. Verify with unit tests without backlog CLI.

- [x] 2.2 Rewire `sync-tasks` and `next` to use the work store; remove required backlog shell-outs from status/doctor happy path; deprecate `--with-backlog`. Verify sync without `backlog/` and doctor ok.

## 3. Classification

- [x] 3.1 Parse optional `factory:` YAML under OpenSpec checkboxes; infer defaults; store AC and deps on work items. Verify metadata and dependency ordering tests.

- [x] 3.2 Add `templates/factory/profiles.json` and install it on init. Verify profile files exist after init.

## 4. Attempts and complete

- [x] 4.1 Implement attempt lifecycle module and CLI (`attempt start|transition|show`) with ledger events. Verify illegal transitions fail.

- [x] 4.2 Implement `idefactory complete` with reviewer/checks/HALT/lockout gates and OpenSpec checkbox update. Verify same-agent and failed-check refusals.

## 5. Roster and adapters

- [x] 5.1 Add test-engineer and security-reviewer roles, charters, team/routing updates, and classification pipelines. Verify seven roles on init.

- [x] 5.2 Add modelProfiles to config, orchestration request fields on next/run, factory-run skill/commands for Cursor/Copilot/Claude. Verify adapters install and never reference Ollama.

## 6. Bounded run

- [x] 6.1 Implement `idefactory run --change --until human-gate [--max-tasks]` with exit code 2 for needs-agent. Verify halt/max-tasks/dependency stops.

- [x] 6.2 Update README, ceremonies, package context, and orchestration-level tests; remove backlog.md as a required dependency from docs. Verify `npm test` passes without needing backlog for new paths.
