# Design

## Context

Stop reasons come from `runFactory` in `src/lib/orchestrate.mjs`. Each is returned as `{ code, text, stopReason, request }`. The `blocked` reason means "no ready work item" for any cause, and the `rejected` and `human-gate` stops render only a heading with the change, item, attempt, and state through `renderStop`. Failures from `complete`, `attempt transition`, `sync-tasks`, and `approve` are thrown as `Error` with only a message, and `src/lib/run.mjs` prints `error.message` and returns 1. `parsed.flags.json` is already parsed and used by several commands, and `run` and `next` do not read it. Packets are rendered by `renderPacket` in `src/lib/queue.mjs`, which already appends optional blocks (`priorRejectionBlock`, `redExceptionBlock`). Run-state paths that must not dirty the source revision are listed in `FACTORY_RUN_STATE_PREFIXES` in `src/lib/verification-evidence.mjs`; a new directory outside the list would invalidate approvals and verification evidence bound to a clean HEAD.

## Goals / Non-Goals

**Goals:**

- Every stop says what is unmet, who can act, what the options are, and whether retry helps.
- The shape is stable enough for an agent to branch on.
- Decisions already made travel with the work.

**Non-Goals:**

- Auto-recovery, or any change to what blocks.

## Decisions

**1. One table, keyed by invariant code, in `src/lib/blocked-states.mjs`.**
Each row: `{ code, actor, retry, options: [{ id, command, actor, requires }] }`. Codes at first: `approval-missing` (`human-gate`), `no-ready-work` (`blocked`), `attempt-rejected` (`rejected`), `reviewer-lockout` (`lockout`), `needs-review`, `needs-complete`, `finalize-failed`, `completion-unmet`, `red-missing`, `vacuous-red`, `retry-cap`, `infrastructure-failure`, `baseline`, `budget-exhausted`, `unchanged-state`, `halted`, `reconciliation-required`, `unclassified`. Each option also carries `resolves` (false for read-only inspection such as `requirements` or `authorize`), and the event field `agentActionable` is true only when a supported option with `resolves: true` has an agent actor. A `supported` value is not stored. The builder checks that the option's command is a command the CLI dispatches and that its documented precondition holds for the current state, so an option for a command that does not yet exist reports `supported: false`. Alternative: hand-written text per site. Rejected: it is the drift that the issue describes.

**2. Table rows reference commands by name; later changes add their own.**
`disclose-effective-requirements`, `accepted-attempt-evidence-recovery`, `reconcile-changed-tasks`, and `align-approval-actions` introduce `requirements`, `attempt reopen`, `sync-tasks --plan`, and `authorize`. A row lists them as options and the builder marks each unsupported until its command exists, so the order of landing does not matter and no row is edited twice.

**3. An honest "no supported recovery" is a first-class result.**
When every option for a code is unsupported, the report sets `recovery.supported = false`, names the human as the actor, and carries a message saying so. This is the case #51 describes (an accepted attempt whose requirement cannot be met) and it should not read as a retryable stop.

**4. Errors carry the report; text stays the same.**
A `BlockedError extends Error` holds `invariant` and structured fields while keeping `message` as it is today. The existing throw sites for the named cases switch to it, and `run.mjs` prints `message` as now. With `--json`, `run.mjs` prints the report instead of the message. Errors with no mapping are caught at the dispatcher and reported as `unclassified` with the original message. Alternative: parse messages. Rejected: brittle and untestable.

**5. `--json` is added per command and changes only the printing.**
`run --json` prints one object `{ stopReason, exitCode, request, blocked }` where `request` is the same data that the text carries. The text output stays the default so the shipped skills and tests do not change. `next --json` reports the empty case with its report. `complete`, `attempt transition`, and `sync-tasks` print `{ ok, ..., blocked }`. Exit codes are never changed by the flag.

**6. Durable record under `.factory/blocked/` and run-state registration.**
The file is `.factory/blocked/<change>--<task>.json`, overwritten with the latest report plus `status` (`open` or `resolved`), `recordedAt`, and, once resolved, `resolvedAt` and `resolvedBy`. It is overwritten rather than appended because it is derived data; the append-only trail is the `blocked.recorded` control event. `.factory/blocked/` is added to `FACTORY_RUN_STATE_PREFIXES` so writing it never dirties the revision. A run checks the live condition first. If it no longer holds, the run marks the record resolved, names what resolved it (an approval id, an exception id, a lockout resolution), and continues. The record is never an input to a gate.

**7. Standing decisions are computed, not stored.**
`standingDecisions(project, item)` reads valid approvals and standing authorizations through the same matcher as `authorize`, red exceptions and method records bound to the item's attempts, and the latest reconciliation record for the change. It lists id, kind, summary, expiry, and approver. Validity uses the existing validators, so an expired, revoked, or mismatched record is omitted. `renderPacket` and `renderRequest` append the block when it is not empty. Listing is informational and never grants authority. Sources that do not exist yet in a given build contribute nothing, so ordering of the changes does not matter.

**8. Skill text states the branching rule once.**
The shipped skills say: read the report; if the actor is an agent and an option is supported, take it; if the actor is `human`, ask only when the option needs authority, and quote the report; if the retry class is `never`, stop; do not ask for a decision listed under standing decisions. This text is the same in `factory-run`, `factory-build`, `factory-coordinator`, and `factory-governance`.

## Risks / Trade-offs

- [The code table grows stale as new stops are added] → A test enumerates every stop reason in the `bounded-run-sessions` list and every dispatcher error path covered here and fails for an unmapped reason; unknown errors still report `unclassified`.
- [A supported option fails at run time] → `supported` means the command exists and its precondition holds now, not that it will succeed; the report says so in the help text.
- [The record is read as authority] → The spec and the code never read it in a gate, and a test shows a stale open record does not block a run.
- [Packet length grows] → The section is omitted when empty and lists one line per decision.

## Migration Plan

No data migration. Existing files are unchanged, and the first stop after upgrade creates a record. Rollback is a code revert: `.factory/blocked/` files are ignored by older builds and are run-state in the newer one only, so a stray directory in an older build shows as a dirty path; documenting that the directory may be deleted keeps the rollback safe.

## Open Questions

- Whether the record should also be mirrored into the status read model. It can be added without changing these specs.
