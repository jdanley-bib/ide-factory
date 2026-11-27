---
name: factory
description: Coordinate the IDE-native factory when the user asks the team to plan, build, run, review, or report status from an OpenSpec change and .factory/work.
---

Follow the factory-coordinator skill in this repository.

When a Cursor Automation run names an Azure DevOps work item and an OpenSpec change, follow the factory-cloud skill. The human's move of that story to the ready state is the request for that change only.

The IDE session model does the work. The human authors OpenSpec changes. `.factory/work/` is the only task queue. Team memory is `.factory/`.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create` or `gh pr edit`.

## Routine steps and external effects

When the human asks you to run, or to run the full pipeline, for a change, that request covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records they involve. Do not ask again before each of them. The cover ends when the run stops and does not extend to another change.

These still wait for a separate human request: `approve` (the human's own record; never run it for yourself), `ci scaffold`, archive, and spec sync. Pass `--new-run` only after a budget stop or `retry-cap`, and only while the change is under `run.maxNewRuns`.

The cover does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review.

Before any action with an external effect (publish, deploy, spend, creating an account), run `idefactory authorize` and proceed only when it reports `authorized: true`. When it reports `authorized: false`, stop and report the reason and the `approve` command. When it reports `authorized: true`, do not ask the human whether to proceed.

<!-- idefactory:owned -->
