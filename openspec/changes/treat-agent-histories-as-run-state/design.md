# Design

## Context

See proposal.md for why this change exists. `resolveGitBinding` in `src/lib/verification-evidence.mjs` is the only clean-HEAD check. Verify, import, approve, the human gate, and complete all call it. A status line counts as clean only when every path on it is factory run-state.

The run-state prefixes are `.factory/attempts/`, `.factory/work/`, `.factory/orchestration/`, `.factory/observability/`, and `.factory/approvals/`. The run-state files are `.factory/ledger.jsonl`, `.factory/active-change.json`, and `.factory/decisions.md`. Agent memory lives at `.factory/agents/<role>/charter.md` and `.factory/agents/<role>/history.md`. Only the history file is in this change.

## Goals / Non-Goals

**Goals:**

- One cleanliness classification, shared by every caller of `resolveGitBinding`.
- An uncommitted history file for any role no longer blocks a passing check, a matching accept or complete gate, or complete.
- Charters, `.factory/identity/now.md`, and product source stay dirty.
- History files remain visible to git.

**Non-Goals:**

- A second cleanliness rule for accept or complete.
- Changing `git status` flags. The check keeps `git status --porcelain`.
- Gitignoring histories, or treating a diff as clean only when it is a pure append.
- Moving scribe history off the finalization allowlist. It stays a journaled target. This change only changes whether that path counts as a dirty HEAD.

## Decisions

### Match the history file, not the agents directory

Extend the existing path check so a normalized path matches `.factory/agents/<role>/history.md`, where `<role>` is one directory name and contains no slash. Do not add `.factory/agents/` as a prefix. A charter edit, a nested `history.md`, and a history file outside that layout stay dirty.

A rename line stays clean only when every path on it matches, which is the rule already implemented. Renaming a history file to a charter, or the reverse, stays dirty.

`git status --porcelain` can collapse a brand-new untracked role directory to `?? .factory/agents/<role>/`. That directory path is not a history file, so it stays dirty. The notes that block accept and complete today are edits to history files that already exist, and those show up as the file path.

Alternatives considered:

- Add `.factory/agents/` to the run-state prefixes. Rejected. That would also hide charter edits, and a charter change is team definition, not a session note.
- Hard-code the seven default role names. Rejected. A later roster role would be dirty again, and the layout is already one directory per role.
- Gitignore `history.md`. Rejected. The notes are team memory that later commits are supposed to keep, the same reason approvals stay tracked.
- Ignore a history file only when the diff is a pure append. Rejected. `git status --porcelain` does not provide that check, and the approvals change already refused the same idea for `decisions.md`.
- Commit the history files inside accept or complete. Rejected. A new commit would move HEAD off the revision the passing check recorded.

## Risks / Trade-offs

- [A history edit alone no longer blocks verification, the gate, or complete] → Product source, tests, OpenSpec, `checks.json`, charters, and `.factory/identity/now.md` still do. A history file next to any of those still fails.
- [`.factory/identity/now.md` is still dirty] → Complete writes that file while finalizing. An uncommitted identity note still blocks the next clean-HEAD check. That stays out of scope.
- [Scribe history is both run-state and a finalization target] → The journal still hashes the bytes it writes. Classifying the path as run-state does not skip the journal or change the allowlist.
- [An untracked new role directory stays dirty] → The porcelain collapse is unchanged. Do not switch the status command to untracked-file mode to paper over it.

## Migration Plan

No data migration. Rollback is a revert of this change. Existing history files stay where they are.

## Open Questions

None.
