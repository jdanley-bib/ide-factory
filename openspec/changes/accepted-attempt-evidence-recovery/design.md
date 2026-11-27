# Design

## Context

See proposal.md for motivation. Today:

- `TRANSITIONS` in `src/lib/attempt.mjs` has `accepted: ['finalized', 'finalize-failed']`. `attempt transition` rejects any other target, and the lifecycle help prints that table.
- `requireBeforeVerifying` in `src/lib/red-exceptions.mjs` allows `planned`, `assigned`, `implementing`, and `red-confirmed`. Reuse and waive both call it.
- `reuseRed` needs a `rejected` source attempt. An accepted attempt has none, so reuse cannot help.
- The accepted attempt's review lives in `evidence.review`, with `reviewerId` on the attempt. `complete` requires an accepted attempt or a matching finalization journal.
- Passing attestations are judged at completion time against the current clean HEAD, so a missing or stale check can be re-run with `verify run` without any state change.
- Exceptions and methods are immutable files bound to the attempt by digest. Neither needs the attempt to be in a particular state to be written; the state rule lives in the command that creates them.

## Goals / Non-Goals

**Goals:**

- A reviewed attempt with one unmet red can be fixed without losing its history or its evidence.
- The recovery needs the same authority as the equivalent step on a fresh attempt, plus a fresh independent review.
- The path is bounded and cannot be used to loop.

**Non-Goals:**

- Letting an exception be written against an `accepted` attempt without review.
- Editing or superseding stored records.

## Decisions

**1. A dedicated command and mutation, not a new `TRANSITIONS` edge.**
`attempt reopen` is a separate function in `src/lib/attempt-reopen.mjs` that writes the state change, the history entry, and the reopen record in one atomic attempt-file write. The generic `attempt transition` keeps refusing `accepted` to `awaiting-review`, so no caller can reopen by supplying evidence. The lifecycle help adds a note that `reopen` exists as the only route out of `accepted` other than finalization. Alternative: add the edge to `TRANSITIONS`. Rejected: the transition command would then need to guard it by evidence, and every consumer of the table (help, drift tests) would present it as ordinary.

**2. Return to `awaiting-review`, not to `verifying`.**
The checks and their attestations are still valid, and the reviewer's old verdict is the only thing the amended evidence invalidates. Going to `awaiting-review` means exactly one new decision is needed. Alternative: return to `verifying`. Rejected: it implies re-running checks that did not change and may trigger the security stage again.

**3. The reopen carries a scope, and the scope gates the amendment.**
`evidence.reopens` is a list of `{ at, by, purpose, kinds, reason, priorReviewDigest }`. The reopen window is the last entry whose attempt state is not yet `accepted` again. `requireBeforeVerifying` becomes `requireAmendable(target, kinds)`: pre-verifying states pass as before; `awaiting-review` passes only for kinds named by the open reopen. The exception and method commands call it with their kinds. Alternative: let waive work on any non-final state. Rejected: it would allow an exception after review without telling the reviewer.

**4. Authority follows purpose.**
`--for method` needs an identity that differs from the implementer and, under policy version 2, the reviewer's verified-principal rule, because the method route is meant to be taken by an autonomous run. `--for exception` reuses `authorizeApprover`, so a human approves exactly as for an exception on a fresh attempt. The reopen itself adds no new human step beyond what the amendment needs. Alternative: always require a human. Rejected: it makes the common case (a red that does not fit) human-gated and contradicts #51.

**5. Reopen counts as the stuck signal.**
`red waive` warns a human to let the system become stuck first. A reviewed attempt that cannot complete is stuck by definition, so the waiver records `acknowledgedNotStuck: false` and does not demand the flag for a reopened kind. The warning stays for every other case.

**6. Keep review history in an array.**
`evidence.review` stays the current verdict so every reader keeps working. Reopen copies it, with its digest, into `evidence.reviewHistory` and clears the current verdict, because the attempt is back in review. The packet and verdict comment read the history. Nothing is deleted, and the history entry's digest lets a later reader confirm it was not edited.

**7. Bounded and fail-closed.**
At most two reopens per attempt, counted from `evidence.reopens`. A finalization journal or a `finalize-failed` state refuses the reopen, because finalization has begun and its recovery rules (`recoverable-finalization`) own that path. After the limit, the refusal names the limit. Recovery beyond it is not supported, and the message says so instead of pointing at another command; `actionable-blocked-states` will carry that into the machine-readable form.

**8. Completion's message names the command.**
The missing-red error in `src/lib/complete.mjs` adds one sentence when the attempt is `accepted`. This is the discoverability gap in the issue: the documented transitions did not show a route.

## Risks / Trade-offs

- [A reviewer approves again without looking] → The packet leads with the reopen, the kinds, the earlier verdict, and the amendment record, and the verdict comment shows the same text. Review quality is the control, as for any review.
- [`--for method` lets an agent loop through reopen, propose, reject, reopen] → Bounded by two reopens, and a rejected method is sticky per item under `red-method-selection`.
- [A second reviewer identity is needed] → The existing separate-reviewer rule already requires one; a reopen reuses it. A lockout on the only reviewer leaves the attempt blocked, which is the existing behavior.
- [Reopen for an exception still needs a human] → That is the designed boundary: an exception means a human authorizes that no red ran.

## Migration Plan

No data migration. Attempts without `evidence.reopens` behave as before. Rollback is a code revert: an attempt reopened under the new code sits in `awaiting-review` with a review history that older builds ignore, and older builds then handle it as an ordinary attempt in review.
