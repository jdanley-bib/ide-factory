# Proposal

## Why

A passing check record is bound to the exact HEAD it ran at. Any commit that follows makes it stale, even when the commit only touches factory run-state such as attempt files, work items, or the ledger. The attempt then has to re-run every required check before review, run, or complete can proceed. Those re-runs repeat work that already passed, slow the loop, and invite reviewers to ask for re-runs they do not need. Issue #42 asks for a single, explainable validity rule so that a passing record stays usable when only factory run-state moved, and so that every gate applies that rule the same way.

Today no command reports which records are valid or why one is not. An agent or reviewer has to read attempt JSON and reason about revisions by hand.

## What Changes

- A passing CLI record stays valid at a later HEAD when its source revision is an ancestor of HEAD, every path changed between them is factory run-state, the worktree has no dirty non-run-state paths, and the registry entry's full configuration digest still matches. Any other case is stale. Git errors fail closed.
- Records written by this release also carry a configuration digest over the registry entry (argv, cwdPolicy, timeoutMs, artifacts) and an environment fingerprint (Node version, platform, architecture). A record without these fields is kept on the attempt but is never reusable; its reason reads "re-run verify".
- One validity function decides for review handoff, review entry, run baseline, complete, and the security gate. No gate keeps its own revision comparison.
- Imported signed attestations stay exact-HEAD only. An import cannot carry a local environment fingerprint, so it is never reused across a revision change.
- `idefactory verify status <attemptId> [--json]` is a new read-only command. For each required check it reports `valid`, `stale`, `missing`, `failed`, or `untrusted`, with a reason. Its JSON output carries `allValid`. It always exits 0.
- The factory-review command, the factory-build and factory-verify skills, and the reviewer charter for new installs say a valid record is relied on, the reviewer still reviews independently, a focused check is run when a change warrants it, and a stale record is re-run.
- The run baseline reuses its recorded test baseline under the same validity rule, so a run-state-only commit does not re-run the baseline.
- Red records are not changed. Red reuse and red waivers keep their existing audited exception path.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `verification-evidence`: adds reusable passing evidence, a shared validity rule, record fingerprints, and the `verify status` report. Modifies the evidence schema to name the new fields.
- `ide-adapters`: adds the reviewer reliance wording to the review command, the build and verify skills, and the reviewer charter template.

## Out of Scope

- Red records, red reuse, and red waivers. Their validity and the audited exception path stay as they are.
- Approval binding. Scoped approvals for accept and complete still bind to the exact clean HEAD. Relaxing that is a human-governance change.
- The import attestation format and signing. Imports keep their current fields and key checks; this change only decides their reuse window.
- Run-state allowlist changes. The set of paths treated as run-state is the existing one, reused as is.
- Changing how a check is run, what it records for a fresh run, or any command's exit codes except the new `verify status` command.
- Rewriting existing charters. The charter template changes only affect installs that create a charter; existing team-owned charters are left alone.

## Impact

- `src/lib/verification-evidence.mjs`: the record writer adds the configuration digest and environment fingerprint; `resolveGitBinding` is reused for the dirty check; a new `checkRecordValidity` (or equivalent) implements the shared rule.
- `src/lib/required-checks.mjs`: `unpassedChecks` and `attestationFailureReason` call the shared rule instead of comparing to HEAD directly.
- `src/lib/complete.mjs`, `src/lib/orchestrate.mjs`, `src/lib/risk-gates.mjs`: the review entry, run baseline, complete, and security checks call the shared rule.
- `src/lib/run.mjs` and `src/lib/command-help.mjs`: the `verify status` command and its help entry, which the drift guards in `test/command-help.test.mjs` require.
- `templates/commands/factory-review.md`, `templates/skills/factory-build`, `templates/skills/factory-verify`, `templates/factory/agents/reviewer/charter.md`, the shipped copies in five adapter folders, and `templates/adapter-history.json`.
- Existing attempts: records written before this change lack the fingerprint and are stale. Attempts in flight need one re-run of each required check after upgrade. This is a deliberate fail-closed migration and is stated in the README.
- No new dependencies. No change to stored file layout beyond the two new record fields.
