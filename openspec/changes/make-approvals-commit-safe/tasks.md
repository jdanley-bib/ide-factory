# Tasks

## 1. Approval output stays on the bound revision

- [x] 1.1 Add a failing test that a worktree dirty only under `.factory/approvals/` or only in `.factory/decisions.md` still binds the current HEAD, that a product source edit beside `.factory/decisions.md` does not, and that a successful approve still authorizes its action at that same HEAD. Verify the test fails with `node --test test/approval-run-state.test.mjs` before implementation.
- [x] 1.2 Treat `.factory/approvals/` and `.factory/decisions.md` as factory run-state and leave `.factory/approvals/` tracked. Verify with `node --test test/approval-run-state.test.mjs`.

## 2. Approve usage names the principal flags

- [x] 2.1 Add a failing test that the printed approve usage line includes `--principal-provider` and `--principal-subject`. Verify the test fails with `node --test test/approve-help.test.mjs` before implementation.
- [x] 2.2 Add those flags to the approve usage line. Do not write an approval file from this task. Verify with `node --test test/approve-help.test.mjs`.
  - The printed usage line names both principal flags.
  factory:
    verificationProfile: release
    checks: [unit]
    dependencies: ["1.2", "2.1"]

## Workflow follow-up

- When task 2.2 stops at `human-gate`, approve `accept` and then `complete` as `jason-danley` with `--principal-provider local` and `--principal-subject jason-danley`, and resume the run without committing in between.
- Confirm `idefactory status --json` shows a schema version 2 approval count and a `human-gate` stop reason.
