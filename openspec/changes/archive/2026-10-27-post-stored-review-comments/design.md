# Design

## Context

`idefactory pr comment` already posts `evidence.review.verdict` and `evidence.review.role` through the forge port. Accept and reject write the verdict and reviewer id, and they do not write the role, so the comment command refuses them. The run loop never posts. Security-reviewer handoff stores check evidence, not a verdict.

See proposal.md for why this change exists.

## Goals / Non-Goals

**Goals:**

- Store the role beside the verdict the session already supplied.
- Post that stored pair once when a pull request record exists.
- Leave the review transition successful when no pull request has been opened.

**Non-Goals:**

- Creating a verdict, opening a pull request, capturing comments, scaffolding CI, or merging.
- Exit-test items 2 through 5.
- A new forge client or a call to the forge admin API.

## Decisions

### Post at store time

Accept and reject keep today's verdict text. They also set `evidence.review.role` to `reviewer`. If `.factory/pull-requests/<change>.json` exists, the factory posts through the existing comment argv. The pull request record already lists `postedVerdicts`. A pair of attempt id and role already in that list is not posted again.

The security-reviewer handoff may include a verdict. When it does, the attempt stores `evidence.securityReview` with role `security-reviewer` and that verdict, then posts it the same way. When it does not, nothing is written and nothing is posted. The later accept review record stays separate, so the two roles produce two comments.

No pull request record means the store still succeeds. `pr comment` called by hand keeps today's error when the record or the role is missing.

### Stub only in tests

Tests pass the existing stub forge. They assert the comment body contains the role, verdict, and attempt id, that a repeat does not call the forge again, and that a missing record does not call the forge. `npm test` does not run `gh`.

### Completion checks stay unit

Each task sets `checks: [unit]`, `verificationProfile: frontend-low`, and `securityProfile: dependency-basic`. The registry maps only unit to `npm test`. This change does not add a scanner command. Naming the security-reviewer role does not make the task security-sensitive.

## Risks / Trade-offs

- [A local factory run has no pull request] → The verdict is stored and the forge is not called.
- [Accept could overwrite a single review object] → The security-reviewer verdict lives on `evidence.securityReview`, and dedupe is by attempt id plus role.

## Migration Plan

None. Existing attempts gain a role only when they transition after this change.

## Open Questions

None.
