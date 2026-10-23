# Design

## Context

See proposal.md for why this change exists. Today `idefactory status` prints text from `src/lib/govern.mjs`. Scoped approvals are schema version 1 JSON written by `approve` and checked by `humanGateAllows`. Governance policy version defaults to 1 when `config.json` omits it. `checks.json` maps only `unit` after init. Run sessions, attempts, and approvals are already on disk, and nothing aggregates them.

## Goals / Non-Goals

**Goals:**

- One read-only JSON status document and an append-only local event log.
- A verified-principal gate that turns on with policy version 2.
- Doctor warnings and a non-writing check preview.

**Non-Goals:**

- A production identity provider, network verifier, or graphical dashboard.
- Changing policy version 1 authorization behavior.

## Decisions

### Status JSON is a pure function of existing files

`status --json` reads the same sources as text status, plus attempt files, run sessions, and approval files. It prints schema version 1 and returns. It does not take the writer lease. Metrics count records; they do not copy notes or logs.

Alternative considered: a stored metrics database. Rejected because it would be a second status authority that can drift from the files.

### Events append after the successful write

Mutating commands append one JSON line to `.factory/observability/events.jsonl` only after their own write succeeds. The line holds type, time, ids, digests, and exit codes. If the append fails, the command warns and does not roll back. Status does not append.

Alternative considered: failing the command when the log cannot be written. Rejected because a logging fault would block completion that the finalization journal already made durable.

### Policy version 2 is the identity switch

New init writes `governance.policyVersion: 2`. Reinstall does not change an existing value. Version 1 still accepts schema version 1 approvals. Version 2 accepts only schema version 2 approvals whose `approver` equals `principal.subject`. The principal is `{ provider, subject, issuer, verifiedAt }`. `verifiedAt` is the factory clock when the verifier confirms the subject.

The verifier is an argv array in `config.json` at `governance.principalVerifier`. The factory runs it without a shell, with a timeout, and accepts stdout only when it is JSON naming the same provider and subject the caller claimed. No verifier is installed by default. Until a project sets one, policy version 2 `approve` fails closed and writes nothing.

Implementer ids stay local agent ids. Reviewer and lockout resolver must match a verified subject at policy version 2. The same verifier command confirms them at completion and resolution time.

Alternative considered: embedding GitHub or Zoho OAuth in this change. Rejected because the production provider is not selected, and those integrations belong to later stages.

### Check preview infers only unit

`idefactory checks preview` reads profiles and `package.json`. If `unit` is required, missing, and `scripts.test` exists, the preview shows the existing template argv `["npm", "test"]`. It never writes and never spawns that command. Other missing kinds are named without an inferred argv.

## Risks / Trade-offs

- [Policy version 2 cannot approve until a verifier exists] → Doctor says so. Init does not invent a verifier. Tests cover the refusal.
- [A local verifier command can be pointed at a dangerous argv] → The project owner configures it. The factory does not fetch it and does not run it through a shell.
- [Schema 1 approvals silently stop working after a manual version bump] → Doctor warns at version 1. The migration note says to reissue approvals after setting version 2.
- [Event log can lag the action] → The warning is required, and status metrics come from the source records, not from the log.

## Migration Plan

1. Ship the read model and event log first. They do not change authorization.
2. Teach init to write policy version 2 only when `.factory/` is new.
3. Leave existing projects on policy version 1 until an operator sets version 2 and configures `principalVerifier`.
4. Rollback of a new install is returning `governance.policyVersion` to 1. Existing schema 1 approvals then authorize again. The event log may stay; it authorizes nothing.

## Open Questions

None. The production identity provider stays out of this change on purpose.
