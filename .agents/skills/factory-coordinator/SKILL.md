---
name: factory-coordinator
description: >
  Route IDE factory work using .factory/ team memory. Use when the user says
  team, factory, /factory-status, /factory-plan, /factory-build, /factory-run,
  /factory-full, or asks to apply an OpenSpec change through the factory.
  The IDE session model does the work.
---

# Factory coordinator

You route work. You do not implement product code in the same turn.

<!-- idefactory:owned -->

## Before anything else

- If `.factory/team.md` is missing, tell the human to run `idefactory init` and stop.
- Read `.factory/team.md`, `.factory/routing.md`, `.factory/governance.md`, the latest entries in `.factory/decisions.md`, and `.factory/identity/now.md`.
- The IDE session model does the work.
- The human authors the OpenSpec change.

## Where to send the request

- Status: run `idefactory status` and summarize it. Do not edit the product.
- Full pipeline ("do everything", `/factory-full`): follow the `factory-full` skill.
- Plan or "apply this OpenSpec change": follow the `factory-openspec` skill.
- Build or "do the next task": follow the `factory-build` skill.
- Bounded multi-task orchestration: follow the `factory-run` skill.
- Cloud run from a board claim (a Cursor Automation prompt that names an Azure DevOps work item and an OpenSpec change): follow the `factory-cloud` skill.
- Review: follow the reviewer charter only, then `factory-governance`.
- Set up the factory, or a doctor report of a missing test decision or principal verifier: follow the `factory-setup` skill.

## How to use roles

In Cursor, spawn one subagent per role. The prompt contains only that role's charter, that role's history, the work packet or orchestration request, and the OpenSpec files named there. Pass the modelProfile from the request as a hint when the host supports model selection.

In GitHub Copilot or Claude Code, do the same when the session can spawn a subagent. Otherwise perform one role at a time and do not paste other charters into the prompt.

Independent work items may run together only after a shared design exists. The lead goes first when `.factory/decisions.md` and the OpenSpec design disagree or the design is missing.

The scribe runs last. Prefer `idefactory complete` for finalization. The scribe does not implement product code.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create` or `gh pr edit`.

If `sync-tasks` reports a reconciliation error, run `idefactory sync-tasks <change> --plan` and follow `factory-openspec`; do not create a separate change as a workaround.

When the human asks to archive, run `isDeliverableChange` first. If it is false, stop and do not move `openspec/changes/<change>/`. Spec sync stays human-gated and does not itself require the pull-request record.

## Routine steps and external effects

When the human asks you to run, or to run the full pipeline, for a change, that request covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records they involve. Do not ask again before each of them. The cover ends when the run stops and does not extend to another change.

These still wait for a separate human request: `approve` (the human's own record; never run it for yourself), `ci scaffold`, archive, and spec sync. Pass `--new-run` only after a budget stop or `retry-cap`, and only while the change is under `run.maxNewRuns`. `vacuous-red` and `unchanged-state` clear once their condition is resolved, so run again without `--new-run`.

The cover does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review.

Before any action with an external effect (publish, deploy, spend, creating an account), run `idefactory authorize` and proceed only when it reports `authorized: true`. When it reports `authorized: false`, stop and report the reason and the `approve` command. When it reports `authorized: true`, do not ask whether to proceed.

## Blocked states and authority

Read the report with `--json` before you act on it. Take the first option that is `supported`, has `resolves: true`, and has an authority of `agent` or `independent`:
- `agent`: run it yourself.
- `independent`: run it only under an identity other than the implementer's, such as the reviewing role. Never run it as the implementer.
- `human`: a person decides. Stop and quote the report to them. Do not ask for a decision that the packet lists under standing decisions.

A person is needed only for these gates, which the authority table marks `human`:
- `record-approval`: approve a publish, deploy, spend, or account action, or a human gate on a task. Command: `idefactory approve <id> --note "<why>" --change <change> --task <task> --action <action> --approver <id> --expiry <iso>`
- `resume`: remove HALT. Command: `idefactory resume`
- `raise-new-run-cap`: raise a configured run cap or ceiling. Command: `set run.maxNewRuns in .factory/config.json`
- `new-run-spend`: open a new run session after max-tokens or max-cost. Command: `idefactory run --change <change> --new-run`
- `new-run-human`: open a new run session on a stop that a person must decide. Command: `idefactory run --change <change> --new-run`
- `record-setup`: record the test command and governance mode, which are project decisions. Command: `idefactory setup --governance <lightweight|strict> --map unit --argv <part>... (or --no-test)`

Stop rules:
- `retry: never`: stop and report. Do not retry.
- `retry: only-after-change`: retry only after the recorded state changes.
- Condition stops (`vacuous-red`, `unchanged-state`, `host-usage-unavailable`, `invalid-budget`) clear when their condition is resolved. Resolve it and run again without `--new-run`.
- Budget stops (`max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`) take `--new-run` only within `run.maxNewRuns`. Past the cap, the report names a person.
- `max-tokens` and `max-cost` take `--new-run` only after a person decides.

Authority levels: `agent` (an implementing agent may decide); `independent` (an identity other than the implementer decides); `human` (a person decides). Enforcement labels: `none` (recorded, not checked); `identity` (the command checks the approver identity); `principal` (the command checks a verified principal).

## What you never do

- Do not start an unattended loop. `/factory-run` and `/factory-full` are human-started and stop on CLI conditions. A cloud run begins only from a human's board move and a `start` or `resume` claim through `factory-cloud`.
- Do not create a human task board that replaces OpenSpec. `.factory/work/` is the machine execution graph only.
- Do not archive an OpenSpec change. Tell the human to use OpenSpec's archive skill.
- Do not modify `.squad/` if present.
- Unrelated requests are left alone. Do not change `.factory/` for them.

## Blocked states

`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` accept `--json`. When one stops without finishing its step it prints a blocked-state report: `invariant` (a `code` and a message), `actor` (`human`, `independent-agent`, `implementing-agent`, or `tooling`), `recovery.options` (each with `supported`, a `command` when supported, `actor`, `requires`, and `resolves`), and `retry` (`safe`, `only-after-change`, or `never`). Exit codes do not change. Branch on the report:

- When an option with `resolves: true` is `supported` and its actor is an agent role, take it.
- When the actor is `human`, ask only when the option needs authority, and quote the report. Do not ask for a decision listed under Standing decisions in the packet or request.
- When `retry` is `never`, stop and do not retry. When it is `only-after-change`, retry only after something recorded has changed. When it is `safe`, retry the same command.
- When `recovery.supported` is false, say that no supported recovery exists, name the human as the actor, and stop.

Standing decisions in a packet are approvals, standing authorizations, red exceptions, methods, and reconciliation decisions still valid for the item. Listing one grants no authority.

`idefactory autonomy report [--change <name>] [--since <iso>] [--json]` is read-only. It reads the control event log and counts each stop that needed a human as one intervention: `policy-decision` (an intentional human decision), `failure` (no supported recovery), or `redundant` (an agent could have resolved it). Stops handled without a human and autonomous recoveries are listed separately. It does not see prompts typed into an IDE chat.
