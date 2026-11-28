# Tasks

## 1. Setup preflight

- [x] 1.1 Call `setupReadinessErrors` at the start of `run` and `next` when `.factory/` exists, throwing a blocked error with invariant `setup-incomplete` before any session or baseline work; verify with `test/orchestrate.test.mjs` asserting no session file is created, no agent step is consumed, and the message names both gaps when both exist.
- [x] 1.2 Add the `setup-incomplete` row with the `record-setup` and `detect-setup` options and their authority labels; verify with `test/blocked-states.test.mjs` for code, actor `human`, option order, and the exact commands.
- [x] 1.3 Record the stop as an event through the shared stop path and verify it clears when setup is recorded; verify with a test that `blocked.recorded` is appended once and a later successful run emits `blocked.resolved`.
- [x] 1.4 Confirm a project with a recorded decision and `run` outside a factory project behave as before; verify with tests for both.

## 2. Marker repair

- [x] 2.1 Record marker line numbers in the marker scan and build the repair sentence per case in D3 in one helper; verify with `test/adapters-apply.test.mjs` for start with no end, end with no start, reversed, and repeated markers, asserting the file name, line numbers, and sentence.
- [x] 2.2 Use the helper in the `--replace` and `--force` notes and in `doctor`; verify with tests asserting the same text in all three and that the file is unchanged.
- [x] 2.3 Update the `factory-setup` skill and adapter copies so an agent applies the printed edit and reruns upgrade; verify by regenerating adapters and running the adapter tests.

## 3. Text next step

- [x] 3.1 Print `Next:` with the first supported option and who may run it after text stops from `run` and `next`, and print the no-supported-option message with a person otherwise; verify with tests for `rejected`, `blocked`, `vacuous-red`, and a report with no supported option, and a test that text and JSON name the same option.
- [x] 3.2 Document the line in `run` help without changing the global usage text; verify with `test/command-help.test.mjs`.
