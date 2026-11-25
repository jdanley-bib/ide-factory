# Tasks

## 1. Record fingerprints and the validity rule

- [x] 1.1 Write `configDigest` (SHA-256 of canonical `{ argv, cwdPolicy, timeoutMs, artifacts }`) and `environment` (`node`, `platform`, `arch`) on every CLI record in `verifyRun`. Verify: a test runs `verify run` and reads both fields from the stored record, and changing only the registry `timeoutMs` produces a different `configDigest`.
- [x] 1.2 Implement `recordValidity` in `src/lib/verification-evidence.mjs` with the eight-step algorithm in the design, and a single git snapshot helper that returns head, worktree cleanliness, and dirty non-run-state paths. Verify: a table-driven test covers a run-state commit (valid), a product commit (stale, names the path), a `checks.json` commit (stale), a timeout change (stale), a non-ancestor revision (stale), a product-to-run-state rename (stale), a bogus revision (stale, git error reason), and a record without `environment` (stale, `re-run verify`).
- [x] 1.3 Keep imported attestations exact-HEAD only inside `recordValidity`. Verify: a test imports at revision R, commits a run-state file, and sees the import reported stale with the exact-revision reason; a second import at the new HEAD is valid.

## 2. One rule across the gates

- [x] 2.1 Route `unpassedChecks` and `attestationFailureReason` through `recordValidity`, adding the `project` argument and updating `missingChecks` and `assertChecksPassed`. Verify: the existing `verification-evidence`, `red-exceptions`, and `complete` tests pass unchanged, and a new test shows `complete` succeeds after a run-state-only commit that follows `verify run`.
- [x] 2.2 Route `cliSecurityFailureReason` through `recordValidity`, keeping its `passed === true` requirement. Verify: a `risk-gates` test accepts a security record after a run-state-only commit and refuses one after a product commit, with the product path named in the refusal.
- [x] 2.3 Store the mapped-entry registry digest with `session.testBaseline` and reuse the baseline only when the baseline revision passes the run-state rule and the digest matches. Verify: a test counts baseline runs with a marker file; a run-state commit does not re-run the baseline, and a `checks.json` change does.
- [x] 2.4 Add a regression test that runs one record through review handoff (`missingChecks`) and through `assertChecksPassed` for valid, stale, and legacy records. Verify: both return the same kinds and reasons in each case.

## 3. Verification status report

- [ ] 3.1 Implement `verifyStatus(project, attemptId)` that assigns `valid`, `failed`, `untrusted`, `stale`, or `missing` per required kind, using the newest-record rule in the design. Verify: unit tests cover one attempt per state and check `allValid` is true only when every kind is `valid`.
- [ ] 3.2 Wire `verify status <attemptId> [--json]` into `handleVerify` in `src/lib/run.mjs` and classify it as read-only in `src/lib/writer-lease.mjs`. Verify: a CLI test exits 0 with `allValid` false, takes no lease file, and leaves the project tree snapshot unchanged.
- [ ] 3.3 Add the text and JSON renderers and a `verify status` entry to the command-help table, including effects `read-only` and the `--json` flag. Verify: `test/command-help.test.mjs` passes, including the drift guards, and `idefactory help verify status --json` parses with `schemaVersion` 1.

## 4. Reviewer and implementer guidance

- [ ] 4.1 Add the reliance wording to `templates/commands/factory-review.md`, `templates/skills/factory-build/SKILL.md`, `templates/skills/factory-verify/SKILL.md`, and `templates/factory/agents/reviewer/charter.md`. Verify: `test/review-guidance.test.mjs` asserts each source template contains the reliance and re-run markers and none contains an unconditional "re-run every required check" phrase.
- [ ] 4.2 Copy the changed skill and command files into the `.agents`, `.claude`, `.cline`, `.cursor`, and `.github` folders and run `node scripts/build-adapter-history.mjs`. Verify: the shipped-copy equality tests pass, `test/adapter-history.test.mjs` passes, and `test/adapter-ownership.test.mjs` shows the legacy review command is replaced and an edited copy is preserved.
- [ ] 4.3 Confirm the charter change reaches only new installs. Verify: a fresh `init` writes a charter containing the reliance wording, and `upgrade` in a project with an existing charter leaves that file byte-identical.

## 5. Documentation and checks

- [ ] 5.1 Add `verify status` to the README command table, a short note on reuse and the stale reasons, and a one-time re-run note for upgraded projects. Verify: `test/readme-adapters.test.mjs` passes with new assertions that the README names `verify status`, `re-run verify`, and the run-state reuse rule.
- [ ] 5.2 Run the full suite, the secret scan, and strict validation. Verify: `npm test`, `npm run secretlint`, and `openspec validate reusable-verification-evidence --strict` each exit 0.
