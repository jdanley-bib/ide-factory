# Proposal

## Why

Part of #51. Failing-test-first is a method, and a red record is evidence that the method was followed. The factory applies the evidence gate by task class, and the class is either set by hand in `tasks.md` or inferred from a keyword (`docs` becomes `lightweight`; everything else becomes `code`). A behavior-preserving refactor, a configuration change, a mechanical rename, or an exploratory spike is classified `code` and then cannot honestly produce a red. The only escape today is a human-authorized red exception, which records "no red ran", is discouraged before the system is stuck, and puts a human in the loop for what is an engineering judgment.

The product intent in #51 is that the factory decides this for itself within the authority it was given, without weakening honest verification. The decision reached in exploration is: the implementing agent proposes the method before implementation and records the rationale, the independent reviewer must accept that choice, and a human is involved only when the choice conflicts with something a human set explicitly or the review cannot settle it.

## What Changes

- Each attempt has a method. The default is `red-first`, which is today's behavior. An agent may record `no-red` for a code item before it enters `red-confirmed` or `verifying`, with `idefactory method propose`.
- A proposal names a reason class from a closed set (`docs-or-text`, `configuration`, `behavior-preserving`, `mechanical`, `exploratory`), the check kinds it covers, and a written rationale. For `behavior-preserving` it must also cite at least one existing, git-tracked test file that exercises the changed behavior. The record binds the source revision and the number of changed files at proposal time.
- A proposal is refused when the work item has an explicit `factory.taskType`, when any covered kind already has a stored failing red or an exception, when a kind is not required, or when a reviewer already rejected a `no-red` method for that item.
- The reviewer records `idefactory method review <attemptId> --verdict ACCEPT|REJECT`. An attempt with a `no-red` method cannot be accepted without an `ACCEPT` method review from a role other than the implementer. A `REJECT` review rejects the attempt, and later attempts for that item use `red-first`.
- The red gates treat a covered kind as satisfied by a recorded `no-red` method (pending review at `verifying`, accepted at completion). It is never described as a red that ran or as an exception, and it needs no human approver.
- The packet, run request, reviewer packet, status, and verdict comment state the method, reason class, rationale, and review.
- Shipped skills, charters, and help describe when `red-first` is the right method and when to propose `no-red`.
- **BREAKING**: none. An attempt with no method record behaves exactly as before.

## Capabilities

### New Capabilities

- `red-method`: how an attempt records its red method, who may change it, how the reviewer accepts it, and what it does and does not satisfy.

### Modified Capabilities

- `guided-build`: the method-and-review requirement, the attempt lifecycle gate, and the completion requirement each add the recorded method as a way to satisfy red for a covered kind.

## Impact

- New `src/lib/red-method.mjs`, a `method` command group in `src/lib/run.mjs` and `src/lib/command-help.mjs`, and records under `.factory/methods/`.
- `src/lib/red-exceptions.mjs` (`redSatisfaction` gains a `method` source), `src/lib/attempt.mjs` (accept precondition), `src/lib/complete.mjs`, `src/lib/orchestrate.mjs` (implementing and review requests), `src/lib/queue.mjs` (packet blocks), `src/lib/event-log.mjs` (two event types), and `src/lib/pull-request.mjs` (verdict comment).
- `templates/skills/factory-build/SKILL.md`, `factory-tdd`, `factory-verify`, the reviewer charter and review command template, `README.md`, and adapter copies.
- `test/` additions. No new dependencies. Existing attempts and items are unchanged.

Out of scope:

- Characterization-first (green-first) as a third method. It is a follow-up; this change leaves `red-first` and `no-red` only.
- Detecting that production code was written before a proposal. The CLI cannot see ordering. It records the revision and changed-file count so the reviewer can judge.
- Changing explicit `factory.taskType` semantics, or letting an agent override a class a human set.
- Linking tasks to OpenSpec scenarios as an automatic classifier. `tasks.md` has no such link today; the packet lists the task's criteria for the agent's judgment only.
- Any human approval step for a `no-red` method.
