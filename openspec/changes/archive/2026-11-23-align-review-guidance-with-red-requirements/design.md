# Design

## Context

The red rule exists in three places that disagree. The CLI gate in `src/lib/attempt.mjs` requires a red or a valid exception to enter `verifying` only when the item is not `lightweight` and `requiredTestKinds(checks)` is non-empty. The existing `guided-build` requirement "Method and review" already says the packet and skills require a failing test only for a `code` item whose profile includes a test check. The generated text says otherwise: `templates/commands/factory-review.md` and the `factory-build` Review section are unconditional, and the work packet and the implementing-stage run request ignore the "no test kind" case. See proposal.md for the problem.

An attempt that reaches review has already passed the `verifying` gate, so the reviewer's job is to confirm the recorded evidence, not to re-derive whether a red was required. The packet does not show the task class, so a reviewer cannot tell which case applies today.

## Goals / Non-Goals

**Goals:**
- One conditional statement of the red rule, in the same words, wherever generated guidance states it.
- Give the reviewer and implementer the facts they need to apply it, in the packet.
- Make the run request match the gate for a code item with no test kind.

**Non-Goals:**
- No CLI gate, exception, or review rule changes.
- No change to how adapters are written or protected from edits (issue #31).
- No refresh of charters in projects that already have them.

## Decisions

**Review confirms recorded evidence.** The review command lists what to check, in this order: required checks have passing CLI records on the current clean HEAD; each kind that needs a red has a recorded failing red or a valid recorded exception; the reviewer is a different role. It then names the cases that need no red. Draft wording for the command body:

> Accept only if the attempt's recorded evidence satisfies the work item. Every required verification check has a passing CLI record on the current clean HEAD. For a `code` item whose checks include a test kind (`unit`, `integration`, `playwright`, `contract`, or `unit-*`), each such kind has a recorded failing red, or a valid red exception that a human authorized. A red exception is not a red that ran. Do not ask for a new failing test where one is recorded. A `lightweight` item, and a `code` item with no test check, need no failing test. The work packet names the task class and the kinds that need a red.

The build skill's Method keeps its existing conditional sentence. Its two unconditional lines change: "Record red evidence on the attempt" becomes conditional on the same rule, and "Acceptance requires red evidence and verification evidence" becomes a pointer to the review command's conditions.
- Alternative: tell the reviewer to re-check the gate by running the CLI. Rejected because the attempt cannot have reached review without passing it, and the packet already carries the evidence.

**The packet carries the facts.** Two new lines in the packet header, next to `Checks`: `Task class: code|lightweight` and `Red required for: <kinds>|none`. The second is computed from the same helpers the gate uses (`taskType` and `requiredTestKinds`), so the packet cannot disagree with the CLI. It appears for every role, because the implementer needs it as much as the reviewer.
- Alternative: reviewer packet only. Rejected as needless asymmetry for a one-line fact.

**The run request follows the gate.** In `stageForState`, the implementing stage treats a `code` item with no required test kind like a `lightweight` one: route to `verifying` with a message that a failing test is not required. A `code` item with a test kind is unchanged. Today the request asks for `red-confirmed` and a red that the gate does not need, and `red-confirmed` itself refuses to start without a stored red.
- Alternative: leave the routing and only fix the text. Rejected because the next state in the request would still point at a transition the item cannot make.
- This changes a request's `nextState` for one narrow case. It does not touch the gate, and `red-confirmed` stays available for an agent that records a red anyway.

**Charters change for new installs only.** `init` writes a charter only when it is missing, so the engineer and reviewer charters change in the templates and reach only new projects. Existing projects keep what they have.

**Copies are regenerated, not hand-edited.** The checked-in `.cursor`, `.claude`, `.github`, and `.cline` command copies and the five skill directories come from `idefactory upgrade`. The tasks run it and check that the diff touches only the intended files.

**Tests assert phrases across every copy.** One new test file reads the source templates, a fresh `init`, and the checked-in copies. For each it asserts the conditional markers (task class, test kind, lightweight, no test check, exception is not a red that ran) and the absence of the old unconditional sentences. A separate set of tests exercises the packet and the run request for the three cases: lightweight, code with a test kind, and code with none. Another asserts a recorded exception in the reviewer packet still reads as accepted evidence.

## Risks / Trade-offs

- [A project that customized the review wording loses it on the next upgrade] → This is the existing overwrite behavior tracked in issue #31. The new upstream wording covers what such a project edited.
- [The routing change for a code item with no test kind surprises an existing run] → It only applies when no check is a test kind, where the gate already allows `verifying` with no red. The run-session and orchestration tests cover the neighbours.
- [Wording drifts across the thirteen copies again] → The regression test reads every copy, so drift fails the suite.

## Migration Plan

No state migration. Projects pick up the wording with `idefactory upgrade`, which replaces adapter files as it does today. Rolling back is a revert of the templates and the two code edits.
