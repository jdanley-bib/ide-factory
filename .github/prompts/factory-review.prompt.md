---
description: Review the current factory task as a different role
agent: factory
---

Follow the factory-build skill's review step and the factory-governance skill.

Read only the reviewer charter. You are a different role from the implementer.
Accept only if the attempt's recorded evidence satisfies the work item:
- Every required verification check is `valid` in `idefactory verify status <attemptId>`. A check is valid when its passing CLI record still holds at the current clean HEAD: the record's revision is HEAD, or the only changes since it are factory run-state. Rely on a `valid` check and do not re-run it. Re-run `idefactory verify run <attemptId> --check <kind>` only for a check that is `stale`, `missing`, `failed`, or `untrusted`, or whose reason says `re-run verify`. Reliance does not replace review: still review the change independently, and run a focused check yourself when the change warrants it.
- For a `code` item whose checks include a test kind (`unit`, `integration`, `playwright`, `contract`, or `unit-*`), each such kind has a recorded failing red, or a valid red exception that a human authorized. A red exception is not a red that ran. Do not ask for a new failing test where one is recorded. If the attempt has a `no-red` method, record `idefactory method review <attemptId> --verdict ACCEPT|REJECT --reviewer <id> --note "text"` first, and reject a method whose reason class does not fit the diff. The six reason classes are `docs-or-text`, `configuration`, `behavior-preserving`, `mechanical`, `exploratory`, and `already-satisfied`. For `already-satisfied`, the observed passes are vacuous reds and not a red that ran: confirm the cited tests cover the acceptance criteria, and reject the method if they do not.
- A `lightweight` item, and a `code` item with no test check, need no failing test.
The work packet names the task class and the kinds that need a red.
On rejection, run `idefactory lockout` with the implementer, the reviewer, and the reason.

<!-- idefactory:owned -->
