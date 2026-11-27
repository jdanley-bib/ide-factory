# Design

## Context

In `src/lib/risk-gates.mjs`:

- `ALLOWED_ACTIONS` is `new Set(['accept', 'complete'])`. `validateScopedApproval` rejects any other action, requires the fields `change`, `task`, `sourceRevision`, `action`, `approver`, `issuance`, `expiry`, `policyVersion`, caps lifetime at `MAX_LIFETIME_MS` (24 hours), and rejects an approver equal to the implementer.
- `humanGateAllows` returns false for any action other than `accept` or `complete`, returns true when the profile's `humanGate` is false, and otherwise scans `.factory/approvals/*.json` for a valid record that matches change, task, action, clean HEAD, policy version, and lifetime. It is called from `complete.mjs` and `orchestrate.mjs`.
- `approve` in `src/lib/govern.mjs` requires a clean worktree and a resolvable HEAD, takes `sourceRevision` from HEAD, at policy version 2 confirms the principal through the configured verifier, writes the file, appends `decisions.md`, and appends an `approval.issued` control event.
- `.factory/governance.md` rule 3 says spend, publishing, deployment, and new accounts need `idefactory approve`. No code path can honor that for `deploy`, `publish`, `spend`, or `account`.
- Policy version and principal verification are read from `.factory/config.json` (`governance.policyVersion`).

## Goals / Non-Goals

**Goals:**

- Every action the governance text names can be approved, checked, and revoked.
- An agent can answer "am I authorized?" without writing anything or asking.
- A human can grant a bounded authorization that survives commits.

**Non-Goals:**

- Executing any external effect.
- Weakening the approver or verified-principal rules.

## Decisions

**1. One table in `src/lib/approval-actions.mjs`.**
Rows: `{ id, kind: 'gate' | 'external-effect', binding: 'task+revision' | 'change+target', waivableByProfile }`. `accept` and `complete` are `gate` rows and waivable. `publish`, `deploy`, `spend`, `account` are `external-effect` rows and not waivable. `ALLOWED_ACTIONS`, the validator, `humanGateAllows`, the `approve` usage string, help, and the governance text generator read it. Alternative: extend the set by hand. Rejected: the divergence between the rule file and the code is what caused the present gap.

**2. `humanGateAllows` becomes `authorizes(project, scope)`; the old name stays as a thin wrapper.**
The wrapper keeps the two existing call sites byte-compatible. `authorizes` returns `{ authorized, approvalId?, reason? }`; the wrapper returns the boolean. Waiver logic reads the table row, so a profile cannot waive an external-effect row. Alternative: leave `humanGateAllows` untouched and add a parallel function. Rejected: two matchers would drift.

**3. Reasons are produced by the matcher, not guessed afterward.**
The matcher walks candidate approvals and records the first rejection reason for the closest candidate. Closest means: same change and action, then same task, then same target. With no candidate, the reason is `no-approval`. `dirty-worktree` is reported when the worktree is dirty regardless of candidates, because that alone blocks revision-bound approvals. The reason set is closed and tested so that agents can branch on it.

**4. `authorize` is read-only and exits zero in both cases.**
Exiting non-zero for "not authorized" would be indistinguishable from a command failure in an agent loop. A malformed request (missing change, unknown action) is an error with a non-zero exit. The command is not in `writer-lease.mjs` mutation list, so it works during a halt for reads; `HALT` still stops the effects the skills guard.

**5. `--target` is a required, opaque string for external-effect actions.**
It is validated with the shared identity-like format (letters, digits, `.`, `_`, `:`, `/`, `-`, up to 128 characters) and compared by equality. The factory does not interpret it. Alternative: structured targets. Rejected: it cannot be generic across deployment systems, and equality is enough to stop an authorization for `staging` from covering `production`.

**6. Standing authorization is a separate record shape with its own schema version.**
Schema version 3: `{ schemaVersion: 3, standing: true, change, action, target, approver, principal, issuance, expiry, policyVersion, note }`, no `task`, no `sourceRevision`. Version 1 and 2 records are unchanged and unreadable as standing. It requires a verified principal, so it exists only at policy version 2. It is limited to external-effect actions, so the human can never pre-approve `accept` or `complete`, which would defeat independent review. Alternative: allow standing for gates. Rejected for that reason.

**7. Maximum lifetime is policy, not a flag.**
`.factory/config.json` `governance.standingMaxHours`, default 168, accepted range 1 to 720, any other value ignored in favor of the default. A flag on the command could not make the limit a decision of the project. Per-action approvals keep 24 hours; nothing about them changes.

**8. Revocation is a new record, never an edit.**
`revoke` writes `.factory/approvals/<id>.revoked.json` (change, approval id, revoker, time, note), appends `decisions.md`, and appends a `approval.revoked` control event. Matching reads the revoked set first. This preserves the append-only habit of the approvals directory and is a writer-lease mutation. The revoker identity follows the same rules as the approver: policy 2 needs a verified principal.

**9. The table drives a consistency test.**
A test builds the expected list from the table and checks the governance template, README gates section, governance skill and adapter copies, `help approve`, and the `approve` usage error for exactly that list. Adding an action to the table alone fails the test, so documentation cannot lag.

**10. Skills name the stop condition.**
`factory-governance`, `factory-run`, and `factory-build` say: before any step with an external effect, run `authorize`; continue when `authorized: true`; stop and report the `reason` and the printed `approve` command when false. They also say not to ask the human whether to proceed when `authorized: true`.

## Risks / Trade-offs

- [A standing authorization is abused for a different effect] → Bound to change, action, and target by equality, expires, and is revocable; the effect itself stays outside the factory.
- [Reason for the closest candidate is misleading] → Closeness order is specified and tested with multi-candidate cases.
- [Config maximum raised beyond intent] → Capped at 720 hours; an out-of-range value falls back to the default.
- [Existing wrappers call a removed set] → Wrapper kept; tests for both call sites stay unchanged.

## Migration Plan

No data migration. Existing approval files stay valid. A project that sets no `standingMaxHours` gets 168. Rollback is a code revert: new records with `schemaVersion: 3` are ignored by older builds, so they authorize nothing there.

## Open Questions

- Whether `authorize` should also be exposed through `requirements` once the resolved set from `disclose-effective-requirements` lists external-effect needs; it can be added without changing these specs.
