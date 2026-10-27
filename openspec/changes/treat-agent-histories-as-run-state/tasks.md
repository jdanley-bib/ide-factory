# Tasks

## 1. History files count as run-state

- [x] 1.1 Add a failing test in `test/agent-history-run-state.test.mjs` on a temporary project, using the same init-and-commit setup as `test/approval-run-state.test.mjs`. After the checkpoint commit, an uncommitted `.factory/agents/engineer/history.md` leaves `resolveGitBinding` clean at that HEAD, and `verify run` for a registered unit check records `passed` true with that source revision. The same holds when the only uncommitted path is `.factory/agents/reviewer/history.md`. An accept approval bound to that HEAD still authorizes accept when the only extra uncommitted path is an agent history file, and a complete approval does the same for complete. On an accepted `frontend-low` attempt with distinct role ids and a passing unit attestation at HEAD, `completeWorkItem` does not fail because the worktree is dirty when the only extra uncommitted path is `.factory/agents/engineer/history.md`, and the work item is done. A modified `.factory/agents/engineer/charter.md`, a modified `.factory/identity/now.md`, a modified `.factory/agents/engineer/notes/history.md`, and a product source file next to a history file each keep the worktree dirty, and a check in those cases does not record a pass. `git check-ignore` does not ignore `.factory/agents/engineer/history.md`. Verify the test fails with `node --test test/agent-history-run-state.test.mjs` before the run-state change.
  - Uncommitted agent histories no longer block the clean-HEAD check, and the other named paths still do.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.2 Treat `.factory/agents/<role>/history.md` as factory run-state inside the existing clean-HEAD check, for any single role directory. Do not add `.factory/agents/` as a prefix, do not gitignore history files, and do not change the `git status --porcelain` invocation. Verify with `node --test test/agent-history-run-state.test.mjs` and `node --test test/approval-run-state.test.mjs`.
  - History files stay on the current HEAD, and approval run-state behavior stays as it is.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

## Workflow follow-up

- Jason approves this change before it is executable. Do not sync tasks until then.
- Do not start exit-test item 5 from this change.
- Archive only after implementation and review, in a later request.
