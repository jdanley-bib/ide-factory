# Proposal

## Why

OpenSpec already owns the proposal, delta specs, design, and tasks, but factory task identity is only the checkbox number. `sync-tasks` skips an id that already exists, so a renumber or a split can mint a second `.factory/work/` item, and nothing records the task text that was synced. A hand-checked box in `tasks.md` must not count as factory completion, and archiving a change or syncing accepted specs must not move attempt, evidence, or completion state. `@fission-ai/openspec` is still a caret range (`^1.14.3`) even though 1.14.3 is the version already installed. Jason Danley asked for this as the fifth stage 1 exit-test change, borrowed-patterns item 1, on 2026-10-27. He still approves the change before it is executable.

## What Changes

- Pin `@fission-ai/openspec` to the exact version already resolved in the lockfile, `1.14.3`.
- Define the locator that ties one change and one task to one work item, and record provenance for the task text that sync stored.
- Make sync idempotent: an unchanged `tasks.md` leaves work-item ids and statuses unchanged, and a harmless wording-preserving rewrite does not mint a second work item.
- **BREAKING** Fail closed when an edit splits, merges, or reorders tasks so that identity is ambiguous. `.factory/work/` stays unchanged and the command returns a reconciliation report. A sync that used to create a second item for that edit now exits with an error.
- A checkbox written by hand in OpenSpec does not satisfy factory completion. Only `complete` may mark a work item done.
- Archiving a change, or syncing accepted specs, preserves factory evidence and does not accept an attempt.
- Tests cover the idempotent case, the ambiguous case, and the archive case. The dependency set gains no Backlog.md, Squad, or Squad4Cursor package.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spec-to-backlog`: task identity survives ordinary edits to a human-authored change. Sync stays idempotent, records provenance, fails closed on an ambiguous remap, and does not treat a hand-checked box, an archive, or a spec sync as completion.

## Impact

- `syncTasks` in `src/lib/queue.mjs`, and the work-item JSON it writes under `.factory/work/items/`.
- `package.json` and the matching lockfile entry for `@fission-ai/openspec`, pinned to `1.14.3` without adding packages.
- New unit tests beside `test/queue.test.mjs`. Existing queue tests keep their current pass conditions.
- No new command that runs OpenSpec apply, and no second execution queue.

## Out of scope

- Borrowed-patterns items 2 through 11, including acceptance criteria and Definition of Done, the JSON read surface, MCP, archive and search UX, adapter breadth, team lifecycle, watch, plugins, export, and observability.
- OpenSpec apply as a second implementation runner.
- OpenSpec Stores as a remote plan authority.
- Vendoring or forking OpenSpec.
- Any path that executes a proposal, design, or task list without `sync-tasks`.
- Removing the existing `backlog.md` devDependency. This change does not add another one, and it does not add `@bradygaster/squad` or `@squad4cursor/*`.
- Zoho, Slack, a headless executor, a production identity provider, and merging.
