---
name: factory-verify
description: >
  Run the verification profile checks before claiming a factory work item is done.
  Use when factory-build is finishing and no verification-before-completion skill is installed.
---

# Factory verify

<!-- idefactory:owned -->

The IDE session model does the work.

Run `idefactory help <command>` for a command's usage, flags, and examples. `idefactory help verify run` lists the check flags. Add `--json` for structured output. Do not read the CLI source to learn usage.

1. Read the resolved requirement set with `idefactory requirements <change> <task>`, or the packet's `Required checks` line. It holds the item's `checks` and the `verificationProfile`'s checks together.
2. Run `idefactory verify status <attemptId>`. A check that is `valid` is reused: its passing record still holds because only factory run-state changed since. Do not re-run it. Reliance does not replace review: still review the change independently, and run a focused check yourself when the change warrants it.
3. Map each remaining check (`stale`, `missing`, `failed`, `untrusted`, or whose reason says `re-run verify`) to a project command (unit, build, playwright, docs, etc.).
4. Run each command in the project. Do not describe a run you did not start.
5. Read the exit code and the failing lines. A skipped check is not a pass.
6. Record a failing test for every kind under `Red required for`, when the task class is `code`, with `idefactory verify run <attemptId> --check <kind> --red`.
7. Record the passing run with `idefactory verify run <attemptId> --check <kind>`.
8. Do not put a verification result on an attempt transition. The verification command writes the record.
9. Stop when the command names `vacuous-red` or `infrastructure-failure`.
10. Claim ready for review only when required checks passed.
11. `red-first` is the default. If a failing test cannot specify the change, the method may be `no-red` with one of the classes `docs-or-text`, `configuration`, `behavior-preserving`, `mechanical`, `exploratory`, or `already-satisfied`: see `factory-tdd` and `idefactory method propose`; the reviewer then records `idefactory method review` and rejects a class that does not fit the diff.
12. If completion fails on an `accepted` attempt because a required red is missing, use `idefactory attempt reopen <attemptId> --kind <kind> --for method|exception --by <id> --reason "text"` (an identity other than the implementer; at most twice; the earlier verdict goes to the review history and a reviewer must accept again), then cover the kind with `method propose` or a red exception. It is not a substitute for review.
12. If the red step stopped with `vacuous-red`, record an `already-satisfied` method first (see `factory-tdd` step 8). Only when that proposal is refused, ask the human first and use `idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind> --note "reason" --approver <human>` or `idefactory red waive <targetAttemptId> --kind <kind> --note "reason" --approver <human>`. Waiving a red before the system is stuck is discouraged. Warn the human, and pass `--acknowledge-not-stuck` only after the human acknowledges the warning. Do not describe either as a red that ran. A red recorded after implementation is not test-first evidence; a human can invalidate it with `--invalid-red "reason"` on `idefactory red waive`, which does not replace passing verification, independent review, or lockouts. Reds are append-only: every `--red` for a kind is kept, the latest is the current red, and `idefactory red list <attemptId> [--json]` prints all of them with their digests. After an invalid-red waiver, one later failing `--red` is allowed for that kind and satisfies red when it starts after the waiver. It does not prove the test came first, so the reviewer judges that from the recorded evidence. A kind is invalidated at most once, and reuse and ordinary waivers still refuse `--red`.

A red that is not genuine, because it was recorded after implementation or failed on a fixture error, is withdrawn with `idefactory red invalidate` (see `factory-build`). The withdrawal grants nothing, and a waiver does not replace passing verification, distinct review, or lockouts.
