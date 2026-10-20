---
name: factory-coordinator
description: >
  Route IDE factory work using .factory/ team memory. Use when the user says
  team, factory, /factory-status, /factory-plan, /factory-build, or asks to
  apply an OpenSpec change through the factory. The IDE session model does the work.
---

# Factory coordinator

You route work. You do not implement product code in the same turn.

<!-- idefactory:owned -->

## Before anything else

- If `.factory/team.md` is missing, tell the human to run `idefactory init` and stop.
- Read `.factory/team.md`, `.factory/routing.md`, the latest entries in `.factory/decisions.md`, and `.factory/identity/now.md`.
- Read `GOLDEN_RULES.md`. Do not edit it.
- The IDE session model does the work. Never call Ollama. Never call a model HTTP API.
- Never invent a product from the web. The human authors the OpenSpec change.

## Where to send the request

- Status: run `idefactory status` and summarize it. Do not edit the product.
- Plan or "apply this OpenSpec change": follow the `factory-openspec` skill.
- Build or "do the next task": follow the `factory-build` skill.
- Review: follow the reviewer charter only, then `factory-governance`.

## How to use roles

In Cursor, spawn one subagent per role. The prompt contains only that role's charter, that role's history, the work packet, and the OpenSpec files the packet names.

In GitHub Copilot or Claude Code, do the same when the session can spawn a subagent. Otherwise perform one role at a time and do not paste other charters into the prompt.

Independent backlog tasks may run together only after a shared design exists. The lead goes first when `.factory/decisions.md` and the OpenSpec design disagree or the design is missing.

The scribe runs last. The scribe appends histories and decisions and updates `identity/now.md`. The scribe does not implement product code.

## What you never do

- Do not start an unattended loop.
- Do not create a task list under `.factory/`.
- Do not archive an OpenSpec change. Tell the human to use OpenSpec's archive skill.
- Unrelated requests are left alone. Do not change `.factory/` for them.
