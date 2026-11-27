# Proposal

## Why

Part of #51 (failures around stranded work and avoidable human prompts). When the factory cannot proceed, it prints a stop reason or a free-text error. `blocked` means "no ready work" whether the cause is dependencies, a held item, or something nobody can fix. `rejected` and `human-gate` print a heading and the attempt state. A thrown error carries only a message. None of these says which invariant is unmet, who may act, what the supported ways out are, or whether retrying can help. An agent that cannot tell has two options: ask the human, or retry. Issue #51 records both, including a case where no supported recovery existed at all and nothing said so.

The factory should say, in one machine-readable shape, why it is stopped, who can unblock it, which recovery commands exist (and when none does), and whether retry is safe. It should also carry the human decisions already made into every handoff so they are not asked again.

## What Changes

- A common blocked-state report with the unmet invariant (a closed code plus a message), the responsible actor, the recovery options (each marked supported or unsupported, with the command to run), and a retry classification.
- `--json` on `run`, `next`, `complete`, `attempt transition`, and `sync-tasks` prints the report. Without `--json`, text output, stop reasons, and exit codes stay as they are.
- Table-driven mapping from every existing stop reason and every named failure to a report. A failure with no mapping reports `unclassified` and says no recovery is known.
- When no supported recovery exists, the report says so in those words and names the human as the actor, instead of leaving the agent to guess.
- A durable blocked record per work item under `.factory/blocked/`, written when a stop is reported and marked resolved when a later run finds the condition gone. Live state always wins over the record.
- Work packets and run requests gain a "Standing decisions" section listing the valid decisions already recorded for the item: approvals and standing authorizations, red exceptions, and reconciliation decisions. Skills tell agents not to ask for any decision listed there.
- Skills tell agents to branch on the report: act on an agent-actionable supported option, ask only when the actor is the human and the option needs authority, and stop when the retry class says retrying cannot help.
- **BREAKING**: none. New flags and a new section only.

## Capabilities

### New Capabilities

- `blocked-states`: the report shape, actor and recovery rules, retry classification, machine-readable output, the durable record, and agent guidance.

### Modified Capabilities

- `guided-build`: packets and run requests carry standing decisions.
- `cli-help`: help for the `--json` forms and the blocked-state fields.

## Impact

- New `src/lib/blocked-states.mjs` (code table, actor and recovery table, report builder, durable record), `src/lib/orchestrate.mjs` (each stop site), `src/lib/run.mjs` (flag handling and error rendering), `src/lib/complete.mjs`, `src/lib/attempt.mjs`, `src/lib/queue.mjs` (`renderPacket`, `syncTasks` reconciliation error), `src/lib/command-help.mjs`, `src/lib/layout.mjs` if a path helper is needed.
- `templates/skills/factory-run/SKILL.md`, `factory-build`, `factory-coordinator`, `factory-governance`, adapter copies, `README.md`.
- `test/` additions for the mapping table, each emitting command, and the record.
- No new dependencies. Existing stop reasons are unchanged.

Out of scope:

- Auto-recovering. The report names options; running them stays a command someone invokes.
- Changing which conditions block, or the stop-reason vocabulary.
- Measuring interventions, which `measure-autonomy` does.
