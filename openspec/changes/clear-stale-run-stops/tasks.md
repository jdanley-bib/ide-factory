# Tasks

## 1. Stop classes and clearing

- [ ] 1.1 Replace `STICKY_STOP_REASONS` with budget, spend-ceiling, and condition classes in `src/lib/run-session.mjs` and make `openOrResumeRunSession` reopen a closed condition-stop session when the condition no longer holds, keeping run id and counters and appending to `clearedStops`; verify with `test/run-session.test.mjs` asserting an `unchanged-state`, a `host-usage-unavailable`, and an `invalid-budget` session each reopen with unchanged `agentSteps` once the condition is gone and stay closed while it holds.
- [ ] 1.2 Store `stopContext` (attempt id and vacuous kinds) when `verify run --red` closes the session; verify with a test that the stored context names the attempt and the kinds.
- [ ] 1.3 Clear a `vacuous-red` stop when every named kind has a later method proposal, waiver, reuse, valid invalidation, or genuine red, or when the work item points at another attempt, and keep it closed otherwise; verify with one test per resolution, one test with a partly resolved kind list staying closed, and one test for a session with no `stopContext`.
- [ ] 1.4 Emit `run.stop-cleared` with `runId`, `stopReason`, and `resolution`; verify with `test/event-log.test.mjs` that the event carries codes only.

## 2. Bounded new runs

- [ ] 2.1 Keep `max-agent-steps`, `max-tasks`, `wall-clock`, `max-failures`, and `retry-cap` closed without `--new-run`, and allow `--new-run` while session files for the change number at most `run.maxNewRuns` (default 3, range 1 to 20, out-of-range falls back to 3); verify with tests for the fourth new run being refused, a configured cap of 5, and the closed session file remaining.
- [ ] 2.2 Report a refused new run as a blocked state with invariant `new-run-cap` and a human resolver, and refuse `--new-run` for `max-tokens` and `max-cost` with a human resolver; verify with `test/blocked-states.test.mjs` and a run test.
- [ ] 2.3 Emit `run.new-run` with the previous stop reason; verify with an event-log test.

## 3. Defaults and advisory

- [ ] 3.1 Set `defaultMaxAgentSteps` to 120 in `templates/factory/config.json` and leave existing configs untouched; verify with `test/init.test.mjs` for a new config value and a byte-identical existing config.
- [ ] 3.2 Print the low-budget advisory when a created session has fewer than four agent steps per pending task, once per session; verify with a run test for a 20-step budget over 10 pending tasks and none for 120 steps.

## 4. Exceptions, help, and guidance

- [ ] 4.1 Update the exception commands' note (`EXCEPTION_NEW_RUN_NOTE`) so it says the next `run` reopens the session once the stop condition is resolved; verify with `test/red-exceptions.test.mjs` asserting the session file is unchanged by the exception and the next run reopens it.
- [ ] 4.2 Update `run` help for `--new-run` and the cap, leaving global usage unchanged; verify with `test/command-help.test.mjs`.
- [ ] 4.3 Update the `factory-run` skill and adapter copies so it no longer says only the human may pass `--new-run` after `vacuous-red`, and describes the cap; verify by regenerating adapters and running the adapter and run-skill tests.
