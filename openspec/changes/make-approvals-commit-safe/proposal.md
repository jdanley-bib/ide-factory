# Proposal

## Why

A scoped approval cannot authorize the gate it was written for. `idefactory approve` binds the approval to the current clean HEAD, then writes `.factory/approvals/<id>.json` and appends `.factory/decisions.md`. Neither path is factory run-state, so the worktree is dirty as soon as approve returns. The gate and `complete` both require that same clean HEAD, and committing those files moves HEAD off the bound revision. With policy version 2 now on in this repository, a real gated run cannot record a schema version 2 approval that still authorizes the action.

## What Changes

- Files written by approve (the approval JSON under `.factory/approvals/` and the append to `.factory/decisions.md`) no longer make the worktree dirty for source-revision binding.
- The bound revision stays the HEAD that was clean when approve ran. A later gate on that same HEAD can match the approval without another commit.
- A change to product source, tests, OpenSpec, or `checks.json` still makes the worktree dirty and still refuses a passing check or a gate match.
- Approval files stay committable evidence. This change does not gitignore them.
- The `idefactory approve` usage line names `--principal-provider` and `--principal-subject`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-evidence`: source-revision cleanliness treats `.factory/approvals/` and `.factory/decisions.md` as factory run-state.
- `risk-gates`: an approval still authorizes its action at the same HEAD after approve writes the approval file and the decision entry.
- `human-governance`: the approve usage line names the principal flags the command already accepts.

## Impact

- `src/lib/verification-evidence.mjs`: the run-state path lists used by `resolveGitBinding`.
- `src/lib/run.mjs`: the approve usage line in help text.
- Tests that assert a dirty worktree, a clean HEAD, or the help text.
- No new dependencies, no policy-version change, and no change to which profiles set `humanGate`.
- The last implementation task of this change is gated (`verificationProfile: release`, checks limited to `unit`) so a factory run of this change stops for a real schema version 2 approval.

## Out of scope

- Gitignoring `.factory/approvals/` or moving the decision entry out of `.factory/decisions.md`.
- Changing the rule that an approval authorizes only while its source revision equals the current clean HEAD.
- Changing policy version 1 or 2 authorization, the verifier, or the init template.
- A production identity provider, pull-request automation, or new ticket and chat adapters.
- Treating product edits as clean because `decisions.md` is also dirty. Any non-run-state path still fails the clean check.
