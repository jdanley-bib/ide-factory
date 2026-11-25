# Design

## Context

`verifyRun` in `src/lib/verification-evidence.mjs` runs a registered argv through `spawnCheck`, which returns `{ exitCode, timedOut, stdout, stderr, spawnError }` and never reports the timeout limit or elapsed time. For a red run whose classification is not `assertion-failure`, the function calls `noteRetry`, saves the attempt, applies the retry cap at four, closes the run session on `vacuous-red` or `retry-cap`, and throws `${classification}: red run did not record an assertion failure for ${kind}`. At that point `startedAt`, `finishedAt`, `stdout`, `stderr`, `timedOut`, and `spawnError` are all in scope, and the only thing kept is the retry counter. See proposal.md for the motivation.

`classifyCheckOutcome` in `src/lib/red-evidence.mjs` already classifies every non-assertion case, and `retryKey` already makes timed-out runs count toward the cap, so the classification and retry logic stay as they are.

## Goals / Non-Goals

**Goals:**
- Give the human the timeout limit, elapsed time, exit code, spawn error code, and log digest for any non-assertion red run.
- Keep the diagnostics on the attempt, so they survive the stop and can be read after the session closes.
- Keep raw output out of every record and message.

**Non-Goals:**
- Changing classification, the retry threshold, or session-closing rules.
- Changing the passing path or the `evidence.reds` shape.
- Adding a command to print diagnostics. The attempt file and the thrown error are the surfaces for this change.

## Decisions

**Diagnostics are built by a pure helper in `red-evidence.mjs`.** A function such as `redFailureDiagnostics({ kind, classification, timedOut, timeoutMs, startedAt, finishedAt, exitCode, spawnError, logDigest, recordedAt })` returns the entry and formats the detail string used by both the infrastructure-failure error and the retry-cap error. This keeps the logic testable without spawning a process, next to `classifyCheckOutcome`. Alternative: inline the object in `verifyRun`. Rejected because the error formatting would then be duplicated across the two throw sites.

**`timeoutMs` is read from the registry entry, not from `spawnCheck`.** `entry.timeoutMs` is already in scope in `verifyRun`, so `spawnCheck` keeps its return shape. Alternative: have `spawnCheck` return the timeout. Rejected as an unnecessary change to a function with two callers.

**Storage is `attempt.evidence.redFailures`, an append-only array.** Each non-assertion red run appends one entry. An array keeps every occurrence, which the retry counter alone cannot do. The number of entries is bounded because `retryKey` caps each kind and classification at four before the session closes. Alternative: one latest entry per kind, like `reds[kind]`. Rejected because the first timeout and the fourth are both useful when diagnosing a repeated failure.

**`spawnError` stores the `code` only.** Node's spawn error message contains the argv path and can echo arbitrary text. Storing the code, for example `ENOENT`, is enough to diagnose a missing binary. Alternative: store the message. Rejected for safety and because the message adds nothing the code does not.

**`logDigest` is `digestBytes(stdout + stderr)`, the same function the passing record already uses.** It identifies the captured log without storing it. The spec forbids raw output in records, so this is the only output-derived value stored.

**`durationMs` is `finishedAt - startedAt` from the timestamps already recorded.** `startedAt` is taken before the spawn, so the duration includes process run time and any time to kill a timed-out child.

**The error keeps the existing prefix and appends the detail.** The thrown message becomes `<classification>: red run did not record an assertion failure for <kind> (<detail>)`, where detail is one of `timed out after <timeoutMs> ms, elapsed <durationMs> ms`, `spawn error <code>`, `exit code <n>`, or `no tests reported`. Existing tests and skills match on `infrastructure-failure` and `retry-cap`, so the prefix must not change.

**Vacuous red uses the same entry.** It shares the branch with infrastructure failures and carries `exitCode: 0`. Recording it keeps the attempt's history complete. This goes beyond the infrastructure-only wording in the proposal's title, but it reuses the same branch and adds no new paths.

## Risks / Trade-offs

- **[Attempt file growth]** Each red run adds one small object. → Bounded by the four-per-key retry cap, so growth is a few entries per kind.
- **[Digest of a short secret-bearing output]** A digest of very short output could be guessed by brute force. → The digest is the same kind already stored for passing records; raw output is never written. Documented in the spec scenarios.
- **[Unknown consumers of `evidence`]** Some code may iterate `attempt.evidence` keys. → Task 3.2 greps for consumers and runs the full suite; `assertSuppliedEvidence` validates only caller-supplied keys, so the new key is not rejected.
- **[Timeout duration precision]** `durationMs` includes kill time after `SIGKILL`. → Acceptable for diagnosis; the spec asks for an elapsed duration, not an exact runtime.

## Migration Plan

Additive change. Attempts written before this change have no `redFailures` key, and readers must treat a missing key as empty. No data migration, no registry or evidence-schema version bump. Rollback is reverting the commit; any `redFailures` entries written by the new code are ignored by the old code.

## Open Questions

None that change the specs or the task breakdown. Surfacing `redFailures` in other CLI status output is deferred and does not change this change's requirements.
