---
name: factory-build
description: >
  Implement one factory backlog task test-first and hand it to a different role
  for review. Use when the user says /factory-build, implement the next task,
  or asks the engineer to build an OpenSpec task. The IDE session model does the work.
---

# Factory build

Implement exactly one backlog task.

<!-- idefactory:owned -->

## Scope

1. Run `idefactory next` or use the task the human named.
2. Read only the implementing role's charter and history. The packet names the path. Do not read other charters.
3. Read the OpenSpec proposal, design, and the delta spec that covers the task.
4. If `HALT` exists, stop.

## Method

Write a failing test before production code.

If a skill named `test-driven-development` is installed, follow that skill for the test cycle. Otherwise follow `factory-tdd`.

Run a verification command before claiming done. A skipped check is not a pass.

If a skill named `verification-before-completion` is installed, follow it. Otherwise follow `factory-verify`.

If the command fails, follow `systematic-debugging` when that skill is installed, otherwise `factory-debug`.

## Review

Review is a different role: the reviewer. The implementer does not approve their own work.

The reviewer reads only the reviewer charter. Acceptance requires the failing test and the verification command. Rejection uses `idefactory lockout`.

## Finish

- Update the backlog task through the `backlog` CLI. Set Done only after tests passed and the reviewer accepted.
- Check the OpenSpec checkbox whose id matches `openspec-task:` in the task description.
- Ask the scribe to append history. Do not truncate older notes.

The IDE session model does the work. Never call Ollama. Never call a model HTTP API. Never invent a product from the web. Do not publish, deploy, or spend.
