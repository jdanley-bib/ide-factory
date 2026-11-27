# Proposal

## Why

Part of #51 (failures around human authority and delegated decisions). The governance rule says deployment, publishing, spend, and new accounts require a recorded `idefactory approve`. The approval machinery cannot record any of them. A scoped approval's action must be `accept` or `complete`; the validator rejects everything else, and `humanGateAllows` returns false for any other action. The only consequence is that an agent asked to deploy has nothing to check, so it stops and asks the human, even when the human already said yes. Approvals are also bound to the clean HEAD at issuance and to a single task, so work that crosses a commit loses its approval.

The factory should state in one table which actions need which kind of authority, let an agent ask a read-only question ("am I authorized to do this?"), and let a human grant a bounded standing authorization once instead of answering the same question at every step.

## What Changes

- One machine-readable action table: `accept`, `complete`, plus the external-effect actions `publish`, `deploy`, `spend`, and `account`. Each row names the binding (task and revision for gate actions; change and target for external-effect actions) and whether a profile `humanGate` can waive it. External-effect actions can never be waived by a profile.
- `idefactory approve --action` accepts every action in the table, and its help text and error messages are generated from the same table.
- New read-only command `idefactory authorize --change <c> [--task <t>] --action <a> [--target <x>] [--json]` reports whether the action is currently authorized, which approval authorized it, and, when it is not, the exact reason (from a closed set) and the `approve` command a human would run. It never performs the effect and never writes.
- Standing authorization: at policy version 2 only, a verified principal may record an authorization bound to one change, one external-effect action, and one named target, without a task or a revision. Its lifetime is configurable up to a maximum set by the governance policy (default seven days). Per-action approvals keep the 24-hour maximum.
- `idefactory revoke <id> --note ...` records a revocation that ends an authorization immediately.
- A consistency check: the governance rule file, the README, the skills, and the help text list exactly the actions in the table, enforced by a test.
- Skills tell the agent to run `authorize` before any external-effect step and to stop only when it reports `authorized: false`, using the reason.
- **BREAKING**: none for existing approvals. Existing `accept` and `complete` approval files remain valid with no change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `risk-gates`: the action set, the lifetime rule, and new requirements for the table, the authorization check, external-effect actions, standing authorization, and revocation.
- `human-governance`: the approval record covers standing authorization, and approve help lists every action.
- `cli-help`: help for `authorize` and `revoke`.

## Impact

- `src/lib/risk-gates.mjs` (`ALLOWED_ACTIONS`, `validateScopedApproval`, `humanGateAllows`, matching), new `src/lib/approval-actions.mjs`, `src/lib/govern.mjs` (`approve`, new `revoke`), `src/lib/run.mjs`, `src/lib/command-help.mjs`, `src/lib/writer-lease.mjs` (`revoke` is a mutation; `authorize` is not).
- `.factory/governance.md` template, `templates/skills/factory-governance/SKILL.md`, `factory-run`, `factory-build`, adapter copies, `README.md`.
- `test/` additions for the table, the check, standing authorization, and revocation.
- No new dependencies. Approval files for the new actions use a new schema version only for standing authorization.

Out of scope:

- Performing deployments, publishing, or spend. The factory only records and checks authority.
- Self-approval by the implementing agent. The approver rule is unchanged and no standing authorization can be recorded without a verified principal.
- Changing the 24-hour maximum for per-action approvals.
