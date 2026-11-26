# Design

## Context

See proposal.md for motivation. Today:

- `waiveRed` in `src/lib/red-exceptions.mjs` checks only for an existing exception on the kind and the stuck signal. It never looks at `evidence.reds[kind]`, so a waiver can sit on a failing CLI red.
- `redSatisfaction` returns `cli` for any failing CLI red before it consults the bound exception, so a waiver on a kind with a real red is inert but still recorded.
- `verifyRun` in `src/lib/verification-evidence.mjs` stores `--red` records at `evidence.reds[kind]` and does not check for an existing exception on that kind.
- `reuseRed` checks that the source red has the right command digest and attempt id, but not that the source red satisfies red on the source attempt.
- `describeException` and `listAttemptExceptions` print "No red ran" for every waiver and reuse, which would be false for an invalidated red.
- `mergeEvidence` in `src/lib/attempt.mjs` never writes `reds`, so the stored red record is changed only by `verify run`.

The exception file, the pointer in `evidence.redExceptions[kind]`, and the digest binding already exist and are immutable. The design reuses them.

## Goals / Non-Goals

**Goals:**

- A human can invalidate a stored failing red and waive it on the same attempt with a recorded reason, the red's digest, and an acknowledgment.
- An invalidated red never satisfies red by itself. It satisfies red only through its waiver while the stored record is unchanged.
- No waiver is recorded over a real red without the invalidation path.
- Display and guidance never say a red ran when the red was invalidated.

**Non-Goals:**

- Detecting post-implementation reds automatically. Detection needs git history and is out of scope.
- Changing the approver rule or the reviewer relationship.
- Migrating existing exceptions.

## Decisions

**1. The invalidation is a flag on `red waive`, not a new command.**
`idefactory red waive <attempt> --kind unit --invalid-red "reason" --note "..." --approver <id> --acknowledge-not-stuck`. The spec allows at most one exception per kind on an attempt, so a separate `red invalidate` verb would need a second record for the same kind and a rule for which one counts. Alternative considered: a standalone `red invalidate` command that rewrites the red. Rejected, because stored reds must not be rewritten.

**2. The record stays `type: waiver`, with an `invalidRed` object.**
`invalidRed` holds `{ reason, kind, redDigest }`. `redDigest` is `sha256` over `canonicalJson` of the stored red record, the same digest function `reuseRed` already uses for `source.recordDigest`. `noRedExists` is false for these records. Alternative: a new exception type `invalid-red`. Rejected: `EXCEPTION_TYPES`, the pointer schema, and every reader would change, for no gain.

**3. `redSatisfaction` consults the invalidation before the CLI red.**
Order: if the bound exception has `invalidRed`, return `waiver` only when the stored red is still a failing CLI red whose digest equals `redDigest`, otherwise `missing`. Otherwise the existing order applies. Old waivers without `invalidRed` keep their behavior exactly.

**4. `verify run --red` refuses a kind with an exception, before spawning the check.**
Refusing before the spawn means the run cannot overwrite a stored red. This keeps the digest binding true, and no code path that was reachable before changes meaning. Alternative: allow a new red and clear the exception. Rejected: it erases the invalidation record's effect silently.

**5. `waiveRed` refuses a real red unless `--invalid-red` is given.**
For each kind: if `--invalid-red` is given, require a failing CLI red and `acknowledgeNotStuck`, and record the invalidation. If not, refuse when a failing CLI red exists, naming the red and `--invalid-red`, then apply the existing stuck rules. The refusal uses the same kind-by-kind loop, so one bad kind records nothing for any kind. A bare `--invalid-red` (value `true`) is refused as "needs a reason", since `parseArgs` gives a bare flag the value `true`.

**6. `reuseRed` requires `redSatisfaction(source, kind) === 'cli'`.**
This replaces the bare `isFailingRed` check with the satisfaction rule, so an invalidated source red is refused. The source's own red digest check against the registry stays.

**7. Display uses the record's own fields.**
`listAttemptExceptions` sets `noRedRan: false` and adds `invalidRedDigest` and `invalidRedReason` for these records. `describeException` returns a sentence naming the digest and reason and saying the red does not satisfy red. Status, the packet, and the verdict comment all call `describeException`, so they change together.

## Risks / Trade-offs

- [An undetected post-implementation red is still recorded as genuine] -> The CLI cannot tell, and the rule is that the implementer or reviewer must invalidate it. The reviewer charter and skills say so. Stated as a limitation in the proposal.
- [Older waivers over real reds remain on disk and look valid] -> They keep their current behavior; no record is rewritten. The new refusal applies only to new waivers.
- [Acknowledgment can be given by an agent] -> The approver rule and the human-approval guidance are unchanged. This does not add a new trust boundary.
- [A digest mismatch after manual edit blocks the transition] -> That is the intended fail-closed behavior, and the error should name the kind. Tests cover it.
- [Refusing `--red` on an excepted kind may surprise an implementer who waived and then wants a red] -> The message names the existing exception; the waiver is final for that kind on that attempt.

## Migration Plan

No data migration. Existing `.factory/exceptions/red/` files and attempt pointers are read as before. Rollback is a code revert: records written by the new code carry an extra `invalidRed` field that older readers ignore, and `noRedExists: false` on those records would only be read by the older `describeException`, which would print "No red ran" for them. Rollback therefore notes that older builds mis-describe invalidated reds.
