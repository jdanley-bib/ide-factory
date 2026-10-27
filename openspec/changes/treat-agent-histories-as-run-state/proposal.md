# Proposal

## Why

Uncommitted agent histories make the worktree look dirty before accept and complete. `.factory/approvals/` and `.factory/decisions.md` are already factory run-state, so an approval can stay bound to the current HEAD. `.factory/agents/<role>/history.md` is not, and those notes had to be set aside before the clean-HEAD check would pass. Jason Danley asked for this as the fourth of the five stage 1 exit-test improvements on 2026-10-27. He still approves the change before it is executable.

## What Changes

- An uncommitted `.factory/agents/<role>/history.md` no longer makes the worktree dirty for source-revision binding. The same check is what a passing verification, a human gate for accept or complete, and `complete` already use.
- A history note can stay uncommitted while that check still reports the current HEAD. Accept and complete no longer need those files set aside.
- An edit to `.factory/agents/<role>/charter.md`, to `.factory/identity/now.md`, or to product source still makes the worktree dirty. A history edit next to any of those still fails the check.
- Agent history files stay tracked. This change does not gitignore them and does not rewrite existing notes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-evidence`: source-revision cleanliness treats `.factory/agents/<role>/history.md` as factory run-state, including for the clean-HEAD check used by accept and complete.

## Impact

- `resolveGitBinding` in `src/lib/verification-evidence.mjs` is the only cleanliness rule. Verify, import, approve, the human gate, and complete all call it.
- Tests that assert a dirty worktree or a clean HEAD, including `test/approval-run-state.test.mjs`.
- No new dependencies, no policy-version change, and no change to which profiles set `humanGate`.

## Out of scope

- Exit-test item 5.
- Treating `.factory/identity/now.md`, charters, OpenSpec files, tests, product source, or `checks.json` as run-state.
- Gitignoring agent histories, or ignoring a history only when the diff is a pure append.
- Changing the append-only rule for histories, or rewriting notes that are already there.
- A second cleanliness rule that applies only to accept or complete.
- Zoho, Slack, a headless executor, a production identity provider, and merging.
