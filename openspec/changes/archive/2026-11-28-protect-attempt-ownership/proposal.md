# Proposal

## Why

Part of #54 and #51. `attempt start` replaces a work item's `attemptId` with no check that the item already has a live attempt. A second start (a retried command, a second agent, a skill re-entering after a context reset) silently orphans the first attempt together with its reds, verification records, and review evidence. The work item then points at an attempt that has none of the evidence, and the only recovery today is editing `.factory/work/` by hand, which the factory forbids and which an autonomous agent cannot do within the rules.

The factory should refuse to displace evidence-bearing work, should reuse an attempt that is still empty instead of creating a duplicate, and should give the agent one supported, recorded way to repair a pointer that is already wrong. This is what makes concurrent or resumed agents safe, which is a precondition for removing human supervision.

## What Changes

- `attempt start <change> <task>` refuses when the work item's current attempt is live and carries evidence. The refusal is a blocked-state report with invariant `attempt-active`, naming the attempt, its state, and a one-line evidence summary, and pointing to the attempt to continue. Nothing is written.
- When the current attempt is live but empty (no red, verification, method, review, or exception record), `attempt start` returns that attempt instead of creating another.
- A rejected attempt may still be replaced. Every pointer change, including that one, appends an entry to the work item's attempt history with the previous attempt id, the new attempt id, the reason class, and the time.
- New `idefactory attempt repoint <change> <task> --attempt <id>` previews a pointer repair and prints a plan digest. With `--apply --plan-digest <d> --decided-by <identity> --reason <text>` it applies the repair. It changes only the work item's pointer and history, never an attempt's evidence. Displacing an attempt that has evidence needs an identity different from that attempt's implementer.
- `run` and `status` report attempt files that belong to a work item but are neither current nor in its history, and name the repair command.
- The pointer change and repair emit control events with ids and codes only.

## Capabilities

### New Capabilities

- `attempt-ownership`: the active-attempt guard, reuse of an empty attempt, attempt history, orphan detection, and the pointer repair command.

### Modified Capabilities

- `cli-help`: help for `attempt repoint` and the changed `attempt start`.
- `writer-lease`: `attempt repoint` is a mutating command.
- `factory-event-log`: pointer events carry ids and codes only.

## Impact

- `src/lib/attempt.mjs` (start guard, history, repoint), `src/lib/work-items.mjs` (history field), `src/lib/orchestrate.mjs` and `src/lib/status.mjs` (orphan notice), `src/lib/blocked-states.mjs` (new `attempt-active` row), `src/lib/event-log.mjs` (allowlist adds `previousAttemptId`), `src/lib/command-help.mjs`, `src/lib/writer-lease.mjs`, and the `factory-build` skill and adapter copies.
- `test/attempt.test.mjs` and a new `test/attempt-ownership.test.mjs`.
- No new dependencies. The global usage text does not change.

Out of scope:

- Choosing between two attempts that both have evidence. The repair command moves a pointer only when a person or an independent agent decides which attempt is current; the factory does not merge evidence.
- Changing how attempts are accepted, rejected, or reopened.
- Per-task locking across machines. The writer lease still serializes one machine's mutating commands.
