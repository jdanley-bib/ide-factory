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

## Command help

Run `idefactory help <command>` for a command's usage, flags, and examples. `idefactory help run` lists the run flags, and `idefactory help attempt transition` lists the attempt states and evidence keys. Add `--json` for structured output. Do not read the CLI source to learn usage.

## Loop

1. If `HALT` exists, stop.
2. Run:

```bash
idefactory run --change <name> --until human-gate
```

Each iteration resumes the persisted run session for the change. Do not reset budgets from this loop.

`run` stops with `blocked` before it starts an attempt when the item's requirement set has a problem: an undefined profile, a required check kind with no registry argv, an unsatisfiable human gate, or a missing dependency. The stop text names the file that fixes it; `idefactory requirements <change> <task>` prints the same set.

Optional: `--max-tasks N`, `--max-agent-steps N`, and other run flags the human configured.

3. Interpret the exit code:
   - `0` — stopped cleanly (all done, human-gate, or a persisted stop such as `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `unchanged-state`, `vacuous-red`, `infrastructure-failure`, `baseline`, or `retry-cap`). Summarize and stop. Do not continue after `vacuous-red` or `retry-cap`.
   - `1` — error (lockout, blocked deps, rejection, invalid session or budget). Report and stop.
   - `2` — needs an agent step. Read the orchestration request JSON.

4. For exit `2`:
   - Spawn **one** IDE subagent for the request role (Cursor Task tool when available).
   - Prompt contains only that role's charter, history, the request, and named OpenSpec files.
   - Use `modelProfile` as a host hint when supported; never call a model HTTP API.
   - After the subagent returns, record evidence with `idefactory attempt transition`.
   - Record transition evidence with `--evidence-file <path>`: write the JSON object to a file in the operating system temporary directory, not inside the project, run `idefactory attempt transition <attemptId> <state> --evidence-file <path>`, and remove that file after the command whether it succeeds or fails. An untracked file inside the project makes the worktree dirty and blocks verification and completion. `--evidence-file` takes only a path. `--evidence` takes inline JSON, which Windows PowerShell 5.1 can mangle. Give only one of the two.
   - If the request action is `complete`, run `idefactory complete <change> <id> --attempt <id>`.

5. Repeat from step 2 until exit `0` or `1`. A `quick` route still requires the reviewer. It does not skip review or complete.

## Stop conditions

Persisted budget and state stops: `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `unchanged-state`, `vacuous-red`, `infrastructure-failure`, `baseline`, and `retry-cap`. `infrastructure-failure` and `baseline` can be retried by the next human-started run. `vacuous-red` and `retry-cap` wait until the human passes `--new-run`. Other clean stops include all work items done or human-gate (true profile `humanGate`). Hard stops include halt, lockout, rejected review, failed verification evidence, and invalid session or budget errors.

## Blocked states

`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` accept `--json`. When one stops without finishing its step it prints a blocked-state report: `invariant` (a `code` and a message), `actor` (`human`, `independent-agent`, `implementing-agent`, or `tooling`), `recovery.options` (each with `supported`, a `command` when supported, `actor`, `requires`, and `resolves`), and `retry` (`safe`, `only-after-change`, or `never`). Exit codes do not change. Branch on the report:

- When an option with `resolves: true` is `supported` and its actor is an agent role, take it.
- When the actor is `human`, ask only when the option needs authority, and quote the report. Do not ask for a decision listed under Standing decisions in the packet or request.
- When `retry` is `never`, stop and do not retry. When it is `only-after-change`, retry only after something recorded has changed. When it is `safe`, retry the same command.
- When `recovery.supported` is false, say that no supported recovery exists, name the human as the actor, and stop.

Standing decisions in a packet are approvals, standing authorizations, red exceptions, methods, and reconciliation decisions still valid for the item. Listing one grants no authority.

`idefactory autonomy report [--change <name>] [--since <iso>] [--json]` is read-only. It reads the control event log and counts each stop that needed a human as one intervention: `policy-decision` (an intentional human decision), `failure` (no supported recovery), or `redundant` (an agent could have resolved it). Stops handled without a human and autonomous recoveries are listed separately. It does not see prompts typed into an IDE chat.

## External effects

Before a step that publishes, deploys, spends, or opens an account, run `idefactory authorize --change <name> --action <publish|deploy|spend|account> --target <name>`. Continue when it reports `authorized: true`. Stop and report its `reason` and the `approve` command it prints when it reports false.

## New session (human only)

After a sticky budget stop, `vacuous-red`, or `retry-cap`, the closed session stays in force until the **human** explicitly opens a new run, for example:

```bash
idefactory run --change <name> --new-run
```

Only the human may add that flag after `vacuous-red`, `retry-cap`, or another sticky stop; the factory-run loop never passes it.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create` or `gh pr edit`.

`sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks for that action.

Held items (deferred or dropped by a reconciliation) are never selected by `run`. When `run` reports no ready work and names a held item, run `idefactory sync-tasks <change> --plan` instead of editing the queue by hand.

## Never

- Do not start this loop unattended or on a timer.
- Do not wrap `s4c watch` or any Ralph execute loop.
- Do not modify `.squad/` if present.
- Do not invent an OpenSpec product change.
