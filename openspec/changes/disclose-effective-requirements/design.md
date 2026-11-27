# Design

## Context

See proposal.md for motivation. Today the red requirement is computed from two sets:

- Item checks only: the packet (`redRequiredKinds` in `src/lib/queue.mjs`), the run request (two sites in `src/lib/orchestrate.mjs`), the gate into `verifying` (`src/lib/attempt.mjs`), and red-exception eligibility (`requireCodeItem` in `src/lib/red-exceptions.mjs`). Each calls `requiredTestKinds(item.factory.checks)`.
- Profile plus item: completion (`src/lib/complete.mjs`), the review handoff, and `verify status` through `requiredChecksFor` in `src/lib/required-checks.mjs`.

The packet's `Checks:` line prints only the item's own list. `requiredChecksFor` already refuses an undefined profile with a clear message, but only when a consumer calls it, which is late. Approvals are limited to the actions `accept` and `complete`, expire within 24 hours, and under policy version 2 need a configured principal verifier.

## Goals / Non-Goals

**Goals:**

- Every consumer reads one resolved set, produced by one function.
- Problems that can strand an attempt are found before the attempt starts.
- The set is inspectable by a human, an agent, and a script.

**Non-Goals:**

- Deciding whether a task should be test-first.
- Changing profile authoring or the meaning of a check kind.

## Decisions

**1. One resolver next to `requiredChecksFor`.**
`resolveRequirements(project, item)` returns `{ checks: [{ kind, sources }], redKinds, humanDecisions, dependencies, problems }`. `requiredChecksFor` stays and becomes a thin projection of it, so existing callers and tests keep working. Alternative: patch each of the five sites to call `requiredChecksFor`. Rejected: it fixes the symptom and leaves five places that can drift again. A drift test (below) asserts that no module calls `requiredTestKinds` on `item.factory.checks` directly.

**2. `problems` instead of exceptions inside the resolver.**
The resolver never throws for an item defect. It returns problems with an id, the invariant, and the fix location, so the new command can print a set that has problems and the preflight can refuse on them. An undefined profile therefore appears as a problem in `requirements` output as well as refusing the start.

**3. Preflight at two points.**
`startAttempt` refuses when `problems` is non-empty. `sync-tasks` prints the problems for a new or updated item as warnings and still writes the item, because the queue is a record of the plan and a later fix to `profiles.json` or the registry should not require a re-sync. Alternative: refuse at sync. Rejected: it would block the whole change for one item that a registry edit fixes.

**4. Human decisions are listed from the existing gate rules.**
`humanDecisions` comes from the profile's `humanGate` and the action list the approval code already enforces (`accept`, `complete`). A gate is unsatisfiable when it is required, the policy version is 2, and no verifier is configured. This reads existing configuration; it adds no new approval type. The wider action taxonomy belongs to `align-approval-actions`.

**5. Report all unmet requirements together.**
`unpassedChecks` already supports a list and `stopAtFirst` is only passed by completion. Completion and the handoff call it without `stopAtFirst` and append missing reds, then throw one error with every line. Alternative: keep first-failure behavior. Rejected: one round trip per missing item is the kind of babysitting #51 describes.

**6. A new command, not a flag on `status`.**
`idefactory requirements <change> <task> [--json]` is read-only and scoped to one item, which `status` is not. `status` shows the red kinds per attempt using the same resolver. The `cli-help` spec pins the global usage text, so the command is documented through `help requirements` and `help --json` and the global text is left unchanged. The packet and the shipped skills name the command so it stays discoverable.

**7. A drift test.**
A test scans `src/lib` for `requiredTestKinds(` arguments that are `item.factory.checks` or `item?.factory?.checks`, and fails if any remain. This keeps the single-source rule enforceable without reviewer memory.

## Risks / Trade-offs

- [Gate into `verifying` is now stricter for profile-derived kinds] → Completion already required the same red, so no completable attempt is newly refused, and the failure moves from the end of the attempt to implementation. The proposal marks it **BREAKING** for visibility.
- [Preflight may refuse an item whose registry will be fixed mid-run] → The refusal names the registry and kind, and the next `run` re-evaluates. An agent can fix the registry within its delegated scope and continue.
- [Printing the set adds output to the packet] → The packet adds one block with at most the number of required checks; reviewer and security packets reuse it.
- [The resolver reads configuration on every call] → Reads are small JSON files and the calls are per command, not per loop iteration.

## Migration Plan

No data migration. Existing attempts and items are read as before. Attempts already past `verifying` keep their stored evidence and are judged by the unchanged completion rule. Rollback is a code revert.

## Open Questions

- Whether `sync-tasks` should print problems as warnings only, or also exit non-zero with a distinct code. Warnings keep current scripts working; a distinct code is easy to add later without changing the specs.
