# Proposal

## Why

When `idefactory verify run <attemptId> --check <kind> --red` fails for a reason other than an assertion failure (the command cannot start, times out, reports no tests, or exits zero), the CLI stops with a one-line message such as `infrastructure-failure: red run did not record an assertion failure for unit`. That message drops the facts a human needs to diagnose the stop: whether the run timed out and against what limit, how long it ran, the exit code, the spawn error code, and a digest identifying the captured log. The attempt keeps only a retry counter. Issue #41 reports this as a diagnostic gap on infrastructure failure.

Raw check output must stay out of the factory's records and messages, so the diagnostics are structured metadata plus a digest of the captured log.

## What Changes

- A non-assertion red run SHALL record a structured failure entry on the attempt under `evidence.redFailures`. Each entry carries the check kind, classification, `timedOut`, `timeoutMs`, `durationMs`, `exitCode`, a spawn error code when one exists, `logDigest`, and a timestamp.
- The thrown error for a non-assertion red run SHALL name the classification and the same metadata (timeout limit and elapsed time for timeouts, exit code, spawn error code, log digest).
- A timed-out red run SHALL continue to increment the existing `retryCounts` entry for its kind and SHALL reach the retry cap on the fourth occurrence. The retry-cap error keeps its `retry-cap:` prefix and carries the same metadata.
- Raw stdout and stderr SHALL NOT be written to the attempt, to the thrown error, or to control events. Only the digest is stored.
- `evidence.reds[kind]` and the passing path are unchanged. A non-assertion red entry SHALL NOT create a red record.
- No change to the classification rules, the retry-cap threshold, or the session-closing behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-evidence`: adds a requirement for red failure diagnostics on non-assertion red runs. The existing "Infrastructure failure is not red" and "Vacuous red stores nothing" requirements keep their result names and their no-red-record rule. The new requirement adds the structured metadata, the error content, and the no-raw-output rule.

## Out of Scope

- Changing how `classifyCheckOutcome` classifies results or how `NO_TESTS` matches output.
- Changing the retry-cap threshold or the session-close behavior for `vacuous-red` or `retry-cap`.
- Baseline infrastructure failures from `orchestrate.mjs` and `run.mjs` (the guided-build baseline path). Those paths already stop with `infrastructure-failure` and are not part of `verify run --red`.
- Storing or printing raw check output, or adding a flag to reveal it.
- Changing the factory skills, adapters, or the `red reuse` and `red waive` exception flows.
- Changing non-red `verify run` behavior.

## Impact

- `src/lib/verification-evidence.mjs`: `verifyRun` non-assertion red branch (currently lines ~203-215), and `spawnCheck` wiring so the timeout limit and duration reach the diagnostics.
- `src/lib/red-evidence.mjs`: a pure helper that builds the diagnostics object, colocated with `classifyCheckOutcome`.
- Attempt files under `.factory/attempts/`: a new optional `evidence.redFailures` array. Existing attempts without it remain valid. `assertSuppliedEvidence` only validates caller-supplied evidence keys and is not affected.
- Tests: `test/verification-evidence.test.mjs` gains red-diagnostic cases. `test/run-session.test.mjs` retry-cap expectations stay the same.
- No new dependencies, no schema version change for the check registry or the evidence record.
