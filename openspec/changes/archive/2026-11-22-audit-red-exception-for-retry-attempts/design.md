# Design

## Context

Red evidence lives at `attempt.evidence.reds[kind]`, written only by `verify run --red` after an assertion failure (`src/lib/verification-evidence.mjs`). Three places read it through helpers in `src/lib/red-evidence.mjs`: the `red-confirmed` and `verifying` gates in `src/lib/attempt.mjs`, `complete` in `src/lib/complete.mjs`, and the stage message in `src/lib/orchestrate.mjs`. A red run that exits zero stores nothing, bumps `retryCounts["vacuous-red:<kind>"]`, and closes the run session with `vacuous-red`. `startAttempt` always creates empty evidence, and a rejected attempt is terminal (`TRANSITIONS.rejected = []`). `approve` writes token files with a fixed action list (`accept`, `complete`) and is consumed only by the human-gate check. See proposal.md for the failing scenario.

## Goals / Non-Goals

**Goals:**

- One place decides whether red is satisfied for a kind, so no gate can drift from another.
- Exceptions are applied at issuance, bound to one attempt, and verifiable later without trusting the attempt file alone.
- The CLI refuses an unacknowledged early waiver, and the skills carry the human-facing warning.

**Non-Goals:**

- Authenticating that a human, rather than an agent, ran the command beyond what `approve` already does (the approver check and the policy version 2 verified principal).
- Changing how `verify run`, baseline, or run-session stops behave.
- A UI, a revoke command, or an expiry. An exception is permanent audit data for its attempt.

## Decisions

### Separate `red` commands, not new `approve` actions

An approval is a token checked later against change, task, action, and HEAD. An exception must name an attempt, a kind, and a source record, and it takes effect when written. Stretching `approve` would add fields it validates for no other action and would make `humanGateAllows` consult attempt-level data. `red reuse` and `red waive` reuse the same approver rules instead: a non-empty approver distinct from the target's `implementerId`, and under policy version 2 `confirmPrincipal` plus approver equal to the principal subject.

Alternative considered: `approve --action reuse-red`. Rejected because the token's 24 hour expiry and HEAD binding fit a pending gate, not a one-shot attempt mutation.

### One resolver for red

`red-exceptions.mjs` (not `red-evidence.mjs`, which `verification-evidence.mjs` imports) exports `redSatisfaction(project, attempt, kind)` returning `cli`, `reuse`, `waiver`, or `missing`. `cli` keeps today's `isFailingRed(redForKind(...))`. `reuse` and `waiver` read `attempt.evidence.redExceptions[kind]`, load the record file, and require matching `attemptId`, `kind`, `type`, and file digest. The `verifying` gate and `complete` call it; `isFailingRed` and `hasAnyFailingRed` are untouched, so `red-confirmed` still needs a genuine CLI red.

An exception that fails any check returns `missing`, so a deleted or edited file reads as no red.

### Storage and write order

Each exception is `.factory/exceptions/red/<uuid>.json`, created with exclusive write so it is never overwritten. The attempt then gets `evidence.redExceptions[kind] = { id, type, digest }`, where `digest` is the SHA-256 of the file bytes. The file is written first. A crash between the two leaves an unbound file that satisfies nothing, and a retry creates a new id. The command checks `redExceptions[kind]` before writing and refuses a second exception for the same kind.

Record fields: `schemaVersion`, `id`, `type`, `change`, `task`, `attemptId`, `kind`, `approver`, `reason`, `issuance`, `policyVersion`, `sourceRevision` (HEAD at authorization), optional `principal`, and either `source` (reuse) or `acknowledgedNotStuck` (waiver). `source` holds `attemptId`, `commandDigest`, `logDigest`, `sourceRevision`, `startedAt`, `finishedAt`, and `recordDigest`, the SHA-256 of the canonical JSON of the source red record. The exception file is not an attestation: it does not use `validateCheckRecord`, and it carries no `exitCode`.

### Reuse eligibility is checked at issuance

At write time the command requires: the source is an earlier `rejected` attempt for the same change and task; the target has not entered `verifying`; the item is `code` and the kind is in `requiredTestKinds`; the source's `reds[kind]` passes `isFailingRed` and `validateCheckRecord` and names the source attempt; its `commandDigest` equals the current registry digest; the worktree is clean at a resolvable HEAD (`resolveGitBinding`); and the target holds a passing CLI record for the kind that satisfies the same checks `complete` applies (`issuer`, `exitCode` 0, not timed out, digest, attempt id, `sourceRevision` equal to HEAD). That last check reuses `attestationFailureReason`, exported from `complete.mjs`.

`complete` repeats the full passing-attestation check at its own HEAD, so a later commit still invalidates the green evidence even though the exception stays valid.

### Waiver and the stuck signal

The stuck signal for a kind is `evidence.retryCounts["vacuous-red:<kind>"] >= 1` on the target attempt, using the existing `retryKey`. Without it, `red waive` exits non-zero with a warning and writes nothing. With `--acknowledge-not-stuck` it proceeds and stores `acknowledgedNotStuck: true`. With the signal it needs no flag and stores `false`. A waiver does not require a passing record at issuance, because the human is asserting the absence of a red, and `complete` still requires the green record.

The warning text lives in one string used by the CLI and quoted in the skills, so a skill-text test can assert the two agree. The factory skills tell the session to stop, explain the options, recommend `red reuse` first and a waiver only after the system is stuck, and run the waiver with the flag only after the human acknowledges.

### Exception files are run-state

A new untracked `.factory/exceptions/red/<id>.json` would otherwise make `resolveGitBinding` report a dirty worktree and block the green record and `complete`, the same problem `.factory/approvals/` already solves. `.factory/exceptions/` joins the run-state prefixes in `verification-evidence.mjs`, and the factory does not gitignore it, so the record can be committed with the work.

### Other gates and the run session

The commands never edit the rejected attempt, never touch the work item's `taskType`, and never write to `evidence.reds` or `evidence.verification`. They do not open or edit run sessions, so a sticky `vacuous-red` still needs the human's `--new-run`. In `orchestrate.stageForState`, a `code` attempt in `implementing` whose every required kind has a CLI red or a valid exception is asked to proceed to `verifying` instead of being asked for a red.

### Visibility and events

`status` JSON and text list exceptions per attempt. The reviewer packet in `queue.mjs` gets a short block ("No red ran for `unit`; waiver by `<approver>`: `<reason>`"). The verdict comment in `pull-request.mjs` appends the same line when the attempt has exceptions. Both read through one formatter so the wording matches. `appendControlEvent` records `red-exception.recorded`; the allowlist gains `exceptionType` and the reason is never logged, matching how approval notes are treated.

### Command surface and halt

`red` joins the writer-lease command keys as `red reuse` and `red waive`, and honors `HALT` like `verify run`. Usage lines are added to `run.mjs`. Flags: `--from`, repeatable `--kind`, `--note`, `--approver`, `--principal-provider`, `--principal-subject`, and `--acknowledge-not-stuck` for waive.

## Risks / Trade-offs

- [An agent runs `red waive` itself, or answers the warning on the human's behalf] → The skills say the human acknowledges, the repository rules already forbid unrequested governance actions, and policy version 2 requires a verified principal. At policy version 1 the CLI cannot tell who typed the flag, which is the same limit `approve` has.
- [Reuse launders a red from an unrelated change in the code] → The red must come from a rejected attempt for the same task, with the same command digest, and the reviewer sees the provenance. Reuse does not check that the red's revision is an ancestor of HEAD, because red may predate later rework.
- [A waiver removes the test-first guarantee for that kind] → It is per attempt and kind, needs a reason and a distinct approver, is acknowledged before a stuck signal, and is shown to the reviewer and in the verdict comment.
- [Two sources of truth: file and attempt pointer] → The digest binds them, and a mismatch means red is missing.
- [Vacuous-red stop and exception interact confusingly] → The exception does not reopen the session. The output and skill text say to pass `--new-run`.

## Migration Plan

1. Add the resolver and the exception module with tests, then switch the `verifying` gate and `complete` to the resolver in one step, with a test that a plain CLI red still passes.
2. Add the CLI commands, writer-lease keys, and halt handling.
3. Add event, status, packet, and comment output.
4. Update the skills in `templates/skills` and every shipped IDE copy.

Existing attempts and evidence files need no rewrite. Rollback reverts the resolver. Stored exception files and `evidence.redExceptions` are inert to older code, but an attempt that relied on one would need a CLI red after rollback.
