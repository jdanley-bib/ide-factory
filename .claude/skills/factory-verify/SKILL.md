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

1. Read the work item `verificationProfile` and `checks` from the packet or `.factory/work/items/`.
2. Run `idefactory verify status <attemptId>`. A check that is `valid` is reused: its passing record still holds because only factory run-state changed since. Do not re-run it.
3. Map each remaining check (`stale`, `missing`, `failed`, `untrusted`, or whose reason says `re-run verify`) to a project command (unit, build, playwright, docs, etc.).
4. Run each command in the project. Do not describe a run you did not start.
5. Read the exit code and the failing lines. A skipped check is not a pass.
6. Record a failing test, when the task class is `code`, with `idefactory verify run <attemptId> --check <kind> --red`.
7. Record the passing run with `idefactory verify run <attemptId> --check <kind>`.
8. Do not put a verification result on an attempt transition. The verification command writes the record.
9. Stop when the command names `vacuous-red` or `infrastructure-failure`.
10. Claim ready for review only when required checks passed.
11. If the red step stopped with `vacuous-red`, ask the human first and use `idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind> --note "reason" --approver <human>` or `idefactory red waive <targetAttemptId> --kind <kind> --note "reason" --approver <human>`. Waiving a red before the system is stuck is discouraged. Warn the human, and pass `--acknowledge-not-stuck` only after the human acknowledges the warning. Do not describe either as a red that ran.
