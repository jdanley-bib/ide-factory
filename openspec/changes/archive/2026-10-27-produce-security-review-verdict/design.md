# Design

## Context

`security-checking` → `awaiting-review` today requires only that `assertPassingCliSecurityEvidence` find a passing CLI record for each required security check kind (`src/lib/risk-gates.mjs`). The handoff's `evidence.verdict` is an optional, unvalidated string (`src/lib/attempt.mjs` `securityHandoffVerdict`): any non-empty string becomes a stored `evidence.securityReview.verdict`, no reviewer identity is recorded, and there is no path to reject from this stage. PR #17 posts whatever verdict is stored, but nothing makes a security-sensitive attempt actually produce one with an attributable identity, and decisions.md repeatedly papers over this with a manual note instead of an enforced step.

See proposal.md for why this change exists.

## Goals / Non-Goals

**Goals:**

- For a work item whose factory metadata requires the security stage, require an `ACCEPT` verdict and a security reviewer identity distinct from the implementer before the attempt can move on, or allow a `REJECT` verdict with that same distinctness to end the attempt directly.
- Thread the security reviewer identity through to the stored evidence and the posted comment.
- Leave attempts not backed by a security-stage work item on today's optional-verdict behavior.

**Non-Goals:**

- Changing the passing CLI security-evidence requirement, which checks are security-patterned, or which profiles are security-sensitive.
- A new forge client, a forge admin API call, or a change to merge behavior.
- Exit-test items 3 through 5.

## Decisions

### Gate on `requiresSecurityStage(item)`, not on attempt state alone

`src/lib/risk-gates.mjs` already exports `requiresSecurityStage(item)`, used by the existing security-stage requirement. The new verdict requirement reuses it: `validateEvidence` in `src/lib/attempt.mjs` looks up the work item for the attempt (`getWorkItem`) and applies the new checks only when `requiresSecurityStage(item)` is true for that item. An attempt with no backing work item (as several existing unit tests construct directly) is unaffected, preserving the current "handoff with no verdict writes nothing and posts nothing" test behavior for those ad hoc attempts. Real work items created through `sync-tasks` always carry `factory` metadata, so this does not weaken the gate for production use.

### New transition: `security-checking` → `rejected`

`TRANSITIONS['security-checking']` gains `rejected` alongside `awaiting-review`. `rejected` is already a terminal state (`TRANSITIONS.rejected = []`), so no other state-machine change is needed. This lets a security reviewer's negative decision end the attempt the same way the main reviewer's rejection does, so the existing `idefactory lockout create` and reassignment process applies without new code.

### Validation shape

When `requiresSecurityStage(item)` is true and the attempt is leaving `security-checking`:

- `nextState === 'awaiting-review'` requires `evidence.verdict` to uppercase to `ACCEPT` and `evidence.securityReviewerId` to be a non-empty string that differs from `attempt.implementerId`. Either failing throws, so the attempt stays in `security-checking` (existing `transitionAttempt` behavior: validation throws before any write).
- `nextState === 'rejected'` requires the same shape with `REJECT` instead of `ACCEPT`.
- When `requiresSecurityStage(item)` is false, no new requirement applies; the existing optional-verdict behavior from PR #17 is unchanged.

### Evidence and posting

`attempt.evidence.securityReview` gains `reviewerId`: `{ verdict, role: 'security-reviewer', reviewerId: securityReviewerId, notes, at }`. The existing generic block that sets `evidence.review` on `accepted`/`rejected` runs only when the *previous* state was `awaiting-review` (checked via `attempt.state` before it is reassigned to `nextState`), so a `security-checking` → `rejected` transition writes `evidence.securityReview` with role `security-reviewer` and does not disturb `evidence.review`. The existing `postVerdictComment` call for the security path now passes `reviewerId: securityReviewerId`, so the posted comment gains the `Reviewer:` line the accept/reject comment already has. Dedupe by attempt id plus role (already shipped in PR #17) is unchanged and also covers the new reject path.

### Tests stay on the stub forge, checks stay unit

New tests build a work item whose `factory.securityProfile` is `security-sensitive` (or a security-patterned check) so `requiresSecurityStage` is true, then drive the transition through the stub forge the same way `test/review-comment.test.mjs` already does. `npm test` does not run `gh`. Each task sets `checks: [unit]`, `verificationProfile: frontend-low`, and an explicit `securityProfile: dependency-basic` so the classifier's `/security/i` text match does not mark these tasks themselves security-sensitive — the same pattern `.factory/decisions.md` already records for prior security-adjacent tasks.

## Risks / Trade-offs

- [An ad hoc attempt with no backing work item silently skips the new gate] → Intentional: those are test constructs; real work items from `sync-tasks` always carry `factory` metadata, so production attempts are covered.
- [Reusing the `rejected` terminal state for both the main reviewer and the security reviewer could blur which role rejected] → `evidence.securityReview` (not `evidence.review`) records the security path distinctly, and the posted comment names the role and reviewer, so the history is attributable.

## Migration Plan

None. Existing attempts gain the requirement only the next time they attempt to leave `security-checking` for a work item that requires the stage.

## Open Questions

None.
