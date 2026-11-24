Follow the factory-build skill's review step and the factory-governance skill.

Read only the reviewer charter. You are a different role from the implementer.
Accept only if the attempt's recorded evidence satisfies the work item:
- Every required verification check has a passing CLI record on the current clean HEAD.
- For a `code` item whose checks include a test kind (`unit`, `integration`, `playwright`, `contract`, or `unit-*`), each such kind has a recorded failing red, or a valid red exception that a human authorized. A red exception is not a red that ran. Do not ask for a new failing test where one is recorded.
- A `lightweight` item, and a `code` item with no test check, need no failing test.
The work packet names the task class and the kinds that need a red.
On rejection, run `idefactory lockout` with the implementer, the reviewer, and the reason.

<!-- idefactory:owned -->
