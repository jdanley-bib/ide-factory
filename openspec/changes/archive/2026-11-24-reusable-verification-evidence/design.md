# Design

## Context

Verification records are written by `verifyRun` (`src/lib/verification-evidence.mjs`) and by `verifyImport`. A CLI record's `sourceRevision` is HEAD at run time. Four places read records and compare them to HEAD exactly:

- `unpassedChecks` and `attestationFailureReason` in `src/lib/required-checks.mjs`, used by `missingChecks` for review handoff (`orchestrate.mjs`) and by `assertChecksPassed` in `complete.mjs`.
- `cliSecurityFailureReason` in `src/lib/risk-gates.mjs` for the security gate.
- `applyTestBaseline` in `src/lib/orchestrate.mjs` for the run baseline, which compares `session.testBaseline.sourceRevision` to HEAD.

`resolveGitBinding` decides cleanliness. It already ignores factory run-state paths through `FACTORY_RUN_STATE_PREFIXES`, `FACTORY_RUN_STATE_FILES`, and the agent-history rule. Scoped approvals (`hasMatchingScopedApproval`) also bind to the exact HEAD. Approvals are human decisions and stay out of scope.

Finalization recovery does not read check records. It goes through `completeWorkItem`, so it inherits the new rule.

## Goals / Non-Goals

**Goals:**
- A passing record stays usable across run-state-only commits and is invalidated by anything else that could change the result.
- One function gives the verdict for every gate, and `verify status` reports the same verdict.
- Each invalidation has a reason an agent can act on.

**Non-Goals:**
- Red records, red exceptions, approvals, and the import format.
- Any change to how a check runs.

## Decisions

### Record fingerprints

New CLI records gain two fields:

- `configDigest`: SHA-256 of the canonical JSON of `{ argv, cwdPolicy, timeoutMs, artifacts }` from the registry entry. This is the full entry, not only argv, so a timeout or artifact change invalidates. The existing `commandDigest` stays as it is because attestation matching already uses it.
- `environment`: `{ node: process.version, platform: process.platform, arch: process.arch }`.

`validateCheckRecord` does not require the new fields. A record without them is retained, and the validity rule treats it as not reusable with reason `re-run verify`. This keeps older attempts readable and makes the migration explicit.

### One validity function

A new function in `src/lib/verification-evidence.mjs`, `recordValidity(project, record, context)`, returns `{ valid, reason }`. `context` carries `attemptId`, the registry entry, and a git snapshot taken once per call: `{ head, worktreeClean, dirtyNonRunState }`. The snapshot comes from `resolveGitBinding` plus `git status --porcelain` filtered through the existing run-state predicate.

Algorithm for a CLI record (`issuer: 'cli'`):

1. Fail if `exitCode !== 0`, `timedOut !== false`, `attemptId` differs, `commandDigest` differs from the registry argv digest. These are the existing `attestationFailureReason` checks, kept as they are.
2. Fail with `re-run verify` if `configDigest` or `environment` is missing.
3. Fail with `registry entry changed since the record` if `configDigest` differs from the current entry.
4. Fail if the worktree has dirty non-run-state paths, with the first path named.
5. If `record.sourceRevision === head`, valid.
6. Otherwise run `git merge-base --is-ancestor <rev> HEAD`. A non-zero result is stale with `revision is not an ancestor of HEAD`.
7. Run `git diff --name-only -z --no-renames <rev> HEAD`. Every path must satisfy the run-state predicate. The first path that does not is named in the reason.
8. Any git error in steps 5 to 7 fails closed with `git could not verify the revision`.

Algorithm for an imported record (`issuer: 'import'`): valid only when `sourceRevision === head` and the worktree is clean, as today. Its reason otherwise is `import is reused only at its exact revision`.

`--no-renames` is deliberate. With rename detection on, a rename from a product path to a run-state path would show only the new name, hiding the product path.

### Imported attestations stay exact-HEAD

This resolves the open question. An import cannot carry a local environment fingerprint, because the signer's machine is not ours. Reusing an import across a revision change would therefore rely on a configuration digest alone, which does not establish that the signer ran the same toolchain. The fail-closed choice is exact-HEAD only, which matches today's behavior.

Alternatives considered and rejected for this change: extending the signed payload to require a signer-side fingerprint (a schema and key-process change, out of scope), and trusting the configuration digest alone (weaker than the rest of the rule). Changing this later means adding a signed field, and that can be a follow-up.

### One rule across gates

- `unpassedChecks` takes the project and calls `recordValidity` instead of `attestationFailureReason` plus an exact-HEAD comparison. Its signature gains `project`. `missingChecks` and `assertChecksPassed` pass it.
- `cliSecurityFailureReason` calls the same function for security kinds, with the extra `passed === true` requirement it already has.
- `applyTestBaseline` stores, with the baseline, the digest of the mapped registry entries. It reuses a baseline when the baseline's `sourceRevision` passes the run-state rule and the digest still matches. A mismatch or a dirty product path re-runs it. The baseline has no per-record fingerprint, so the mapped-entry digest is the substitute. This is a small extension and is written up in the tasks.

`hasMatchingScopedApproval` keeps its exact-HEAD comparison. Approvals are excluded by the proposal.

### `verify status`

`idefactory verify status <attemptId> [--json]` reads the attempt, the work item, `requiredChecksFor`, the registry, and the git snapshot. It calls `recordValidity` for each record of each required kind and assigns one state per kind:

- `valid`: some record for the kind is valid.
- `failed`: no record is valid and the newest record for the kind exited non-zero or timed out.
- `untrusted`: the newest record fails an identity check (issuer, attempt id, or command digest).
- `stale`: the newest record is structurally sound but not valid. The reason is the one from `recordValidity`.
- `missing`: no record exists for the kind.

Newest means the last entry in `evidence.verification` or `evidence.security` for that kind. `allValid` is true when every required kind is `valid`.

The command is read-only. It takes no writer lease and writes nothing. It exits 0 in every case, so a script reads `allValid`, not the exit code. It joins the command-help table with effects `read-only` and a `--json` flag, so the drift guards in `test/command-help.test.mjs` cover it.

Text output is one line per kind: `<kind>  <state>  <reason or sourceRevision>`. JSON output is `{ schemaVersion: 1, attemptId, allValid, checks: [{ kind, state, reason, sourceRevision, recordedAt }] }`.

### Reviewer guidance

- `templates/commands/factory-review.md` gains the reliance wording. The reviewer relies on a valid record, still reviews independently, runs a focused check when the change warrants it, and re-runs a stale one with `verify run`.
- `templates/skills/factory-build` and `factory-verify` carry the same wording so the implementer knows a run-state-only commit does not force a re-run.
- `templates/factory/agents/reviewer/charter.md` gets the same rule. Existing charters are team-owned and `writeIfMissing` never rewrites them, so the charter change reaches new installs only. The review command and skills reach existing installs through `upgrade`. This split is stated in the proposal.

### Run baseline

`session.testBaseline` gains a `configDigest` field. Sessions written before this change have none, so they re-run the baseline once. That is safe and explained in the migration section.

## Risks / Trade-offs

- **Shallow clones:** CI with `fetch-depth: 1` may not contain the record's revision. Then the ancestor check fails and the record is stale. That fails closed and costs a re-run, not a wrong pass.
- **Diff size:** the diff is only over changed file names, with `--name-only`, so it stays cheap for ordinary commits.
- **Run-state trust:** a run-state path can carry product-affecting content in principle (for example, a hand-edited work item). The predicate is the existing allowlist, which the team already trusts for worktree cleanliness. Tightening it is a separate change.
- **Migration cost:** every in-flight attempt needs one re-run of each required check after upgrade. That is the intended fail-closed behavior, and the README states it.
- **Two gates to keep in step:** the review handoff and the gate on complete must agree. Both call `recordValidity`, and a regression test runs one record through both entry points.

## Migration Plan

1. Land the record fingerprints, `recordValidity`, the gate changes, and `verify status` with tests. Existing records are stale until re-run, so no gate loosens for old data.
2. Update the review command, the build and verify skills, the charter template, the shipped copies, and `templates/adapter-history.json` with `node scripts/build-adapter-history.mjs`.
3. Update the README's command table and the verification section, and note the one-time re-run after upgrade.

No stored data is rewritten. Rollback is reverting the change; new fields are ignored by older code.

## Open Questions

None. The import question is resolved above and is recorded as a decision the human can revisit.
