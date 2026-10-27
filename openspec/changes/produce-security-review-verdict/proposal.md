# Proposal

## Why

Stage 1 asked for an agentic security review that produces a verdict. The `post-stored-review-comments` change (PR #17) stores and posts a security-reviewer verdict once one already exists, but nothing requires one to exist: the security-checking handoff accepts any string or no value at all, records no reviewer identity, and has no way to reject. Several past decisions (`.factory/decisions.md`, 2026-10-21/22) worked around this by noting "require a distinct manual security reviewer before the distinct reviewer accepts" instead of the state machine enforcing it. Jason Danley approved this as the second of the five stage 1 exit-test improvements on 2026-10-27 and asked for the draft. He still approves the change before it is executable.

## What Changes

- When a work item requires the security stage, moving an attempt from `security-checking` to `awaiting-review` SHALL require a stored verdict of `ACCEPT` and a security reviewer identity distinct from the implementer. Without both, the transition is rejected and the attempt stays in `security-checking`.
- A stored verdict of `REJECT` with a security reviewer identity distinct from the implementer transitions the attempt directly to `rejected`, the same terminal state the main reviewer already uses, so the existing lockout and reassignment process applies.
- Attempts whose work item does not require the security stage keep today's behavior: an optional verdict, with no forced identity.
- The stored security verdict keeps the reviewer identity that produced it. When a pull request record exists, the comment PR #17 already posts names that reviewer, the same way an accept or reject comment already does.
- Assumption: unit tests exercise this with a work item whose `factory.securityProfile` is `security-sensitive`, driven through the existing stub forge. `npm test` does not call GitHub.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `risk-gates`: moving from `security-checking` to `awaiting-review` requires a stored `ACCEPT` verdict and a distinct security reviewer identity; a stored `REJECT` with a distinct identity ends the attempt
- `pull-request-outer-loop`: a stored security-reviewer verdict also stores and posts the reviewer identity that produced it

## Impact

- Attempt transition for the security-checking handoff (`src/lib/attempt.mjs`).
- The posted security-reviewer comment gains a `Reviewer:` line, matching the existing accept/reject comment.
- No change to the passing CLI security-evidence requirement (`risk-gates` "Security evidence"), to which checks are security-patterned, or to the classifier.
- The check registry stays unit to `npm test`. This change does not add scanner commands and does not make its own tasks security-sensitive.

## Out of scope

- Exit-test items 3 through 5.
- The passing CLI security-evidence gate itself, which security checks exist, or which profiles are security-sensitive.
- Auto-approving, skipping the main reviewer, or merging.
- Launching a model. The IDE session performs the security review and decides the verdict. The factory only validates, records, and posts it.
- Zoho, Slack, a headless executor, and a production identity provider.
