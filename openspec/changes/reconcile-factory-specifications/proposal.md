# Proposal

## Why

The main OpenSpec specifications no longer describe the accepted factory architecture: they still name Backlog.md as the queue, require `GOLDEN_RULES.md`, omit newer roles and lifecycle commands, and one adapter requirement has no scenario. This makes the documented contract disagree with the tested implementation and causes `openspec validate --all` to fail.

## What Changes

- Make `.factory/work/` the specified machine execution queue while keeping OpenSpec `tasks.md` as the human plan.
- Specify the attempt lifecycle, bounded human-started orchestration, separate security/reviewer stages, and finalization behavior that the current factory exposes.
- Replace the obsolete shipped `GOLDEN_RULES.md` requirement with `.factory/governance.md`, while preserving unrelated or legacy human files.
- Update the default roster and routing contract to include Test Engineer and Security Reviewer.
- Bring the shared IDE adapter command set up to date and add the missing no-model-launcher scenario.
- Remove stale wording and claims that contradict the accepted `factory-orchestration` decision.

Out of scope:

- Changing runtime behavior, verification trust, approval enforcement, run budgets, concurrency, CI, or security tooling.
- Removing legacy Backlog.md implementation code or dependencies.
- Archiving the change or modifying `.squad/`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `spec-to-backlog`: Replace obsolete Backlog.md queue requirements with the `.factory/work/` execution queue contract.
- `guided-build`: Describe work-item packets, attempts, bounded human-started run orchestration, review, and finalization.
- `human-governance`: Specify `.factory/governance.md` as the installed baseline and remove the obsolete shipped `GOLDEN_RULES.md` requirement.
- `shared-team-state`: Update the default roster and shared state contract for all active roles and work state.
- `ide-adapters`: Align installed command coverage and add a scenario proving instructions never launch a model.

## Impact

- Affected artifacts: five main OpenSpec capabilities and their validation scenarios.
- Affected implementation: none; this change reconciles specifications to already accepted and tested behavior.
- Verification: `npx openspec validate --all`, `npm test`, and `node src/cli.mjs doctor`.
- Dependencies and external systems: none.
