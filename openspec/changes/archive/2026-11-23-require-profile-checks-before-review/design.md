# Design

## Context

Three places decide whether an attempt has enough verification evidence:

- `stageForState` in `src/lib/orchestrate.mjs` picks the next role. For `verifying` it always returns the reviewer, with no check of recorded evidence.
- `transitionAttempt` in `src/lib/attempt.mjs` guards the moves into `awaiting-review`. It refuses only security-stage bypasses.
- `requiredChecksFor` and `assertChecksPassed` in `src/lib/complete.mjs` decide what completion needs. The first returns the item's `checks` when set, otherwise the profile's, otherwise `['unit']`. The second matches each required kind against a passing record bound to the attempt, the registry command digest, and the clean HEAD.

`complete.mjs` already imports from `attempt.mjs`, so `attempt.mjs` cannot import the matching logic from `complete.mjs` without a cycle. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals**
- One definition of the required set and one predicate for "passing record", used at handoff, at review entry and at completion.
- The handoff request names each missing check.
- An unknown profile refuses instead of falling back to `unit`.

**Non-Goals**
- Changing the red gate or any test-kind rule.
- Changing how classification infers a profile for other projects.
- Changing the attestation format or the record fields.

## Decisions

**Shared module `src/lib/required-checks.mjs`.** It exports `requiredChecksFor(project, item)`, which returns the union in profile-then-item order without duplicates, and throws for an unknown profile. It also exports `missingChecks(project, attempt, item)`, which runs the per-kind matching now in `assertChecksPassed` and returns the kinds that lack a passing record. `complete.mjs` and `attempt.mjs` both import from it. The matching code moves rather than being copied, so the two paths cannot drift. Alternative considered: keep the matching in `complete.mjs` and duplicate a looser check at handoff. Rejected because the two would disagree on what counts as passing, which is the failure mode #36 describes.

**Guard in `transitionAttempt`, not only in the orchestrator.** The orchestrator's routing is advisory: a caller that sends `awaiting-review` directly would skip it. The transition guard is the enforcement, and the orchestrator message is the guidance. The guard runs for every caller, including internal ones, because the check is a state precondition rather than caller-supplied evidence.

**Handoff routes to the implementer while checks are missing.** When `missingChecks` is non-empty in `verifying`, the orchestrator returns the implementer role with `nextState` `awaiting-review` and a message that names the missing kinds and `idefactory verify run --check <kind>`. The security route is taken only after the required set is complete. Alternative considered: keep routing to the reviewer and let the reviewer reject. Rejected because it spends a review cycle on a known gap.

**Unknown profile throws, and the throw is caught at each boundary.** The orchestrator reports it as a stop with the profile name. `complete` and the transition refuse with the same message. Existing items all name profiles that exist in `.factory/profiles.json` (`docs`, `frontend-low`, `backend-api`, `security-sensitive`), so no current item changes outcome.

**`cli` profile by explicit annotation, not by changing inference.** `.factory/profiles.json` in this repository gains `"cli": { "checks": ["unit"], "humanGate": false }`. New items in this repository set `verificationProfile: cli` in their `factory:` annotation. `inferVerificationProfile` is unchanged, so other projects keep their current defaults. Alternative considered: make `general` tasks infer `cli`. Rejected because it would silently drop `build` for every project that infers `general`. The name `cli` is a choice made here; it is a one-line rename before archive if you prefer another.

**Test fixtures move to `cli`.** The orchestration helper `seedChange` writes `verificationProfile: frontend-low` with `checks: [unit]`, so it would now require `build`. It switches to `cli`. Tests that exercise profile-only checks use `frontend-low` explicitly and record `build`.

## Risks / Trade-offs

- [Items in progress in other projects stop at handoff until the missing checks are recorded] → The request names the checks and the role, so the fix is a verify run, not a code change. This repository has no items in progress.
- [Existing installs do not get the `cli` profile] → The release notes say to add it to `.factory/profiles.json`. Until then, items annotated `cli` refuse with the unknown-profile error, which names it.
- [The orchestrator's unchanged-state stop may end a session after a handoff refusal] → Expected. The session restarts after the engineer records the check, because the attempt fingerprint changes.
- [Moving the matching code could change a message] → Keep the existing completion messages by having `complete.mjs` map `missingChecks` results to the same text. The existing completion tests assert those messages.

## Migration Plan

- Ship the `cli` entry in `templates/factory/profiles.json` and this repository's `.factory/profiles.json` together.
- Release note: projects that want `cli` add the entry to `.factory/profiles.json` by hand, because `upgrade` does not rewrite team state.
- Rollback: revert the guard and the orchestrator branch. No stored attempt or work-item format changes.

## Open Questions

None for this change. The `security-sensitive` `humanGate` difference between the template and this repository's `.factory/profiles.json` is a separate discrepancy, not addressed here.
