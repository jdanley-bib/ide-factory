# Proposal

## Why

Profile `humanGate` values and approval files do not authorize anything. `run` looks for a release profile only on a path that already returned, and `verifying` may move straight to `awaiting-review`, so security-sensitive work can skip the security stage. Those gates need to fail closed.

## What Changes

- Treat `humanGate` on the work item's verification profile as an executable gate for the accept transition and for completion. A true gate without a valid scoped approval stops `run` with `human-gate` and no request, and completion exits with an error without finalizing.
- **BREAKING:** `idefactory approve` issues a scoped approval. The token authorizes a step only when change, task, source revision, action, approver, issuance, expiry, and policy version all match. A note-only approval file does not authorize a gate.
- Require `security-checking` before review when `securityProfile` is `security-sensitive` or a check matches the security pattern. Reject `verifying` to `awaiting-review` for that work, and require passing CLI security evidence before review. Caller-supplied security results stay rejected.
- New installs set `security-sensitive.humanGate` to true and leave `release.humanGate` true. A second init leaves an existing `profiles.json` byte-for-byte unchanged.

Out of scope:

- Transactional or idempotent finalization, crash journals, and recovery of a partial `complete`.
- Lockout resolution and one-writer leases.
- CI workflows, scanner or audit tool selection, new check argv, SBOM, SLSA provenance, and telemetry.
- Host-issued actor identity, and binding the approver string to a host session.
- A general policy engine, including OPA, Rego, or Cedar.
- Archiving earlier changes, or editing `.factory/` execution state in this planning change.

## Capabilities

### New Capabilities

- `risk-gates`: Executable profile human gates, scoped approval tokens, and the mandatory security stage with its evidence.

### Modified Capabilities

- `guided-build`: Security-checking becomes mandatory for security-sensitive work, and completion honors a true `humanGate`.
- `human-governance`: An approval record carries the scope fields a gate checks.
- `project-install`: A new init writes the security-sensitive human gate, and a re-init preserves an existing profiles file.

## Impact

- Affected specs: new `risk-gates`; modified `guided-build`, `human-governance`, and `project-install`.
- Affected runtime, when applied: `idefactory approve`, the accept and `awaiting-review` transitions, `idefactory complete`, and `idefactory run` when the next step would cross a gate. `complete` write order stays as it is. The check registry does not gain scanner argv.
- Affected tests, when applied: temp projects with `humanGate` true and false, expired or mismatched approvals, and a security-stage bypass. Ungated orchestration tests stay valid.
- Dependencies: no new package and no model launcher.
- Verification commands for this planning change: `npx openspec validate enforce-risk-gates-and-security-stage --strict` and `npm test`.
- Threats, migration, and rollback are specified in `design.md`. This proposal does not apply, implement, or archive the change.

## Acceptance criteria

- Strict validation of this change passes, and `npm test` still passes with no runtime edits and no `.factory/` execution edits in the planning commit.
- After implementation, a work item whose verification profile has `humanGate: true`, and no valid scoped approval, makes `run` exit 0 with stop reason `human-gate` and no orchestration request when the next step would accept or complete. `complete` exits non-zero and does not mark the item done.
- After implementation, an approval authorizes that step only when change, task, current clean source revision, action (`accept` or `complete`), approver, issuance, expiry, and policy version all match. A missing field, wrong action, wrong task, stale revision, expired window, or different policy version does not authorize.
- After implementation, security-sensitive work cannot move from `verifying` to `awaiting-review`. The move from `security-checking` to `awaiting-review` fails closed without a passing CLI security record and succeeds with one. A non-sensitive item whose `humanGate` is false can still reach review without an approval.
- After implementation, a new init writes `security-sensitive.humanGate` true and `release.humanGate` true, and a second init leaves an existing `profiles.json` byte-for-byte unchanged.
