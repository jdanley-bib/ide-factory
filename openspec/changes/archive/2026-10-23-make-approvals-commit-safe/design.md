# Design

## Context

See proposal.md for why this change exists. `resolveGitBinding` in `src/lib/verification-evidence.mjs` is the single clean-HEAD check. Verify, approve, the human gate, and complete all use it. It already ignores `.factory/attempts/`, `.factory/work/`, `.factory/orchestration/`, `.factory/observability/`, `.factory/ledger.jsonl`, and `.factory/active-change.json`. It does not ignore `.factory/approvals/` or `.factory/decisions.md`. Approve writes both, after binding `sourceRevision` to the HEAD it just observed. The approve usage line in `src/lib/run.mjs` omits `--principal-provider` and `--principal-subject`, which the approve command already reads.

## Goals / Non-Goals

**Goals:**

- One cleanliness classification, shared by every caller of `resolveGitBinding`.
- Approval JSON and the decisions log no longer invalidate the HEAD they were bound to.
- Approval files remain visible to git so a later commit can keep them as evidence.
- The help line matches the flags approve already accepts.

**Non-Goals:**

- A second cleanliness rule for gates.
- Gitignoring approvals, or detecting whether a `decisions.md` diff is append-only.
- Enforcing `governance.protectedPaths`. That config key is unused by the current code, and this change does not start enforcing it.

## Decisions

### Treat approval output as run-state

Add `.factory/approvals/` to the run-state prefixes and `.factory/decisions.md` to the run-state files. A status line is clean only when every path on it is run-state, which is the rule already implemented. A product edit beside a dirty `decisions.md` still fails.

Alternatives considered:

- Gitignore `.factory/approvals/` and stop appending `decisions.md` until some later commit. Rejected. The approval record requirement requires the decisions entry, and a gitignored approval would not show up in the change that is supposed to carry the evidence.
- Have approve create a git commit. Rejected. The new commit is a different HEAD, so the stored source revision would no longer match.
- Ignore `decisions.md` only when the diff is a pure append. Rejected. `git status --porcelain` does not provide that check, and a hand edit of the governance log is still not product source.

### Name the principal flags in help

Extend the existing approve usage string. Do not change flag parsing.

## Risks / Trade-offs

- [A `decisions.md` edit alone no longer blocks verification] → Product source, tests, OpenSpec, and `checks.json` still do. The file is the append-only governance log, not product source.
- [Committing the approval before the gate is rechecked moves HEAD and the approval stops matching] → Resume the run without an intervening commit. The gate reads the pre-commit HEAD. Committing the approval afterward is fine.
- [Reject also appends `decisions.md`] → That append is the same run-state file, so a rejection no longer blocks the next check by itself.

## Migration Plan

No install or config migration. Existing projects pick up the classification with the code change. Rollback is reverting the two path-list entries and the help string. Approvals already on disk keep their stored source revision.

## Open Questions

None.
