# Design

## Context

See proposal.md for motivation. Today:

- `classifyTask` in `src/lib/classify.mjs` returns `taskType` as the explicit value, or `lightweight` for an inferred `docs` kind, or `code`. The stored work item holds only the result, so an explicit `code` and an inferred `code` look the same.
- The red gate is `redSatisfaction(project, attempt, kind)` in `src/lib/red-exceptions.mjs`. It returns `cli`, `reuse`, `waiver`, or `missing`. The gate into `verifying` in `src/lib/attempt.mjs`, completion in `src/lib/complete.mjs`, and the run request in `src/lib/orchestrate.mjs` all call it.
- Exceptions are immutable files under `.factory/exceptions/red/` bound to the attempt by a digest pointer in `evidence.redExceptions[kind]`, and they require a human approver who differs from the implementer.
- Transition evidence keys are a closed list, and the reviewer's verdict travels on the `accepted` and `rejected` transitions.
- The requirement set for an item comes from `disclose-effective-requirements`. This change reads the red kinds from that set and does not depend on its code landing first, but its tasks assume the single resolver exists.

## Goals / Non-Goals

**Goals:**

- The agent can pick `no-red` without a human, and a different role must agree before the attempt can be accepted.
- The choice is explicit, auditable, immutable, and never displayed as a red or an exception.
- A human's explicit class always wins.

**Non-Goals:**

- Detecting write order, scenario-based classification, or characterization-first.
- A human approval path for `no-red`.

## Decisions

**1. A new record type, not an exception.**
An exception means "a human authorized that no red ran" and requires an approver. A method means "the agent judged a red is not a fit, and a reviewer agreed". Folding it into exceptions would either demand a human approver or dilute the exception's meaning. `redSatisfaction` gains a fifth value, `method`, and every consumer that already prints the source gets a distinct label. Alternative: a new `type: method` inside `EXCEPTION_TYPES`. Rejected for the reason above.

**2. Same file-plus-digest binding as exceptions.**
The proposal writes `.factory/methods/<id>.json` with `wx`, then stores `{ id, digest }` under `evidence.method`. A reader re-hashes the file and returns null for a missing or altered file, so the gate fails closed. The method review is a second immutable file bound under `evidence.methodReview`, written after the method and naming its digest. Method records are run-state like exceptions and approvals, so `.factory/methods/` joins the run-state prefixes; otherwise writing a record would dirty the tree and invalidate approvals and verification evidence bound to a clean HEAD. Alternative: a transition evidence key `methodVerdict`. Rejected: it widens the closed key list for one use, and the review has to exist before the `accepted` transition is attempted anyway.

**3. The reviewer decision is a command, enforced at `accepted`.**
`attempt.mjs` already has a precondition block for `accepted`. It gains: when `evidence.method` is `no-red`, a valid `ACCEPT` method review whose reviewer differs from the implementer must exist. A `REJECT` review makes the precondition fail with the review's note, and the reviewer then rejects the attempt in the usual way. The retry path is unchanged.

**4. A marker for explicit class.**
`classifyTask` adds `taskTypeSource: 'explicit' | 'inferred'` to its result. Sync writes it with the rest of the classification. Items written before this change have no marker, and a missing marker is treated as explicit, because the safe reading is that a human may have chosen the class. Alternative: infer explicitness by re-parsing `tasks.md` at proposal time. Rejected: it adds a second reader of the plan file and can drift from the stored item.

**5. Proposal window and what it records.**
The proposal is allowed in `planned`, `assigned`, or `implementing`, and only when no failing red or exception exists for a covered kind. It records the HEAD revision and the number of changed files from `git status`. The CLI cannot tell whether those changes are production code, so it shows them to the reviewer and does not decide. Alternative: refuse a proposal if the worktree is dirty. Rejected: a legitimate attempt can have unrelated dirt, and refusing would force a human to clean it.

**6. Reason classes carry a deterministic check where one exists.**
`behavior-preserving` is the class most likely to be abused, so it requires a cited test path that exists and is tracked (`git ls-files --error-unmatch`). The other classes have no mechanical check; the reviewer is the control. Alternative: require a scenario link from `tasks.md`. Rejected: tasks do not link to scenarios today, and adding that link would change how humans author plans.

**7. Rejection is sticky per item and does not loop.**
If any earlier attempt of the item has a `REJECT` method review, proposals for the item are refused. The attempt then follows the existing retry cap and exception paths. This bounds the disagreement to one round and needs no new counter. A human is not prompted by this; the existing rejected-attempt handling and retry cap apply.

**8. Run and packet wording.**
The implementing-stage request for an inferred-class `code` item with test kinds adds one sentence: if a failing test cannot specify the change, record a `no-red` method with `idefactory method propose` before editing. The review-stage request adds the method review step for `no-red` attempts. Neither changes `nextState` or the exit codes.

## Risks / Trade-offs

- [An agent proposes `no-red` to avoid effort] → The reviewer must accept, the reason class is closed, `behavior-preserving` needs a real tracked test, rejection is sticky, and the verdict comment shows the method to the human reading the pull request.
- [A reviewer rubber-stamps the method] → The reviewer packet states the revision and changed-file count at proposal and tells the reviewer to reject a class that does not fit the diff. The control is review quality, as it is for the rest of review.
- [Old items without the marker cannot take a `no-red` method] → They behave exactly as today. A fresh `sync-tasks` writes the marker.
- [A proposal made after production code is written looks the same as an honest one] → Stated as a limitation. Honest verification still requires passing checks at a clean HEAD and an independent review, and the changed-file count is visible.
- [Two sources of truth for "red satisfied"] → `redSatisfaction` stays the single function, and the drift test from `disclose-effective-requirements` extends to forbid reading `evidence.method` elsewhere.

## Migration Plan

No data migration. Attempts without `evidence.method` behave as before. New records live in a new directory and use a schema version field. Rollback is a code revert: older builds ignore `evidence.method` and would then require a red for kinds a method covered, which is the pre-change behavior.

## Open Questions

- Whether the sticky rejection should expire when a human edits the task text. The current rule needs no answer to ship, and expiry can be added without changing the specs.
