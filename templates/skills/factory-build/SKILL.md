---
name: factory-build
description: >
  Implement one factory work item test-first and hand it to a different role
  for review. Use when the user says /factory-build, implement the next task,
  or asks the engineer to build an OpenSpec task. The IDE session model does the work.
---

# Factory build

Implement exactly one work item.

<!-- idefactory:owned -->

## Command help

Run `idefactory help <command>` for a command's usage, flags, and examples. `idefactory help attempt transition` lists the attempt states, the allowed transitions, the evidence keys, and what each state needs. Add `--json` for structured output. Do not read the CLI source to learn usage.

## Scope

1. Run `idefactory next` or use the work item the human named.
2. Start or resume an attempt: `idefactory attempt start <change> <id>` when needed. A second start returns the live attempt unchanged when it has no evidence. When the live attempt already has reds, verification, a method, an exception, or a review, the start is refused with `attempt-active`: continue that attempt with `idefactory next --change <change>`, and do not start another. If the work item points at the wrong attempt, `idefactory attempt repoint <change> <id> --attempt <attemptId>` prints a preview with a plan digest. Apply it only with `--apply --plan-digest <digest> --decided-by <id> --reason "text"`, using an identity other than the implementer of the attempt it displaces. Repoint never edits an attempt's evidence.
3. Read only the implementing role's charter and history. The packet names the path. Do not read other charters.
4. Read the OpenSpec proposal, design, and the delta spec that covers the task.
5. If `HALT` exists, stop.

## Method

**Prefer common tools.** If the work creates or scaffolds an app, use the ecosystem standard generator before inventing files by hand. Examples: `npm create vite@latest` for a Vite/React SPA, framework CLIs, official templates. Only hand-roll a toolchain when the OpenSpec design requires it.

Write a failing test before production code when the task class is `code` and the resolved requirement set includes a test check (`unit`, `integration`, `playwright`, `contract`, or `unit-*`). The set is the item's own checks and its verification profile's checks together; run `idefactory requirements <change> <task>` to print it, with each check's source, the kinds that need red, and any problem that would stop the attempt from starting. Record it with `idefactory verify run <attemptId> --check <kind> --red`, then implement until green and record the passing run with `idefactory verify run <attemptId> --check <kind>`. A `lightweight` item does not require a failing test. `red-first` is the default method. When a failing test cannot specify the change, record a `no-red` method before editing, with `idefactory method propose <attemptId> --choice no-red --reason <class> --rationale "text" --implementer <id> --kind <kind>`, where the class is `docs-or-text`, `configuration`, `behavior-preserving` (cite an existing tracked test with `--test-path`), `mechanical`, or `exploratory`. A different role must accept it with `idefactory method review`. An explicit `factory.taskType` in `tasks.md` is a human decision and is not overridden, and a method is not a red that ran or a red exception.

Do not put a verification result on an attempt transition. Stop when the command names `vacuous-red` or `infrastructure-failure`.

If a skill named `test-driven-development` is installed, follow that skill for the test cycle. Otherwise follow `factory-tdd`.

Where the packet's `Required checks` and `Red required for` lines list kinds (they come from the one resolved set, so a profile-added kind appears there), record a failing red for each, or use a red exception as described below, then implement until green. Read the packet's Prior rejections section and address every note before asking for review again.

Run verification profile checks before claiming done. Follow `factory-verify`. Run `idefactory verify status <attemptId>` first: a `valid` check is reused and is not re-run.

If the command fails, follow `systematic-debugging` when that skill is installed, otherwise `factory-debug`.

## Red exceptions

When a replacement attempt starts with no red and `idefactory verify run <attemptId> --check <kind> --red` stops with `vacuous-red` because the implementation already passes, do not fake a red. Ask the human first, then use one of these:

- `idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind> --note "reason" --approver <human>` reuses the genuine red of a rejected earlier attempt for the same task. Run it on a clean HEAD after a passing `verify run` on that HEAD.
- `idefactory red waive <targetAttemptId> --kind <kind> --note "reason" --approver <human>` waives the red. Waiving a red before the system is stuck is discouraged. The command refuses until the attempt has hit `vacuous-red` for that kind. Warn the human, recommend reuse or waiting until the system is stuck, and pass `--acknowledge-not-stuck` only after the human acknowledges the warning and chooses to proceed.

Neither command claims a red ran. The record names the approver and reason, and the reviewer sees it. Clean-revision verification, independent review, and lockouts still apply.

If completion finds a required red missing on an `accepted` attempt (for example a profile added a check after acceptance), run `idefactory attempt reopen <attemptId> --kind <kind> --for method|exception --by <id> --reason "text"` with an identity other than the implementer. It moves the attempt back to `awaiting-review` for the named kinds, at most twice and never once finalization has started. The earlier verdict moves to the review history and does not count, and every stored red, verification, and exception record is unchanged. While the attempt is reopened, `red reuse`, `red waive`, and `method propose` accept only those kinds. A reviewer must then accept it again. Reopen is not a substitute for review, a fabricated failing test, or any other gate.

A red recorded after the implementation was written is not test-first evidence, and the CLI cannot detect it. Warn the human. A human can invalidate it with `idefactory red waive <targetAttemptId> --kind <kind> --note "reason" --approver <human> --invalid-red "reason it was recorded after implementation" --acknowledge-not-stuck`. The command refuses unless a failing CLI red is stored for that kind, and the invalidated red then does not satisfy red. A waiver does not replace passing verification, independent review, or lockouts. Reds are append-only: every `--red` for a kind is kept, the latest is the current red, and `idefactory red list <attemptId> [--json]` prints all of them with their digests. After an invalid-red waiver, one later failing `--red` is allowed for that kind and satisfies red when it starts after the waiver. It does not prove the test came first, so the reviewer judges that from the recorded evidence. A kind is invalidated at most once, and reuse and ordinary waivers still refuse `--red`.

## Review

Review is a different role: the reviewer. The implementer does not approve their own work.

Spawn a reviewer subagent with only the reviewer charter. The reviewer accepts only when the recorded evidence satisfies the work item: every required verification check is `valid` in `idefactory verify status <attemptId>` (a passing CLI record that still holds at the current clean HEAD, where only factory run-state has changed since), and, for a `code` item whose checks include a test kind, each such kind in the resolved set has a recorded failing red, a recorded `no-red` method that covers it,  or a valid red exception that a human authorized. When the attempt has a `no-red` method, the reviewer records `idefactory method review <attemptId> --verdict ACCEPT|REJECT --reviewer <id> --note "text"`, and rejects a method whose reason class does not fit the diff, because the attempt cannot be accepted without an `ACCEPT`. A red exception is not a red that ran, and the reviewer does not ask for a new failing test where one is recorded. The reviewer relies on `valid` checks and asks for `idefactory verify run` only for a check that is `stale`, `missing`, `failed`, or `untrusted`, or whose reason says `re-run verify`. Reliance does not replace review: still review the change independently, and run a focused check yourself when the change warrants it. A `lightweight` item, and a `code` item with no test check, need no failing test. Rejection uses `idefactory lockout`.

Transition the attempt to accepted or rejected with distinct implementerId and reviewerId.

Record transition evidence with `--evidence-file <path>`: write the JSON object to a file in the operating system temporary directory, not inside the project, run `idefactory attempt transition <attemptId> <state> --evidence-file <path>`, and remove that file after the command whether it succeeds or fails. An untracked file inside the project makes the worktree dirty and blocks verification and completion. `--evidence-file` takes only a path. `--evidence` takes inline JSON, which Windows PowerShell 5.1 can mangle. Give only one of the two.

## Finish

```bash
idefactory complete <change> <id> --attempt <attemptId>
```

Do not hand-edit backlog status. `complete` marks the work item done and checks the OpenSpec checkbox when gates pass.

Ask the scribe only if complete cannot update histories. Do not truncate older notes.

The IDE session model does the work. Do not publish, deploy, or spend.

Before any step that publishes, deploys, spends, or opens an account, run `idefactory authorize --change <name> --action <action> --target <name>`. Continue when it reports `authorized: true`. Stop and report the `reason` and the `approve` command it prints when it reports false.

## Blocked states

`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` accept `--json`. When one stops without finishing its step it prints a blocked-state report: `invariant` (a `code` and a message), `actor` (`human`, `independent-agent`, `implementing-agent`, or `tooling`), `recovery.options` (each with `supported`, a `command` when supported, `actor`, `requires`, and `resolves`), and `retry` (`safe`, `only-after-change`, or `never`). Exit codes do not change. Branch on the report:

- When an option with `resolves: true` is `supported` and its actor is an agent role, take it.
- When the actor is `human`, ask only when the option needs authority, and quote the report. Do not ask for a decision listed under Standing decisions in the packet or request.
- When `retry` is `never`, stop and do not retry. When it is `only-after-change`, retry only after something recorded has changed. When it is `safe`, retry the same command.
- When `recovery.supported` is false, say that no supported recovery exists, name the human as the actor, and stop.

Standing decisions in a packet are approvals, standing authorizations, red exceptions, methods, and reconciliation decisions still valid for the item. Listing one grants no authority.
