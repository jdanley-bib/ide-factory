# Tasks

## 1. Classification and report

- [x] 1.1 Add `src/lib/autonomy.mjs` with the ordered classification table (handled, redundant, policy-decision, failure) and the policy set; verify with table-driven unit tests for every invariant code and for the order rule that an avoidable policy-set stop is `redundant`.
- [x] 1.2 Add the event reader that pairs `blocked.recorded` and `blocked.resolved` events and finds human decision events between them to derive autonomous recoveries; verify with unit tests for a recovered transient failure, a recovery interrupted by a human approval, and an unresolved stop.
- [x] 1.3 Extend the event allowlist in `src/lib/event-log.mjs` with the stop fields only, and make the reader skip events with no `actor` into an `unclassifiedEvents` count; verify with the existing `test/event-log.test.mjs` passing and a new test for the skipped events.

## 2. Command

- [x] 2.1 Add `idefactory autonomy report [--change] [--since] [--json]` to `src/lib/run.mjs` printing counts by category, invariant, and work item, the list of interventions, handled stops, autonomous recoveries, `routineClean`, and the scope statement; verify with tests for the text and JSON output and a directory-digest test showing no file changes and no event appended.
- [x] 2.2 Validate `--since` and `--change` and handle an empty or missing log with zero counts and a stated reason; verify with tests for a malformed `--since`, a missing log, and an empty log.
- [x] 2.3 Add the help entry for `autonomy report` without changing the global usage text, and mention the command in the README and the `factory-run` and `factory-coordinator` skills, then copy to adapter paths and run `node scripts/build-adapter-history.mjs`; verify with `node --test test/command-help.test.mjs test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs`.
- [x] 2.4 Add a test that an approval note and a check log containing a secret-like string never appear in the report or the events it reads; verify the test passes.

## 3. Local acceptance run

- [x] 3.1 Build the scripted deterministic agent and a three-task fixture change under `test/` that run planning handoffs, implementation with red, verification, independent review under a different identity, and completion, driven by `run --json`; verify with a test that completes every task and asserts a `routineClean` report with only expected policy decisions.
- [x] 3.2 Add the recoverable-failure scenario with a check that fails once for an infrastructure reason; verify with a test that asserts one autonomous recovery, no intervention, and a bounded number of agent steps.
- [x] 3.3 Add the unrecoverable-loop scenario with a check that always fails; verify with a test that asserts the run stops within the configured `max-failures` and `max-agent-steps` with a blocked-state report, and fails if the count of requests received exceeds the bound.
- [x] 3.4 Add the decision-survival scenario with a human decision recorded before the run; verify with a test that every role's packet lists it and that the report shows no new intervention for it.
- [x] 3.5 Add the out-of-authority scenario with a task needing `deploy`; verify with a test that the run pauses with a `policy-decision` intervention, that a marker file standing for the effect is absent, and that after the authorization is recorded the run resumes with no further intervention.
- [x] 3.6 Make each scenario skip with a named reason until the change that provides its capability is present, and fail when a skip reason is no longer true; verify with a test of the skip helper.

## 4. Cloud acceptance record

- [x] 4.1 Write `docs/cloud-acceptance.md` describing the seven required behaviors, how to run each through a real trigger, what identifiers prove it, and the rule that mocks and fixtures do not count and that the pull request is not approved by its producer; verify by reading it against the `autonomy-acceptance` spec, with a test that it names all seven behaviors.
- [x] 4.2 Add `docs/acceptance/azure-devops-mcp.md` and `docs/acceptance/github-automation.md` with every behavior `not-run` and `not-available` respectively, and a format test that rejects a missing behavior, a `passed` outcome with a fixture, path, or `mock:` identifier, and a reviewer equal to the producing agent; verify with passing and failing fixture records.

## 5. Integration

- [ ] 5.1 Run `npm test` and `npx openspec validate measure-autonomy --strict`; verify both exit zero.

## Workflow follow-up

- Run `docs/cloud-acceptance.md` against a real Cursor Automation and the Azure DevOps MCP transport after [PR #26](https://github.com/jdanley-bib/ide-factory/pull/26) lands, with a reviewer other than the producing agent, and record the outcomes in `docs/acceptance/azure-devops-mcp.md`. This needs a provider connection and a human, so it is not a factory work item.
- Run the same acceptance for GitHub Automation when a supported transport exists, and record it separately.
- Archive the change after the project's review requirements are satisfied.
