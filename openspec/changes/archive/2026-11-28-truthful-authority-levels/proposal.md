# Proposal

## Why

Part of #54 and #51. The blocked-state table labels the actor for many steps as `human`: waiving or reusing a red, resolving a lockout, applying a task reconciliation, passing `--new-run`, and accepting a baseline. For most of them the code checks only that a supplied identity differs from the implementer's (and, under policy version 2, that a project-configured verifier confirms it). The CLI cannot tell a person from an agent, so `human` here is a label, not a fact. Its effect is to make an agent stop and ask when it could have routed the step to a different identity, which is the largest remaining source of friction after the dead ends in #54.

The factory needs one honest vocabulary: what each gated action really requires and how the CLI enforces it. Then reports, help, and guidance can say it once, agents act when they may, and humans are reserved for the few things only a person can decide.

## What Changes

- Three authority levels: `agent` (any agent, including the implementer, may do it; the decision is recorded and grants nothing it was not already allowed), `independent` (an identity other than the implementer's, which may be an agent), and `human` (a person is needed: external effects, spend, publishing, removing HALT, and caps).
- A single table, `src/lib/authority.mjs`, maps each gated action to a level and to how the CLI enforces it today: `none`, `identity` (supplied identity differs from the implementer), or `principal` (confirmed by the policy version 2 verifier).
- Blocked-state options carry `authority: { level, enforcement }`, and the report's `actor` is derived from the level. Waive red, reuse red, resolve lockout, and apply reconciliation move from `human` to `independent-agent`. `--new-run` within its cap and `--accept-baseline` move to `implementing-agent`. Approving a human-gated action, removing HALT, raising a cap, and the spend ceilings stay `human`.
- `--accept-baseline` now requires `--reason`, and the reason, HEAD, and time are recorded with the acceptance, so an agent's acceptance is auditable.
- A project may raise (never lower) any gate to `human` through `authority.<gate>: "human"` in `.factory/config.json`. The report and status then name a human for that gate. Enforcement is unchanged, so the setting steers agents and documents intent.
- Refusal messages and help say the level that is needed ("an identity other than the implementer"), not "a human", for independent-level gates.

## Capabilities

### New Capabilities

- `authority-levels`: the levels, the table, enforcement labels, report derivation, the raise-only override, and message wording.

### Modified Capabilities

- `blocked-states`: the actor rule derives from the table; lockout resolution is independent.
- `guided-build`: baseline acceptance needs a reason and is recorded.
- `cli-help`: help names the levels.

## Impact

- New `src/lib/authority.mjs`; `src/lib/blocked-states.mjs` (options use the table), `src/lib/orchestrate.mjs` (baseline reason and record), `src/lib/run.mjs` and `src/lib/red-exceptions.mjs`, `src/lib/lockout.mjs`, `src/lib/reconcile.mjs` (message wording), `src/lib/config.mjs` or equivalent (raise-only override), `src/lib/command-help.mjs`, `src/lib/autonomy.mjs` (uses actor, no change expected).
- `test/authority.test.mjs`, `test/blocked-states.test.mjs`, `test/orchestrate.test.mjs`, `test/command-help.test.mjs`.
- No new dependencies. No gate gets weaker: every identity and principal check that exists today still runs.

Out of scope:

- Verifying that an identity belongs to a person. The principal verifier from policy version 2 remains the only such check, and it is project configured.
- Changing what a human approval for publish, deploy, spend, or account actions requires.
- Rewriting agent guidance. `single-source-agent-guidance` consumes this table.
