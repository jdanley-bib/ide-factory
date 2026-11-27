# Design

## Context

Red evidence today has two human-gated exits for a stored failing red: a waiver with `--invalid-red`, which then satisfies red through the waiver, and a later red after the waiver. Both live in `red-exceptions.mjs`, store an immutable file under `.factory/exceptions/red/`, and require an approver who differs from the implementer and, under policy version 2, a verified principal. The same machinery also enforces that a kind has at most one exception.

The new act is different in kind. It satisfies nothing. It only withdraws the claim that a stored red is genuine. Putting it through the exception machinery would inherit identity rules and the one-per-kind limit that do not fit it.

## Decisions

### D1. A separate record type

Invalidations are stored as immutable files under `.factory/exceptions/red-invalid/`, one per invalidation, bound to the attempt by content digest like exceptions. The path is already run state through the `.factory/exceptions/` prefix. Exceptions and invalidations never share a file, so the exception rules (one per kind, approver identity, principal) are untouched.

### D2. What is recorded

`{ id, attemptId, change, task, kind, invalidatedRedDigest, class, note, by, issuedAt }`. `class` is `post-implementation` (the red was recorded after implementation began) or `wrong-failure` (the test failed, but not on the behavior the task changes, for example a fixture error). The note is stored in the file and not in events. The command refuses when the kind has no failing CLI red on the attempt, when the current red's digest is already invalidated, or when a human waiver or reuse exception already covers the kind.

### D3. Effect on satisfaction

An invalidated red does not satisfy red. The red-satisfaction function treats a kind whose current red digest is invalidated as having no red, and then applies the existing rules in order: a method covering the kind, an exception, or a later red. A later red satisfies only when it is a failing CLI red that started after the invalidation's `issuedAt` and the history still holds the invalidated digest. That is the same rule the human waiver path uses, applied to the invalidation record.

### D4. Effect on methods

`proposeMethod` currently refuses a covered kind that has a stored failing red. It will refuse only when that red has not been invalidated. Everything else is unchanged: a prior method rejection, a lightweight item, and the class-specific rules still apply, and the reviewer still decides the method. `already-satisfied` additionally needs its own vacuous evidence, so a failing-then-invalidated red does not shortcut it.

### D5. Limit

At most two invalidations per kind per attempt. A third is refused with a message that the attempt has used both and the exit is a human waiver (`red waive --invalid-red`). The limit stops a loop of record, invalidate, record, and keeps the cost of the mistake visible to a reviewer.

### D6. Identity

`--by` is required and recorded. It does not have to differ from the implementer and there is no principal check, because the act cannot make a gate pass: the worst case is that an honest red is discarded and a later red or reviewed method is needed. The identity is shown with the record. This is the `agent` authority level that `truthful-authority-levels` names; until that change lands the rule stands here.

### D7. Visibility

Status, the reviewer packet, and the verdict comment list each invalidation with its class, digest, identity, and time, and say that a red ran but was withdrawn as not genuine. A later red appears beside it under the existing "both records are shown" rule.

### D8. Events and lease

`red.invalidated` carries `change`, `task`, `attemptId`, `kind`, `cause` (the class), and `resolver`. The note stays out. The command takes the writer lease and is refused while HALT is set.

## Risks and trade-offs

- An implementer could invalidate a genuine red to choose the method path. The method path needs an independent review and shows the invalidation, and the red's class is recorded, so it is an audited choice and not a bypass.
- Two invalidations per kind is a judgment call. It is a constant in one place and covered by one test.
