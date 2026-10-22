# Proposal

## Why

`runFactory()` keeps its progress counter in memory and returns at the first agent step. The factory-run skill then starts a new process, so `--max-tasks` never caps agent steps across re-entry. A bounded run needs a persisted session that fails closed when a budget is exhausted or the work state has not changed.

## What Changes

- Persist one open run session per change, with counters and deadlines that the next `idefactory run` resumes instead of resetting.
- Enforce agent-step, completed-task, wall-clock, and tool-failure budgets. Persist the incremented counter before emitting a request, and emit no request when a budget is missing, invalid, or exhausted.
- Stop when the next request would repeat the same attempt state and work-item status, and record an explicit stop reason.
- Accept optional token and cost ceilings only when that invocation exposes host usage. A configured ceiling with no host metric fails closed; an unconfigured ceiling does not invent a zero.
- **BREAKING:** An exhausted session stays exhausted across processes until the human passes `--new-run`. `--max-tasks` bounds tasks finalized during the session, not an in-memory loop count. There is no unlimited budget.

Out of scope:

- Risk policy, `humanGate` enforcement, scoped approvals, and mandatory security-stage transitions.
- Transactional finalization, crash journals, lockout resolution, and one-writer leases.
- CI workflows, SBOM generation, SLSA provenance, secret-scan/SAST/dependency tool selection, and telemetry export.
- Reconstructing agent steps that happened before the session file existed.
- Archiving `enforce-verification-evidence` or editing `.factory/` execution state in this planning change.

## Capabilities

### New Capabilities

- `bounded-run-sessions`: Persisted run-session schema, step/task/time/failure budgets, unchanged-state stops, and optional host token/cost ceilings.

### Modified Capabilities

- `guided-build`: `idefactory run` returns one role-scoped request only while the persisted session has remaining budget and the work state changed since the previous request.
- `project-install`: A new init writes positive run-budget defaults and a reinstall leaves an existing `config.json` unchanged.

## Impact

- Affected specs: new `bounded-run-sessions`; modified `guided-build` and `project-install`.
- Affected runtime, when applied: `idefactory run`, the config template, and the factory-run skill copies that interpret stop reasons. Stage routing, evidence, and `complete` write order stay as they are.
- Affected tests, when applied: separate processes must share one session file. Existing first-request tests that pass `--max-tasks 1` and expect exit 2 stay valid because that flag counts finalized tasks, not the first agent request.
- Dependencies: no new package and no model launcher. Session files live under `.factory/orchestration/runs/` and are factory run-state.
- Verification commands for this planning change: `npx openspec validate persist-bounded-run-sessions --strict` and `npm test`.
- Migration and rollback are specified in `design.md`. This proposal does not apply, implement, or archive the change.

## Acceptance criteria

- Strict validation of this change passes, and `npm test` still passes with no runtime edits in the planning commit.
- After implementation, with `maxAgentSteps` set to N, N separate `idefactory run` processes may emit one agent-step request each, and process N+1 exits without an orchestration request and persists stop reason `max-agent-steps`.
- After implementation, a second process that sees the same attempt, role, and work-item status as the previous request persists stop reason `unchanged-state` and does not print a request.
- After implementation, a missing, non-integer, or non-positive required budget, or an unreadable session file, exits with an error, writes no fresh zeroed session, and prints no request.
- After implementation, a configured token or cost ceiling is enforced only from host-exposed usage; a missing host metric for that ceiling stops with `host-usage-unavailable`, and an absent ceiling does not record a fabricated zero.
