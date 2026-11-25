# Tasks

## 1. Diagnostics helper

- [x] 1.1 Create `test/red-evidence.test.mjs` with failing unit tests for `redFailureDiagnostics` covering a timed-out outcome (`timedOut`, `timeoutMs`, `durationMs`, no `exitCode` needed), a spawn error (`spawnError` code only, no message), a non-zero exit, and a no-tests outcome; verify `node --test test/red-evidence.test.mjs` fails on the missing export
- [x] 1.2 Implement `redFailureDiagnostics` in `src/lib/red-evidence.mjs` returning `{ kind, classification, timedOut, timeoutMs, durationMs, exitCode, spawnError, logDigest, recordedAt }` and a `describeRedFailure` detail string; verify `node --test test/red-evidence.test.mjs` passes
- [x] 1.3 Add unit tests that `describeRedFailure` produces `timed out after <timeoutMs> ms, elapsed <durationMs> ms`, `spawn error <code>`, `exit code <n>`, and `no tests reported`, and that the spawn error message text is never included; verify the same test file passes

## 2. Record and report in verifyRun

- [x] 2.1 Add failing integration tests in `test/verification-evidence.test.mjs` that run `idefactory verify run --red` against a registered argv that sleeps past a small `timeoutMs`, a missing binary, and a `no tests` exit; verify each test asserts a `redFailures` entry on the attempt and the matching detail in the thrown error, and that the tests fail before implementation
- [x] 2.2 Pass `timeoutMs` from the registry entry and append the diagnostics entry to `attempt.evidence.redFailures` in the non-assertion branch of `verifyRun` before the attempt is saved; verify the 2.1 tests pass
- [x] 2.3 Change the infrastructure-failure throw in `verifyRun` to append the `describeRedFailure` detail in parentheses, keeping the `<classification>:` prefix; verify the existing assertions on `infrastructure-failure` in `test/verification-evidence.test.mjs` still pass
- [x] 2.4 Add an assertion in the 2.1 tests that `evidence.reds` has no entry for the failing kind and that `hasAnyFailingRed` is false; verify the test passes

## 3. Retry cap and secrecy

- [x] 3.1 Add a failing test in `test/verification-evidence.test.mjs` that a fourth timed-out red run for `unit` on one attempt closes the session with `retry-cap`, the error begins with `retry-cap:`, and it includes the timeout limit; verify it fails before the retry-cap throw is changed in 3.2
- [x] 3.2 Apply the same diagnostics to the retry-cap throw in `verifyRun` and confirm the test from 3.1 passes with the retry counter at four; verify `node --test test/run-session.test.mjs` passes, including the existing retry-cap cases at lines around 1422-1450
- [x] 3.3 Add a test in which the check writes a distinctive sentinel string to stdout and stderr, fails without an assertion, and verify that the sentinel is absent from the attempt JSON, the thrown error, and the control event log, and that `logDigest` matches `sha256:` plus 64 hex characters
- [x] 3.4 Grep `src/` for readers of `attempt.evidence` keys and confirm none iterate or reject unknown keys in a way that breaks on `redFailures`; record the result in a one-line note in the commit message; verify with `rg -n "evidence\)" src` and the full test run in 4.1
- [x] 3.5 Add a test that a legacy attempt without `redFailures` still reads and passes `verify run --red` for an assertion failure; verify the test passes

## 4. Integration checks

- [x] 4.1 Run the full suite with `npm test`; verify it exits zero with no failing tests
- [x] 4.2 Run `npm run secretlint`; verify it exits zero, since the new tests contain a sentinel string
- [x] 4.3 Run `openspec validate red-run-failure-diagnostics --strict`; verify it reports the change as valid
