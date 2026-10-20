---
name: factory-openspec
description: >
  Staff a human-authored OpenSpec change into Backlog.md and the factory team.
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

## Queue the work

Run:

```bash
idefactory sync-tasks <name>
```

Backlog.md is the only execution queue. Do not write a second task list under `.factory/`.

## Build

For each synced task, follow `factory-build` one task at a time unless the tasks are independent and a design already exists.

When a backlog task is Done, check the matching box in that change's `tasks.md`.

When every box is checked, tell the human to archive and sync with OpenSpec. Do not archive from this skill.

The IDE session model does the work. Never call Ollama. Never call a model HTTP API. Never invent a product from the web.
