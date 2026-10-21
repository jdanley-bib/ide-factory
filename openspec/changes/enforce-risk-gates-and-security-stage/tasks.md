# Tasks

## 1. Scoped approval

- [x] 1.1 Add failing tests that a schema version 1 approval records change, task, source revision, action, approver, issuance, expiry, and policy version, and that a missing field, an action other than `accept` or `complete`, an expiry more than 24 hours after issuance, or an approver equal to the implementer is rejected without writing a file. Implement that validator and verify with `node --test test/risk-gates.test.mjs`.
- [x] 1.2 Add failing tests that `approve` with an id, a note, and every scope field writes a JSON approval containing the note and appends that id to `decisions.md`, and that an id and note with a scope field omitted writes no file and appends nothing. A dirty non-run-state tree also writes nothing. Verify with `node --test test/risk-gates.test.mjs`.

## 2. Human gate

- [x] 2.1 Add failing tests that `humanGate: true` without a valid `accept` approval makes `run` exit 0 with stop reason `human-gate`, no orchestration request, and the session still open, and that `complete` without a valid `complete` approval exits non-zero and leaves the work item undone. A missing profile or a non-boolean `humanGate` is treated as true. Verify with `node --test test/risk-gates.test.mjs`.
- [x] 2.2 Add failing tests that a matching `accept` approval allows the accept transition and a matching `complete` approval allows completion, and that a wrong action, wrong task, stale revision, expired window, or different policy version does not authorize. `humanGate: false` on work that is not security-sensitive still reaches review without an approval. Verify with `node --test test/risk-gates.test.mjs`.

## 3. Security stage

- [ ] 3.1 Add failing tests that security-sensitive work rejects a transition from `verifying` to `awaiting-review` and leaves the attempt in `verifying`, that `verificationProfile` alone does not require the security stage, and that the next run request still names the security-reviewer role. Verify with `node --test test/risk-gates.test.mjs test/orchestration.test.mjs`.
- [ ] 3.2 Add failing tests that a transition from `security-checking` to `awaiting-review` is rejected without a passing CLI security record, succeeds when that record is bound to the attempt and the current clean source revision, and is rejected for a recorded red result or a caller-supplied security payload. When no check is security-patterned, the required kind is `threat-review`. Do not add scanner argv to the shipped check registry. Verify with `node --test test/risk-gates.test.mjs`.

## 4. Install and skill text

- [ ] 4.1 Set `security-sensitive.humanGate` to true in the profile template and keep `release.humanGate` true. Add failing install tests that a new init writes both values and a second init leaves an existing `profiles.json` byte-for-byte unchanged. Do not edit this repo's `.factory/profiles.json`. Verify with `node --test test/install.test.mjs`.
- [ ] 4.2 Update the factory-run skill copies under `.cursor/skills`, `.github/skills`, `.agents/skills`, `.claude/skills`, and `templates/skills` so each describes `human-gate` as the stop for a true profile `humanGate` and does not limit that stop to the release profile. The loop still does not pass `--new-run`. Verify by reading those five files in `node --test test/risk-gates.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npx openspec validate enforce-risk-gates-and-security-stage --strict`, `npm test`, and `node src/cli.mjs doctor`. Record the commands and results in this change's implementation notes. Do not start a model, make `complete` transactional, resolve lockout, add a lease, or add CI, provenance, or observability.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request, on a factory run that keeps reviewer and implementer distinct.
- Archive only after that implementation is accepted and the human asks to archive.
