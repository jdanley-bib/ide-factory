# Proposal

## Why

Part of #51 (requested outcome "make autonomy measurable", regression scenario 7, and the cloud acceptance section). The factory cannot say how often it asks a human, why, or whether the ask was necessary. Stops are recorded, but nothing separates a stop that exists on purpose (an approval for an external effect) from a stop caused by a missing recovery path or by a question whose answer was already given. Without that, changes such as `align-approval-actions` and `actionable-blocked-states` cannot be shown to help, and the issue's goal of "say go and walk away" has no test.

Two kinds of proof are missing. First, a repeatable local end-to-end run: several tasks, a recoverable failure handled without a person, an unrecoverable loop that stops quickly, a human decision that survives handoffs, and an out-of-authority step that pauses. Second, a record that a real cloud trigger can carry a change to a review-ready pull request. The issue says explicitly that mocked CLI tests do not count for the second.

## What Changes

- New read-only `idefactory autonomy report [--change <name>] [--since <iso>] [--json]` derived from the control event log. It reports human interventions by category (`policy-decision`, `failure`, `redundant`), by unmet invariant, and by work item; stops handled without a human; and autonomous recoveries (a stop with no human actor that a later run resolved without a human decision).
- Deterministic, table-based classification. A stop that needs a human and was intentional is a `policy-decision`. One with no supported recovery, or an unclassified one, is a `failure`. One where a supported resolving option for an agent existed is `redundant`. The report states `routineClean` when there are no failures and no redundant prompts.
- The report uses codes only. It carries no approval notes, reasons, or check output.
- An executable end-to-end acceptance test with a scripted deterministic agent, covering a multi-task change through planning handoffs, implementation, checks, independent review, and completion; a transient failure retried within budget and documented; a task that always fails stopping promptly with a report; a prior human decision visible to each role without a new prompt; and an unauthorized external effect pausing and not being performed. The test asserts the report's counts and categories.
- A cloud acceptance runbook and a record format. A record names the provider, trigger, run link, commit, and outcomes for each required behavior. Records start as `not-run`. A record can be `passed` only with a real run's identifiers; a provider that has no supported transport yet is `not-available`. Mocked or local-fixture evidence cannot set `passed`, and the pull request is never approved by the agent that produced it.
- **BREAKING**: none.

## Capabilities

### New Capabilities

- `autonomy-measurement`: the report command, categories, classification, autonomous recoveries, and the code-only guarantee.
- `autonomy-acceptance`: the executable local acceptance run and the cloud acceptance record.

### Modified Capabilities

- `factory-event-log`: stop and resolution events carry code fields only.

## Impact

- New `src/lib/autonomy.mjs` (classification table and report), `src/lib/run.mjs`, `src/lib/command-help.mjs`, `src/lib/event-log.mjs` (allowlist for the fields the report reads).
- New `test/autonomy-acceptance.test.mjs`, `test/autonomy-report.test.mjs`, and fixtures under `test/fixtures/`.
- New `docs/cloud-acceptance.md` and `docs/acceptance/<provider>.md` records, plus a format test.
- `README.md` and the shipped skills mention `autonomy report`.
- Depends on `actionable-blocked-states` for the actor, invariant, and recoverability data, and on the other changes for the scenarios the acceptance run exercises. The cloud record depends on [PR #26](https://github.com/jdanley-bib/ide-factory/pull/26) (or its successor) landing for the Azure DevOps MCP transport.
- No new dependencies.

Out of scope:

- Building a cloud trigger or any provider transport. This change defines and records the acceptance, it does not implement the integration.
- Measuring prompts typed into an IDE chat. The report covers interventions the factory records.
- Scoring agent quality. The scripted agent proves the factory's mechanics, not a model's judgment.
