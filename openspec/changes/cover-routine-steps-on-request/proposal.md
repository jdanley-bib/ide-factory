# Proposal

## Why

Part of #51 (failure 6, "human involvement accumulates around routine bookkeeping", and the primary product intent "say go and walk away"). The installed rule and six skills say that `sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync "run only after the human asks for that action". A cooperative agent reads that literally. Even after the human has asked for a run, the agent stops to ask before `sync-tasks`, before `verify`, and before `complete`. None of these steps has an external effect, and each is already bounded by run budgets, evidence rules, independent review, lockouts, and the profile human gate. The prompt adds a person to the loop without adding safety.

The decision for the framework is that a human request to run, or to run the full pipeline, covers the routine steps of that run, and that only external-effect actions need a separate authorization check.

## What Changes

- The installed Cursor rule, Cline rule, Copilot agent file, and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skills replace the "run only after the human asks" sentence with one shared block that says:
  - a human request to run, or to run the full pipeline, for a change covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records those steps involve, and the agent does not ask again before each of them;
  - before any action with an external effect (publish, deploy, spend, creating an account), the agent runs `idefactory authorize` and proceeds only when it reports `authorized: true`, and otherwise stops and reports the reason and the `approve` command;
  - these still apply and are not waived: a true profile human gate, an active lockout, `HALT`, run budgets and their stop reasons, independent review, and the rule that only a human passes `--new-run` after a budget stop, `vacuous-red`, or `retry-cap`;
  - `approve`, `ci scaffold`, archive, and spec sync stay separate human requests. `approve` is the human's own record, and archive and spec sync decide the project's specification history rather than building the change.
- A single wording for the block, checked by a test across every shipped copy.
- **BREAKING**: the wording of installed guidance changes. A project that upgrades gets the new text for any adapter file it has not edited; edited files are preserved and reported, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ide-adapters`: the pull-request guidance requirement no longer carries the wait sentence, and new requirements cover what a run request covers, what still waits, how external effects are authorized, which gates remain, and one shared wording.

## Impact

- `templates/cursor/rules/factory.mdc`, `templates/cline/rules/factory.md`, `templates/copilot/factory.agent.md`, `templates/skills/factory-run/SKILL.md`, `factory-coordinator`, `factory-governance`, `factory-openspec`, the installed copies under `.cursor`, `.cline`, `.github`, `.agents`, `.claude`, `templates/adapter-history.json` (rebuilt), and `README.md`.
- `test/pr-guidance.test.mjs` (its pinned sentence), `test/adapter-history.test.mjs`, `test/adapter-ownership.test.mjs`, `test/adapters-render.test.mjs`, `test/help-guidance.test.mjs`, `test/readme-adapters.test.mjs`, and a new drift test.
- No change to the CLI, gates, or stored records.
- Depends on `align-approval-actions` for the `authorize` command. The external-effect paragraph must not ship before that command exists.

Out of scope:

- Relaxing any code-enforced gate. A profile human gate, independent review, lockouts, `HALT`, and budgets are enforced by the CLI and stay so.
- A single-item `/factory-build` request. Whether it covers `verify` and `complete` for that item is left as it is now.
- Cloud agents. The `factory-cloud` skill is handled by `agent-judged-operation-retries`.
