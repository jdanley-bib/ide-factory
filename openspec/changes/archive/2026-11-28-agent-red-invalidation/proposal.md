# Proposal

## Why

Part of #54 and #51. A stored failing red that was recorded for the wrong reason, such as after implementation had begun or because the test failed on a fixture mistake and not on the behavior under test, blocks the supported paths. `method propose` refuses any covered kind that has a stored failing red. `red waive` refuses a stored red unless `--invalid-red` is used, which needs a human approver who is not the implementer. The only supported fix is a human waiver, even though the situation is a mistake the agent can see and describe, and even though discarding a bad red makes the evidence stricter, not looser.

Invalidating a red is a strictness-neutral act. It removes a claim ("a red ran") that the agent knows is not true, and it grants nothing in return: the kind is not satisfied until a genuine later red, a reviewed method, or a human exception exists. That kind of act does not need a human.

## What Changes

- New `idefactory red invalidate <attemptId> --kind <kind> --class <post-implementation|wrong-failure> --note "<text>" --by <identity>` records that the attempt's current failing red for that kind is not a genuine red. The record names the invalidated red's digest, the class, the identity, and the time.
- An invalidated red does not satisfy red and no longer blocks a `no-red` method proposal for that kind. It grants no waiver. A later failing CLI red after the invalidation satisfies red under the same rule as a later red after a human waiver.
- Each kind may be invalidated at most twice on an attempt. After that, `red invalidate` refuses and the human waiver remains the exit.
- The identity is recorded but need not differ from the implementer, because the act removes a satisfied claim and cannot be used to pass a gate. HALT blocks it.
- Status, the reviewer packet, and the verdict comment show the invalidated red and its class beside any later red or method.
- `red waive` over an existing red names `red invalidate` before `--invalid-red` in its refusal. `method propose` names it when it refuses a stored red.
- The invalidation appends a control event with ids and a class code only.
- The human `--invalid-red` waiver is unchanged. It still exists for the case where a human decides to accept an invalidated red's kind without a later red.

## Capabilities

### New Capabilities

- `red-invalidation`: the command, its classes, its effect on satisfaction and methods, the per-kind limit, visibility.

### Modified Capabilities

- `red-evidence-exceptions`: refusal and guidance wording that names the agent command.
- `red-method`: a stored red that has been invalidated no longer blocks a proposal.
- `writer-lease`: `red invalidate` is mutating.
- `cli-help`: help for `red invalidate`.
- `factory-event-log`: invalidation events carry codes only.

## Impact

- New `src/lib/red-invalidation.mjs`; `src/lib/red-exceptions.mjs` and `src/lib/red-method.mjs` (read invalidations), `src/lib/attempt.mjs` (red satisfaction), `src/lib/run.mjs` (command), `src/lib/command-help.mjs`, `src/lib/writer-lease.mjs`, `src/lib/event-log.mjs`, packet and status builders, and the guidance copies.
- `test/red-invalidation.test.mjs`, `test/red-method.test.mjs`, `test/red-exceptions.test.mjs`.
- No new dependencies.

Out of scope:

- Detecting a post-implementation red automatically. The CLI still cannot tell, so the agent says so and the reviewer sees it.
- Letting an agent waive a kind. A waiver still needs an independent identity because it satisfies red without a failing test.
- Invalidating a passing result or a verification record.
