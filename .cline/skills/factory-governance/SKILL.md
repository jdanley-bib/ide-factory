---
name: factory-governance
description: >
  Enforce factory approvals, halt, and reviewer lockout. Use when work needs
  spend, publishing, deployment, a human decision, or a rejected review.
---

# Factory governance

<!-- idefactory:owned -->

## Command help

Run `idefactory help <command>` for a command's usage, flags, and examples. `idefactory help approve` and `idefactory help lockout` list what those commands take. Add `--json` for structured output. Do not read the CLI source to learn usage.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create` or `gh pr edit`.

`sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks for that action.

## Protected actions

The approvable actions are `accept`, `complete`, `publish`, `deploy`, `spend`, and `account`. `accept` and `complete` are gates bound to a task and revision. `publish`, `deploy`, `spend`, and `account` are external effects bound to a change and a target.

Before any step with an external effect, run:

```bash
idefactory authorize --change <name> --action <publish|deploy|spend|account> --target <name>
```

It is read-only and exits zero either way. Continue when it reports `authorized: true`, and do not ask the human whether to proceed. Stop when it reports `authorized: false`. Report the `reason` (`no-approval`, `expired`, `revoked`, `revision-mismatch`, `dirty-worktree`, `same-approver`, `policy-mismatch`, `principal-required`, or `target-mismatch`) and the `approve` command it prints, and ask the human to run it:

```bash
idefactory approve <id> --note "what they are allowing" --change <name> --action deploy --target <name> ...
idefactory revoke <id> --note "why it ended"
```

A human can grant one standing authorization for an action and target with `--standing` (policy version 2) instead of approving each step. A profile `humanGate` of false never waives an external effect.

A rejection is:

```bash
idefactory reject <id> --note "why"
```

Do not run `approve`, `revoke`, or `reject` yourself in order to approve your own request.

## Blocked states

`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` accept `--json`. When one stops without finishing its step it prints a blocked-state report: `invariant` (a `code` and a message), `actor` (`human`, `independent-agent`, `implementing-agent`, or `tooling`), `recovery.options` (each with `supported`, a `command` when supported, `actor`, `requires`, and `resolves`), and `retry` (`safe`, `only-after-change`, or `never`). Exit codes do not change. Branch on the report:

- When an option with `resolves: true` is `supported` and its actor is an agent role, take it.
- When the actor is `human`, ask only when the option needs authority, and quote the report. Do not ask for a decision listed under Standing decisions in the packet or request.
- When `retry` is `never`, stop and do not retry. When it is `only-after-change`, retry only after something recorded has changed. When it is `safe`, retry the same command.
- When `recovery.supported` is false, say that no supported recovery exists, name the human as the actor, and stop.

Standing decisions in a packet are approvals, standing authorizations, red exceptions, methods, and reconciliation decisions still valid for the item. Listing one grants no authority.

## Files you do not rewrite

- Earlier entries in `.factory/decisions.md`
- Agent histories, except to append a new note
- `.factory/governance.md` baseline intent (append decisions instead)

## Lockout

When the reviewer rejects an implementation, run:

```bash
idefactory lockout create --agent <implementer-id> --reviewer reviewer --reason "what failed"
```

`--agent`, `--reviewer`, and `--resolver` take identities of 1 to 128 characters from letters, digits, `.`, `_`, `@`, `:`, `+`, and `-`, starting with a letter or digit; `--reviewer` is required. `idefactory lockout --agent ...` remains a create alias. Creation prints a lockout id and writes immutable event data; it does not delete product files.

Resolve an active lockout (or a legacy `*lockout*.md` basename) with a distinct resolver:

```bash
idefactory lockout resolve <id> --resolver <id> --reason "what changed"
```

The lead assigns a later attempt; the same session does not quietly continue as if the review passed.

## Reopen an accepted attempt

When a required red is missing on an `accepted` attempt, `idefactory attempt reopen <attemptId> --kind <kind> --for method|exception --by <id> --reason "text"` returns it to `awaiting-review` for those kinds. The identity must differ from the implementer, and under governance policy version 2 it must be a verified principal. It is allowed twice at most and never after finalization starts. The earlier verdict stays in the review history and does not count, so a reviewer, who is not locked out, must accept again. Reopen does not waive passing verification, review, lockouts, or human gates.

## Halt

If `HALT` exists at the project root, stop. The human clears it with `idefactory resume`.

The IDE session model does the work.
