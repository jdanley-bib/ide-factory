---
name: factory-openspec
description: >
  Staff a human-authored OpenSpec change into .factory/work and the factory team.
  Use when the user says apply an OpenSpec change, /factory-plan, or asks the
  team to plan work that already has openspec/changes/<name>/.
  Do not invent a product.
---

# Factory OpenSpec

OpenSpec owns the proposal, design, delta specs, tasks, sync, and archive.
This skill only staffs a change the human already authored.

<!-- idefactory:owned -->

## Load the change

1. Use the change the human named, or `.factory/active-change.json` if it is set.
2. Read `openspec/changes/<name>/proposal.md`, `design.md`, `tasks.md`, and `specs/`.
3. Ignore `openspec/changes/archive/`. If the name is missing, stop. Do not create a change.
4. If the human wants a new product idea, stop and point them at the OpenSpec propose skill (`openspec-propose`, `/opsx-propose`, or `/opsx:propose`). That skill owns authoring.

## Check memory

The lead compares the design with `.factory/decisions.md`. If they conflict, stop and ask the human. Do not silently rewrite the proposal.

When the change is greenfield UI or app work and the design is silent on toolchain, have the architect (or lead) record a mainstream scaffold in design/tasks before build—for example Vite via `npm create vite@latest`—unless the human already chose another stack.

## Queue the work

Run:

```bash
idefactory sync-tasks <name>
```

`.factory/work/` is the only execution queue. OpenSpec `tasks.md` remains the human plan.

When the human changes the plan after a sync, run `idefactory sync-tasks <name>` again. Appended tasks, and checked tasks that never had an item, are handled automatically. When it reports a reconciliation error, run `idefactory sync-tasks <name> --plan` (add `--json` for one document). The plan lists every unmatched item and task, work in flight, classification drift, dependents, overlapping changes, and a digest. Then record explicit decisions in a JSON file keyed by stored item id and run `idefactory sync-tasks <name> --apply --decisions-file <path> --plan-digest <digest> --decided-by <id>`. The decisions are `keep`, `renumber`, `defer`, `resume`, `drop`, `split`, `merge`, `move`, `adopt-classification`, and `keep-classification`. Do not create a separate change as a workaround, and do not guess which old task became which new task. Deferred and dropped items keep their attempts and evidence and are never selected.

## Build

For each synced work item, follow `factory-build` one item at a time, or use `factory-run` for a bounded multi-item loop when the human asks.

Finalize with `idefactory complete` after review accepts. That checks the OpenSpec checkbox.

When every box is checked, tell the human to archive and sync with OpenSpec. Do not archive from this skill.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create` or `gh pr edit`.

When the human asks to archive, run `isDeliverableChange` first. If it is false, stop and do not move `openspec/changes/<change>/`. Spec sync stays human-gated and does not itself require the pull-request record.

The IDE session model does the work.

## Routine steps and external effects

When the human asks you to run, or to run the full pipeline, for a change, that request covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records they involve. Do not ask again before each of them. The cover ends when the run stops and does not extend to another change.

These still wait for a separate human request: `approve` (the human's own record; never run it for yourself), `ci scaffold`, archive, and spec sync. Pass `--new-run` only after a budget stop or `retry-cap`, and only while the change is under `run.maxNewRuns`.

The cover does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review.

Before any action with an external effect (publish, deploy, spend, creating an account), run `idefactory authorize` and proceed only when it reports `authorized: true`. When it reports `authorized: false`, stop and report the reason and the `approve` command. When it reports `authorized: true`, do not ask the human whether to proceed.
