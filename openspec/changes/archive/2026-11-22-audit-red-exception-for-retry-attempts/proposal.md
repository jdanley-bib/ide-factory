# Proposal

## Why

A `code` work item can be rejected only because verification ran on a dirty workspace, even though its first attempt has genuine failing-test-first evidence. The replacement attempt starts with empty evidence, and its own `verify run --red` correctly reports `vacuous-red` because the implementation already passes. Import cannot create red, and `approve` only knows `accept` and `complete`, so the item and normal routing stay blocked despite passing checks on a clean revision. Issue #27 asks for an audited way out that does not invent a red test.

## What Changes

- Add `idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind>`: a human-authorized, predicate-gated link from a replacement attempt to the genuine CLI red of the rejected attempt it replaces. The target never gains a red it did not run. It gains a linked exception that names the source attempt and source record.
- Add `idefactory red waive <targetAttemptId> --kind <kind>`: a human override with no predicate. It records that no red exists for that kind on that attempt and why.
- Make both commands human-invoked at any time. `waive` before the attempt shows a stuck signal (a recorded `vacuous-red` for that kind) is refused with a warning until the human passes `--acknowledge-not-stuck`. The acknowledgment is stored in the audit record. The factory skills tell the session to warn the human, recommend waiting until the system is stuck, and run `waive` only after the human acknowledges.
- Add one resolver for "is red satisfied for this kind". The transition into `verifying` and `complete` accept a stored CLI red, a valid reuse exception, or a valid waiver exception. A reuse or waiver never satisfies the `issuer: cli` check, and it is never written to `evidence.reds`.
- Persist each exception as an immutable record under `.factory/exceptions/red/`, bind it onto the target attempt with a content digest, append a control-plane event, and show it in `status`, the reviewer packet, and the pull-request verdict comment.
- Keep the work item `code`. Keep the rejected attempt and its evidence unchanged.

Out of scope:

- Waiving or weakening clean-revision passing attestations, independent review, reviewer or security-reviewer separation, lockouts, the security stage, human gates, or the retry cap.
- Reclassifying a `code` item as `lightweight`.
- Letting an agent record an exception on its own, importing a red, or minting a CLI-looking red.
- A standing or per-project "skip red" setting. Each exception covers one target attempt and the kinds it names.
- Reopening a sticky `vacuous-red` or `retry-cap` session. The human still passes `--new-run` as today.
- Reusing evidence across different work items or changes.

## Capabilities

### New Capabilities
- `red-evidence-exceptions`: Human-authorized reuse of a rejected attempt's genuine red, a human waiver override, their eligibility rules, warning and acknowledgment, audit records, and how they relate to CLI red evidence.

### Modified Capabilities
- `guided-build`: The `verifying` gate, completion, and the next-step message for a `code` attempt accept a valid red exception for a required test kind in place of a stored CLI red.
- `factory-event-log`: Recording a red exception appends one control-plane event.
- `verification-evidence`: Uncommitted files under `.factory/exceptions/` count as run-state like `.factory/approvals/`, so recording an exception does not make the worktree dirty for source-revision binding.
- `ide-adapters`: Shipped factory-build, factory-tdd, and factory-verify skill text describes the exception commands, the stuck-first warning, and that only the human acknowledges it.

## Impact

- Code: `src/lib/red-evidence.mjs` (resolver), new `src/lib/red-exceptions.mjs`, `src/lib/attempt.mjs` and `src/lib/complete.mjs` (gates), `src/lib/orchestrate.mjs` (stage message), `src/lib/run.mjs` (CLI), `src/lib/event-log.mjs` (allowlist), `src/lib/read-model.mjs`, `src/lib/queue.mjs`, `src/lib/pull-request.mjs` (visibility).
- Files: new `.factory/exceptions/red/<id>.json`; new `evidence.redExceptions` on attempts.
- Skills: `templates/skills` and every shipped IDE copy of factory-build, factory-tdd, and factory-verify.
- Existing attempts and evidence files are unchanged. Rollback is reverting the resolver; stored exception files are inert.
