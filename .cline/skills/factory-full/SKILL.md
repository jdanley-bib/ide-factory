---
name: factory-full
description: >
  One-stop factory pipeline from idea to built OpenSpec change. Use when the user
  says /factory-full, run the full factory, or wants explore through plan and run
  in one flow. Human-started only. The IDE session model does the work.
---

# Factory full

Human-started end-to-end pipeline: explore → propose (if needed) → plan → run.

<!-- idefactory:owned -->

## Preconditions

1. If `.factory/team.md` is missing, tell the human to run `idefactory init` and stop.
2. If `HALT` exists, stop.
3. Read `.factory/governance.md`, `.factory/team.md`, and the latest `.factory/decisions.md` entries.
4. The human's request is the product intent.

## Phase 1 — Explore

Follow the `openspec-explore` skill as a thinking partner long enough to lock scope.

- If the human's request is already clear (outcome, constraints, stack hints), keep explore short: restate the scope in a few bullets and move on.
- Prefer mainstream scaffolds when the design is silent (for example Vite via `npm create vite@latest` for a SPA).
- Do not implement product code in this phase.
- Do not browse the web to invent product ideas.

## Phase 2 — OpenSpec change

- If an OpenSpec change already exists for this work (human named it, or `.factory/active-change.json` points at a fitting change), use that name.
- Otherwise follow `openspec-propose` (or `/opsx-propose`) to create `openspec/changes/<name>/` with proposal, design, specs, and tasks from the explored scope.
- A `/factory-full` request that already states what to build is confirmation to capture that scope as a change. Still name the change and artifacts before writing; do not expand beyond the stated ask without asking.
- Prefer recording the scaffold/toolchain in design and tasks when greenfield.

Stop if propose cannot complete. Do not skip ahead to implementation without a change.

## Phase 3 — Plan

Follow the `factory-openspec` skill / `/factory-plan` path:

```bash
idefactory sync-tasks <name>
```

Confirm work items exist under `.factory/work/`. Resolve design vs `.factory/decisions.md` conflicts with the human before continuing.

## Phase 4 — Run

Follow the `factory-run` skill for that change:

```bash
idefactory run --change <name> --until human-gate
```

Loop on exit code `2` (spawn one role subagent per orchestration request, record evidence, `idefactory complete` when asked) until exit `0` or `1`.

## Phase 5 — Wrap up

1. Summarize: change name, work items done/blocked, stop reason, and any human gates left (approve/publish).
2. Tell the human to archive/sync with OpenSpec when all checkboxes are done. Do not archive from this skill.
3. Do not start another unattended loop.

## Skip rules

| Situation | Behavior |
| --- | --- |
| Change already exists and tasks are synced | Skip explore/propose; optional brief status, then run |
| Change exists but work queue empty | Skip propose; plan then run |
| Human names only a change | Plan then run |
| Human asks only to explore | Do not enter this skill; use openspec-explore alone |

## Never

- Do not start this pipeline unattended or on a timer.
- Do not wrap `s4c watch` or any Ralph execute loop.
- Do not modify `.squad/` if present.
- Do not invent OpenSpec product scope beyond the human's ask.
