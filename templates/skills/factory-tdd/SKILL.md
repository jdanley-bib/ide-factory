---
name: factory-tdd
description: >
  Write a failing test before production code for a factory task. Use when
  factory-build is implementing and no test-driven-development skill is installed.
---

# Factory test-first

<!-- idefactory:owned -->

The IDE session model does the work.

Run `idefactory help <command>` for a command's usage, flags, and examples. `idefactory help verify run` lists the check flags. Add `--json` for structured output. Do not read the CLI source to learn usage.

0. Test-first (`red-first`) is the default method. If a failing test cannot specify the change (documentation or text, configuration, a behavior-preserving refactor with an existing tracked test, a mechanical edit, or an exploratory spike), record `idefactory method propose <attemptId> --choice no-red --reason <docs-or-text|configuration|behavior-preserving|mechanical|exploratory> --rationale "text" --implementer <id> --kind <kind>` before editing instead of faking a red. A different role must accept it. A task class a human set explicitly in `tasks.md` is not overridden.
1. Restate the backlog acceptance criterion as one observable behavior.
2. Write a failing test that fails because the behavior is missing, not because the test is broken.
3. Run `idefactory verify run <attemptId> --check <kind> --red` and read the failure. Stop if the command names `vacuous-red` or `infrastructure-failure`.
4. Write the minimum production code that makes the test pass.
5. Run `idefactory verify run <attemptId> --check <kind>` and keep the output.
6. Do not add production code for behavior the test does not cover yet.
7. Do not put a verification result on an attempt transition.
8. If step 3 stops with `vacuous-red` because the code already passes, ask the human first. They can authorize `idefactory red reuse <targetAttemptId> --from <sourceAttemptId> --kind <kind> --note "reason" --approver <human>` when a rejected attempt holds a genuine red, or `idefactory red waive <targetAttemptId> --kind <kind> --note "reason" --approver <human>`. Waiving a red before the system is stuck is discouraged. Warn the human, and pass `--acknowledge-not-stuck` only after the human acknowledges the warning. A red recorded after implementation is not test-first evidence: a human can invalidate it with `--invalid-red "reason"` on `idefactory red waive`, and the waiver does not replace passing verification, independent review, or lockouts.
