# Tasks

## 1. OpenSpec task identity

- [x] 1.1 Add a failing test in `test/openspec-pin.test.mjs` that reads `package.json` and asserts `@fission-ai/openspec` is exactly `1.14.3` with no range, and that devDependency names do not include `@bradygaster/squad` or any name starting with `@squad4cursor/`. Verify it fails with `node --test test/openspec-pin.test.mjs` while the manifest still says `^1.14.3`. Then set that root dependency and the matching lockfile declaration to `1.14.3`, leave the resolved tarball at `1.14.3`, and do not fetch packages. Verify the same test passes.
  - The manifest pins the installed OpenSpec version and does not gain a Squad or Squad4Cursor package.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.2 Add failing tests in `test/task-identity.test.mjs` on a temporary project. After the first sync, the new work item stores a sha256 provenance digest of its normalized title. A second sync of the same `tasks.md` leaves work-item ids and statuses unchanged. A whitespace-only rewrite of that title does not create a second item. Renumbering that one task to a new checkbox id leaves exactly one work item, at the new id, with the same status; an attempt started before the renumber stays unaccepted and its task id follows the new checkbox id. Replacing one synced task with two, and replacing two synced tasks with one, each make `sync-tasks` exit non-zero, leave `.factory/work/` unchanged, and print a reconciliation report. Checking a synced box by hand and syncing again leaves the work item status not done and the attempt state not accepted. Moving the change directory under `openspec/changes/archive/` and writing main spec text leaves attempt state, evidence, and work-item status unchanged and does not accept the attempt. Verify the file fails with `node --test test/task-identity.test.mjs` before the matcher change, then implement the match rules in `src/lib/queue.mjs` from design.md. Verify that file passes and `node --test test/queue.test.mjs` still passes.
  - Sync keeps one work item for an unchanged or wording-preserving task, fails closed on an ambiguous remap, and does not treat a hand-checked box, an archive, or a spec write as completion.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

## Workflow follow-up

- Jason approves this change before it is executable. Do not sync tasks until then.
- Do not start borrowed-patterns items 2 through 11 from this change.
- Archive only after implementation and review, in a later request.
