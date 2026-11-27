# Proposal

## Why

Part of #51 (the cloud automation context). [PR #26](https://github.com/jdanley-bib/ide-factory/pull/26) adds a cloud factory in which write operations to Azure DevOps are printed as plans for the agent to apply through Cursor's MCP connection. Its `factory-cloud` skill says: "If an operation fails, stop. Do not ack, do not retry with other arguments, and do not call a different tool." That turns every transient failure, including a network blip, into a stop that a human must clear by moving the story back to ready. #51 asks for the opposite: the cloud agent should diagnose the failure, choose an appropriate supported recovery, and continue, while never duplicating an external operation whose outcome is uncertain and never bypassing policy.

The decision for the framework is that the agent evaluates why an operation failed and whether to retry. The factory should supply the facts the agent needs to judge well, record what it decided, and keep the few guards that make a wrong judgment safe.

## What Changes

- Each plan operation carries two facts: `repeat` (`safe` when repeating it cannot change the outcome, or `check-first` when repeating it could duplicate an effect) and `verify` (the MCP read that shows whether the effect landed).
- The `factory-cloud` skill replaces "stop on the first failure" with an evaluation protocol: read the failure, decide whether the effect may have landed, run the `verify` read when it might have, and choose to retry the operation unchanged, regenerate the plan, treat the operation as applied, abandon, or escalate.
- New `idefactory mcp record <planId> --operation <n> --outcome <applied|failed|unknown> [--cause <code>] --decision <code> [--readback <present|absent|unavailable>]` stores the agent's evaluation as an append-only record. Causes and decisions come from closed sets; free text goes only to the record file, never to events.
- A `check-first` operation cannot be recorded as retried unless the agent's read-back showed the effect `absent`. `unavailable` read-back means the agent escalates. The agent still chooses; the factory refuses only the one combination that duplicates an effect.
- Retries per operation are bounded by a configured cap (default 3). Past the cap, a retry decision is refused and the stop is reported as a blocked state.
- `mcp ack` refuses when any operation's latest recorded outcome is unresolved, so an ack never claims a write that did not happen. Without records it behaves as before.
- `mcp pending` shows each operation's latest outcome and attempt count.
- A `conflict` cause with an `abandon` decision (for example, another run claimed the story) is a handled stop, not an intervention.
- Recovered failures feed the autonomy report as autonomous recoveries, and an exhausted cap appears as a blocked-state report.
- **BREAKING**: the `factory-cloud` skill no longer says to stop on any failed operation. Anything that relied on that stop must now check the record or the report.

## Capabilities

### New Capabilities

- `operation-recovery`: operation facts, the evaluation protocol, recorded decisions, the duplicate guard, the retry cap, ack safety, and the escalation path.

### Modified Capabilities

- `cli-help`: help for `mcp record` and the changed `mcp pending` and `mcp ack`.
- `factory-event-log`: decision events carry codes only.

## Impact

- `src/lib/mcp-plan.mjs` (operation facts, progress record, ack check, cap), `src/lib/board.mjs` and `src/lib/forge` plan builders (annotate each operation), `src/lib/run.mjs` and `src/lib/command-help.mjs` (`mcp record`, `mcp pending`), `src/lib/event-log.mjs` (allowlist), `templates/skills/factory-cloud/SKILL.md` and its adapter copies, `tools/ado-bridge/README.md` where it describes the failure rule.
- `test/mcp-plan.test.mjs`, `test/board-mcp.test.mjs`, `test/forge-mcp.test.mjs`, `test/cloud-skill.test.mjs`, and a new test file.
- Depends on PR #26 (or its successor) landing, because the plan builder, `mcp ack`, `mcp pending`, `.factory/mcp/`, and the `factory-cloud` skill do not exist on `main`. Works with `actionable-blocked-states` for the escalation report and `measure-autonomy` for the recovery counts, and degrades without them.
- No new dependencies.

Out of scope:

- Plan restrictions. The operation allowlist, the forbidden pull-request arguments, immutable plans, no merging or auto-completing, and no self-approval of a pull request are unchanged.
- A second cloud provider. The operation facts and record are provider-neutral so a GitHub transport can reuse them.
- Retrying outside plans. Reads, `git push`, and other commands the agent runs itself follow the same evaluate-then-decide guidance in the skill, with no record.
