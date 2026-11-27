# Tasks

## 1. Action table

- [ ] 1.1 Add `src/lib/approval-actions.mjs` with the six rows and make `ALLOWED_ACTIONS`, `validateScopedApproval`, and the approve usage string read it; verify with unit tests that each action validates and an unknown action is refused with the list of valid actions.
- [ ] 1.2 Replace the body of `humanGateAllows` with `authorizes(project, scope)` returning `{ authorized, approvalId, reason }`, keeping `humanGateAllows` as a wrapper for `complete.mjs` and `orchestrate.mjs`; verify with the existing `test/` approval tests passing unchanged and new tests for each reason value.
- [ ] 1.3 Make external-effect actions ignore the profile `humanGate` value; verify with a test where `humanGate` is false and `deploy` is still not authorized, while `accept` is authorized.

## 2. Approve and target

- [ ] 2.1 Extend `approve` with `--target` for external-effect actions (required for them, validated, stored in the record); verify with tests that a `deploy` approval stores its target, that a missing target writes nothing, and that existing `accept` and `complete` approvals are unchanged.
- [ ] 2.2 Match targets by equality in the matcher; verify with a test that an approval for `staging` does not authorize `production` and reports `target-mismatch`.

## 3. Authorize command

- [ ] 3.1 Add `idefactory authorize` with text and `--json` output, the closed reason set, and the filled-in `approve` command; verify with tests for authorized, no-approval, expired, revision-mismatch, dirty-worktree, same-approver, policy-mismatch, principal-required, and unknown-action, and that the project tree is byte-identical afterward.
- [ ] 3.2 Confirm the command exits zero for both outcomes and non-zero for a malformed request; verify with exit-code tests, and with a test that it is not in the writer-lease mutation list.

## 4. Standing authorization and revocation

- [ ] 4.1 Add `approve --standing` writing a schema version 3 record for external-effect actions at policy version 2 with a verified principal, bound to change, action, and target; verify with tests for success across a HEAD move, refusal for `accept`, refusal at policy version 1, and refusal without a principal.
- [ ] 4.2 Read `governance.standingMaxHours` from `.factory/config.json` (default 168, range 1 to 720) and enforce it; verify with tests for the default, a configured value, an out-of-range value being ignored, and an over-maximum expiry being refused.
- [ ] 4.3 Add `idefactory revoke <id> --note` writing the revocation record, a `decisions.md` entry, and an `approval.revoked` event, and make the matcher honor it; verify with tests that the original file is unchanged, authorize reports `revoked`, and an unknown id writes nothing; add `revoke` to the writer-lease mutation list and verify it is refused during a lease conflict.

## 5. Help, text, and skills

- [ ] 5.1 Add help entries for `authorize` and `revoke`, update `approve` help to list each action with its binding and explain `--target` and `--standing`; verify with `node src/cli.mjs help approve` and `help --json`, and that the global help digest is unchanged in `node --test test/command-help.test.mjs`.
- [ ] 5.2 Update the governance template rule 3, the README gates section, `templates/skills/factory-governance/SKILL.md`, `factory-run`, and `factory-build` to name the table's actions and the authorize-then-stop rule; copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs`.
- [ ] 5.3 Add the consistency test that checks each text and the help against the table; verify that adding a fake row to the table makes the test fail naming the text that lacks it.

## 6. Integration

- [ ] 6.1 Add an end-to-end test: policy version 2 with a stub verifier, record a standing `deploy` authorization for `staging`, move HEAD with a commit, and assert that `authorize` still allows `staging`, denies `production`, and denies after `revoke`; verify the test passes.
- [ ] 6.2 Run `npm test` and `npx openspec validate align-approval-actions --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
