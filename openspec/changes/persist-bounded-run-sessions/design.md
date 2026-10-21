# Design

## Context

See `proposal.md` for motivation. Today `runFactory()` in `src/lib/orchestrate.mjs` sets `progressed = 0` on every call. The limit is `--max-tasks`, then `config.run.defaultMaxTasks` (20 in the template and in this repo), then 20. The loop returns exit code 2 at the first agent stage, before `progressed` increments. `progressed` increments only on the non-agent branch, which current stages almost never take. The factory-run skill starts a new process for each iteration, so the counter resets.

`ledger()` appends JSONL and swallows write errors. It is not a budget store. Session files belong under `.factory/orchestration/` so the existing factory-run-state filter does not treat them as a dirty worktree. `HALT` is thrown before the loop. Stage selection, including security-reviewer routing, stays in `stageForState`.

## Goals / Non-Goals

**Goals:**

- Resume one session per change so agent-step, completed-task, wall-clock, and failure budgets survive a new process.
- Persist an incremented agent-step count before printing a request, and print nothing when a budget is exhausted, invalid, or the same request would repeat.
- Keep `--max-tasks 1` on a first request returning exit 2, because that flag counts finalized tasks.
- Record how a human opens a fresh session and how this revision rolls back.

**Non-Goals:**

- Risk gates, approval tokens, mandatory security transitions, transactional `complete`, lockout recovery, and one-writer leases.
- Charging agent steps that occurred before a session file existed.
- Proving host token or cost figures. This design only compares a configured ceiling with a metric the invocation actually exposes.
- CI, provenance, and telemetry export. Best-effort ledger lines are not a second control plane.

## Decisions

### One session file per run id

An open run is `.factory/orchestration/runs/<run-id>.json` with `schemaVersion` 1. The file records run id, change, `open` or `closed`, `startedAt`, `lastObservedAt`, the budgets captured at creation, counters, `baselineDoneIds`, counted failure ids, the last request fingerprint, and `stopReason`. The latest file for a change is the one with the greatest `startedAt`. `--new-run` creates a new id and leaves the previous file in place.

Alternative considered: one file named by the change, overwritten on each run. Rejected because a reset would destroy the exhausted session the next process must still honor.

### Budgets are fixed when the session opens

Resolution order for a new session is the CLI flag, then config, then a built-in positive default. The chosen values are copied onto the session. A later process uses those stored values. A flag passed on resume can tighten a stored budget and cannot raise it. Config is not re-read for an open session.

Built-in defaults, used when the key is absent: `defaultMaxAgentSteps` 20, `defaultMaxTasks` 20, `defaultMaxWallClockMs` 14400000, and `defaultMaxFailures` 5. Zero, negative, and non-integer values are invalid. There is no unlimited value. Token and cost ceilings have no default; they exist only when `run.maxTokens`, `run.maxCost`, `--max-tokens`, or `--max-cost` is set.

`--max-tasks` and `defaultMaxTasks` mean work items that move to done during the session, not loop iterations. The in-memory `progressed` counter goes away. `baselineDoneIds` is the done-id set at session creation, so work already done is not charged.

Alternative considered: re-read config on every entry so an operator can extend a live run. Rejected because that is a silent budget reset.

### Persist the step, then return the request

`HALT` and an active lockout return before any session write, as they do now. A sticky closed session also returns before `syncTasks` and before `startAttempt`.

Before printing a request the command writes the session with a temporary file and rename. An agent-step write increments `agentSteps` first. A complete request updates the fingerprint and does not increment `agentSteps`. If that write throws, the command exits 1 and prints no request. A crash after the write can over-count by one. It cannot under-count a request that was printed.

The fingerprint is action, role, task id, attempt id, attempt state, and work-item status. It ignores prose and timestamps. A matching fingerprint closes the session with `unchanged-state` and does not increment again.

Failure count adds one distinct verification record that timed out or did not pass. Records stored as red do not count, so a required red run is not a tool failure. Wall-clock is `startedAt` compared with the current time. If the clock is earlier than `startedAt`, the stop reason is `invalid-session`.

Sticky stop reasons, which stay in force until `--new-run`, are `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, `unchanged-state`, `max-tokens`, `max-cost`, `invalid-budget`, `invalid-session`, and `host-usage-unavailable`. `all-done`, `blocked`, and `human-gate` may continue the same session, with the same counters, when that condition has cleared and budget remains. `rejected` and `lockout` keep today's stop behavior and do not zero counters.

Exit codes: 2 for a printed agent-step or complete request, 0 for a budget or unchanged-state stop, and 1 for an invalid budget, corrupt session, clock regression, missing required host metric, or HALT.

### Host usage is compared, not invented

The invocation exposes tokens with `--host-tokens` or `IDEFACTORY_HOST_TOKENS`, and cost with `--host-cost` or `IDEFACTORY_HOST_COST`. A configured ceiling with that metric missing closes the session as `host-usage-unavailable`. A metric at or above its ceiling closes it as `max-tokens` or `max-cost` and stores the exposed number. With no ceiling, the session stores neither field even if the environment has a number.

Alternative considered: treat a missing metric as zero. Rejected because that turns an unknown into a pass.

### The ledger is only a deletion tripwire

Opening a session appends `run-session-opened` with the run id. Emitting an agent step appends `run-agent-step` with the new count. Those appends stay best-effort. If the ledger contains `run-session-opened` for an id that has no file and no `run-session-closed` line, `run` exits 1 with `invalid-session` and does not create a zeroed session. If the ledger's highest count for the loaded id is greater than the file's `agentSteps`, the file is treated as corrupt. The ledger is not reconstructed into a new session, and a ledger write failure does not by itself stop a run whose session file is valid.

Alternative considered: make the ledger authoritative and blocking. Rejected because `ledger()` is required not to block, and a failed append would then halt unrelated work.

### Skills resume; they do not refresh the budget

The factory-run copies under `.cursor/skills`, `.github/skills`, `.agents/skills`, `.claude/skills`, and `templates/skills` name the new stop reasons and keep calling `idefactory run --change <name>` without `--new-run`. Exit 0 remains a clean stop. Exit 1 remains a hard stop. The skill does not gain a timer or an unattended loop.

Init's config template gains the four positive defaults. `writeIfMissing` already leaves an existing `.factory/config.json` untouched, so this repo's config is not rewritten. Old configs receive the built-in defaults at session creation.

## Risks / Trade-offs

- [Deleting the session file resets the cap] → If the ledger still has an unmatched `run-session-opened` id, refuse to start. Deleting both the file and those ledger lines still starts at zero. Detecting that rewrite is provenance work and is out of scope.
- [A writer lowers `agentSteps` in the JSON] → Prefer the ledger high-water mark when it is higher, and fail closed. A swallowed ledger append leaves no mark, so this check is partial.
- [Two processes write one session] → Rename avoids a partial JSON read. A lost update can still under-count. Leases are a later change; this one does not add them.
- [The host reports zero tokens or cost] → Absence of a required metric fails closed. A present number is trusted. The factory does not audit host accounting.
- [Clock rollback extends the wall-clock budget] → `now < startedAt` is `invalid-session` and prints no request.
- [The skill passes `--new-run` after a cap] → Skill copies must not mention that flag as a loop step, and a test reads those copies.
- [Unchanged-state stops a run that edited files but did not transition] → The fingerprint follows attempt state and work-item status, which is the factory's state machine. File edits without a transition are stuck, and the stop is intentional.
- [In-flight work predates the session file] → Counters start at zero. Prior steps are not reconstructed. The next N requests are still capped.
- [An existing config omits the new keys] → Built-in defaults apply. Reinstall does not rewrite `config.json`.

## Migration Plan

1. Add the session module, CLI flags, and built-in defaults without changing stage routing or `complete`.
2. Add failing cross-process tests for an agent-step cap of N, unchanged state, invalid budgets, a corrupt file, red-versus-timeout failure accounting, and host usage. Implement until those tests pass.
3. Point the first-request orchestration tests at the new session only as far as asserting they still receive exit 2. Do not count that first request as a finalized task.
4. Update the config template and the five factory-run skill copies. Leave an existing project config byte-for-byte unchanged.
5. Verify with `npx openspec validate persist-bounded-run-sessions --strict`, `npm test`, and `node src/cli.mjs doctor`.
6. Roll back by reverting the implementation commits. The previous CLI ignores `orchestration/runs/*.json` and the new ledger event names, and it restores the per-process counter. Session files can stay on disk. No work-item or attempt migration is required.

## Open Questions

None. The numeric defaults are fixed above. Risk gates, lockout resolution, finalization atomicity, and provenance remain later changes.
