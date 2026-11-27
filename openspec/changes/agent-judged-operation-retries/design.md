# Design

## Context

Everything here describes code that exists on the PR #26 branch (`cursor/cloud-ado-factory-732e`), not on `main`. On that branch:

- `src/lib/mcp-plan.mjs` builds a plan of ordered `{ tool, arguments }` operations plus `effects` (records to write, events, and `bind` rules for ids a create operation returns). The plan id is `plan-` and twelve hex characters of a digest of `{ kind, change, operations, effects }`, so planning twice gives the same id and one file in `.factory/mcp/`. `assertPlanOperation` enforces the tool and action allowlist and forbids pull-request completion arguments.
- `ackPlan` re-reads the plan, refuses a plan whose content no longer matches its id, requires the integer a create operation returns, writes the records, appends an `mcp-ack` event, and deletes the plan. `listPlans` backs `mcp pending`.
- `templates/skills/factory-cloud/SKILL.md` says: "If an operation fails, stop. Do not ack, do not retry with other arguments, and do not call a different tool to get the same effect." A 409 on the first operation of a claim means another run claimed the story and the agent stops.
- A claim's state update starts with a `Test` on `/rev`, so a repeated claim cannot succeed twice.
- `.factory/mcp/` is registered as run-state in that PR.

`main` has the event allowlist in `src/lib/event-log.mjs` and run budgets in `bounded-run-sessions`. The blocked-state report from `actionable-blocked-states` and the autonomy report from `measure-autonomy` are optional collaborators.

## Goals / Non-Goals

**Goals:**

- Let the agent judge a failure and act, so transient failures do not need a human.
- Make a wrong judgment safe by construction where it would duplicate an external effect.
- Leave an audit trail of what the agent decided and why, in codes.

**Non-Goals:**

- Auto-retrying in the CLI. The CLI never contacts the provider and does not start doing so.
- Loosening plan integrity or provider restrictions.

## Decisions

**1. Judgment is the agent's; facts and guards are the factory's.**
The agent reads the error, weighs the cause, and chooses. The factory contributes what an agent cannot know by itself: whether repeating an operation is safe, how to check whether it landed, how many times it has already been retried, and what was decided before. It refuses only combinations that would duplicate an effect or exceed the cap. Alternative: a fixed retry policy in the CLI. Rejected: it cannot distinguish a conflict from a blip, and the issue asks for diagnosis.

**2. Operation facts are part of the plan content.**
`repeat` and `verify` are written by the plan builder per operation and enter the digest, so an agent cannot edit them without breaking the plan id. The builder's table is by tool and action: creates and comment additions are `check-first`; description updates and revision-tested state updates are `safe`; links are `check-first` because a duplicate link can fail or double up. Each `check-first` operation names the read that checks it: `wit_work_item get` or a work-item search for a story, `repo_pull_request list` for a pull request, `repo_pull_request_thread list` for a thread, and a work-item comment list for a comment. Alternative: leave `verify` to skill text. Rejected: then the check depends on remembering the right read for each tool.

**3. Decisions are an append-only record beside the plan.**
`mcp record` appends to `.factory/mcp/<planId>.progress.jsonl`, which sits under the existing run-state prefix so it does not dirty the revision. Each line holds operation, outcome, cause, decision, read-back, optional note, and time. Notes stay in this file only; the event carries codes. `ackPlan` deletes the plan and now moves the progress file to the ack record's directory (or deletes it after copying the codes into the ack event) so the trail survives ack.

**4. The duplicate guard is a validation rule, not a prohibition.**
For a `check-first` operation the CLI accepts a retry decision only with a read-back of `absent`, accepts `skip-applied` only with `present`, and accepts only `escalate` with `unavailable`. The agent decides which read-back result it observed and what to do about a transient failure of that very read. The CLI cannot verify the read-back, but the record makes the claim auditable, and a false `absent` is the agent's recorded judgment, not an unrecorded guess. Alternative: have the CLI run the read. Rejected: it has no provider access by design.

**5. A bounded retry cap, configurable, default three.**
`mcp.maxOperationAttempts` in `.factory/config.json`, range 1 to 10, anything else falls back to 3. The cap applies per operation of a plan, counted from the progress file. It is required by #51 ("explicit bounded retries") and sits beside the run's wall-clock and step budgets, which still apply. Past the cap, `mcp record` refuses a retry and the stop is reported as `operation-retry-cap`, a blocked-state invariant whose actor is the human and whose retry class is `never`.

**6. Ack consults the record.**
When a progress file exists, `ackPlan` refuses if any operation's latest outcome is `failed` or `unknown`. This keeps the guarantee in the PR's design ("a failed operation means no ack, so the record never claims a write that did not happen") while allowing a failed operation to be resolved by a recorded read-back. With no progress file, ack is unchanged, so existing flows and tests keep passing.

**7. Conflict is a handled stop.**
A 409 on a claim means the system worked: another run owns the story. `cause: conflict` with `decision: abandon` is recorded and reported with a non-human actor, so `measure-autonomy` counts it as handled and not as an intervention. Alternative: treat every stop as an escalation. Rejected: duplicate-claim protection is the intended behavior and should not read as a failure.

**8. Escalation leaves status and state.**
`escalate` writes the blocked-state record (when `actionable-blocked-states` is present) naming plan, operation, and cause, and the skill's next step is `idefactory board report`, which prints a plan for the story's status. If that report operation also fails, the agent applies the same evaluation to it. If it cannot be delivered, the local record still holds the state, and the next claim decides `resume`.

**9. Integrity rules remain exactly as in PR #26.**
The allowlist, forbidden arguments, immutable plans, never-complete, and no self-approval are not retry policy and are not touched. `mcp record` reads the plan with the same integrity check as ack and refuses a modified plan.

**10. Non-plan commands share the principle, not the machinery.**
Reads and `git push` are idempotent or already have standard backoff guidance. The skill tells the agent to judge them the same way and keeps them under the run's wall-clock and step budgets. They get no record, to avoid a second ledger for operations that cannot duplicate an external effect.

## Risks / Trade-offs

- [A wrong read-back claim leads to a duplicate create] → The claim is recorded and visible in `mcp pending` and the event log; the revision `Test` still protects claims; creates are the only exposed case and each is checked first.
- [An agent loops on a transient failure] → The cap, the run budgets, and the `retry-cap` style stop bound it.
- [An agent abandons or escalates too readily] → The autonomy report separates avoidable escalations as `redundant` when a supported option for an agent existed.
- [Progress files accumulate] → They are deleted after ack and are small.
- [This assumes PR #26's shapes] → Tasks start by re-reading the merged code and adjusting names, and the specs avoid internal names.

## Migration Plan

Land after PR #26. Existing plans without `repeat` and `verify` are treated as `check-first` with no `verify`, so the guard fails closed and the agent must escalate rather than repeat. New plans carry the facts. Rollback is a code revert: progress files are ignored and ack ignores them.

## Open Questions

- Whether `verify` should name the exact arguments of the read. The specs say it names the read; the arguments can be added without changing them.
