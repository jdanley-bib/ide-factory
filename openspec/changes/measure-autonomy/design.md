# Design

## Context

Control events are written by `appendControlEvent` in `src/lib/event-log.mjs` to `.factory/observability/events.jsonl`. The writer drops any field not on an allowlist (`type`, `time`, `id`, `change`, `task`, `attemptId`, `runId`, `commandDigest`, `exitCode`, `stopReason`, `agent`, `resolver`, `exceptionType`), and the `factory-event-log` spec says events never carry notes, reasons, environment values, or check logs and are neither evidence nor a queue. `status --json` already derives a read model from stored records and does not write. The `bounded-run-sessions` spec makes every run stop carry one stop reason. `actionable-blocked-states` adds, for each reported stop, an invariant code, an actor, a retry class, and whether a supported resolving option for an agent existed, and it appends `blocked.recorded` and `blocked.resolved` events with those fields.

## Goals / Non-Goals

**Goals:**

- Show, from recorded events, how often a human was needed and why.
- Make a clean ordinary run a testable outcome.
- Say precisely what a cloud integration must show before it is called proven.

**Non-Goals:**

- Building any cloud transport.
- Judging model quality.

## Decisions

**1. The report is a pure read model over events.**
`autonomy report` reads `events.jsonl` and nothing else. It writes no file and appends no event, like `status --json`. Classification happens at read time from a table in `src/lib/autonomy.mjs`, so a better table reclassifies history without rewriting it. Alternative: write an `intervention.recorded` event at the stop. Rejected: it freezes a classification into an append-only log and duplicates `blocked.recorded`.

**2. Classification is ordered and small.**
For each `blocked.recorded` event: if the actor is not `human`, the stop is handled and not an intervention. Otherwise, if `agentActionable` is true, it is `redundant`. Otherwise, if the invariant is in the policy set (`approval-missing`, `halted`, `reviewer-lockout`, `budget-exhausted`, and `reconciliation-required` when its actor is the human), it is `policy-decision`. Everything else, including `unclassified`, is `failure`. The order matters: an avoidable stop is redundant even when its invariant is normally a policy one. The table and the order are in one place and have table-driven tests.

**3. Autonomous recovery is derived from resolution events.**
A recovery is a `blocked.recorded` event with a non-human actor and a later `blocked.resolved` event for the same change and task, with no human decision event (`approval.issued`, `decision.rejected`, red exception, lockout resolution, `attempt.reopened` by a human, `tasks.reconciled` by a human) between them. Human decision events are already in the log, so no new event is needed.

**4. The report states its blind spot.**
It covers interventions the factory recorded. A person who answers a question in an IDE chat leaves no event. The scope line is printed in text and JSON so no one reads a zero as "no human involved" when the human was typing. The acceptance run avoids the blind spot by using a scripted agent with no chat.

**5. Codes only.**
The report reads only allowlisted fields and prints codes, ids, and times. The allowlist gains the stop fields from `actionable-blocked-states` (`invariant`, `actor`, `retry`, `agentActionable`, `resolvedBy`) and nothing that can hold free text. A test places a secret-like string in an approval note and in a check log and asserts it is absent from the report.

**6. The local acceptance run uses a scripted deterministic agent.**
`test/autonomy-acceptance.test.mjs` builds a fixture project with a three-task change, configures authority (profile gates and an `accept` approval flow for the internal steps through the verified-principal stub used by existing tests, and a standing `deploy` authorization held back until the out-of-authority step), and drives `idefactory run --json`. For each `agent-step` request the scripted agent performs the CLI calls its role would: implementer records red, implements, runs verify; reviewer, under a different identity, accepts; scribe completes. The script injects the scenarios: a check that fails once with an infrastructure error, a check that always fails, a human decision recorded before the run, and a task requiring `deploy`. It asserts the final counts and the `routineClean` value. It proves the factory's mechanics are coherent. It does not prove that a model makes good choices; that is outside what a deterministic test can show.

**7. The bound for the loop scenario is an assertion, not a hope.**
The test sets `max-failures` and `max-agent-steps`, counts the requests the scripted agent receives, and fails when the count exceeds the bound or the run does not stop with a blocked-state report. This makes "stop promptly" a number.

**8. Cloud acceptance is a record with a format check, not a test.**
`docs/cloud-acceptance.md` is the runbook. `docs/acceptance/<provider>-<transport>.md` is a record with front matter holding the fields the spec lists. A format test parses every record and fails when a behavior is missing, when a `passed` outcome cites an identifier that is a local fixture (a path, `file:`, `fixture:`, or `mock:` prefix), or when the reviewer equals the producing agent. New records are created `not-run`. A provider whose transport does not exist in the repository is `not-available`. The test cannot prove a real run; it prevents a record from claiming one without identifiers a mock cannot produce. Alternative: a script that executes the run. Rejected: it would need real provider credentials, and the issue says that a mocked CLI test must not count.

**9. The run itself is a human-started workflow.**
Executing the runbook requires a provider connection, a trigger, and a reviewer other than the agent, so it is a follow-up for the human and a cloud environment, not a task the factory selects. The tasks list it under workflow follow-up so `sync-tasks` does not create work items that cannot be completed without the cloud.

## Risks / Trade-offs

- [Classification disagrees with intent] → The table is small, tested, and shown in help; the report lists each intervention with its invariant so a reviewer can re-classify.
- [A zero reads as autonomy that did not happen] → The scope line, and the acceptance run's use of a scripted agent.
- [A scripted agent hides gaps a real agent would hit] → It exercises the CLI contract only; the cloud record is where real behavior is judged.
- [A record is edited to claim a pass] → The format check rejects fixture identifiers and a matching reviewer, and reviewers see the commit.
- [Depends on three other changes] → The acceptance test is written last and each scenario skips with a named reason until its dependency is present, so the order of landing does not break the suite.

## Migration Plan

No data migration. Events written before upgrade lack the new fields; the report skips events without an `actor` and counts them under `unclassifiedEvents`. Rollback is a code revert: the report command disappears and the extra event fields are ignored.

## Open Questions

- Whether the report should be included in `status --json`. It can be added later without changing these specs.
