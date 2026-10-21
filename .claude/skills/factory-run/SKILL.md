---
name: factory-run
description: >
  Bounded multi-task factory orchestration. Use when the user says /factory-run,
  run the factory until a gate, or asks the squad to carry an OpenSpec change
  through multiple work items. Human-started only. The IDE session model does the work.
---

# Factory run

Human-started bounded orchestration for one OpenSpec change.

<!-- idefactory:owned -->

## Loop

1. If `HALT` exists, stop.
2. Run:

```bash
idefactory run --change <name> --until human-gate
```

Optional: `--max-tasks N`.

3. Interpret the exit code:
   - `0` — stopped cleanly (all done, max-tasks, or human-gate). Summarize and stop.
   - `1` — error (lockout, blocked deps, rejection). Report and stop.
   - `2` — needs an agent step. Read the orchestration request JSON.

4. For exit `2`:
   - Spawn **one** IDE subagent for the request role (Cursor Task tool when available).
   - Prompt contains only that role's charter, history, the request, and named OpenSpec files.
   - Use `modelProfile` as a host hint when supported; never call a model HTTP API.
   - After the subagent returns, record evidence with `idefactory attempt transition`.
   - If the request action is `complete`, run `idefactory complete <change> <id> --attempt <id>`.

5. Repeat from step 2 until exit `0` or `1`.

## Stop conditions

Halt, lockout, rejected review, failed verification evidence, human-gate (release profile), max-tasks, or all work items done.

## Never

- Do not start this loop unattended or on a timer.
- Do not wrap `s4c watch` or any Ralph execute loop.
- Do not modify `.squad/` if present.
- Do not invent an OpenSpec product change.
