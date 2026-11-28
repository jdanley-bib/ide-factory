# Proposal

## Why

Part of #54 and #51. Three smaller frictions remain after the dead ends and the mislabeled authority:

1. **Setup gaps surface late.** `doctor` and one `run` code path report a missing test decision or a missing principal verifier, but the run loop itself does not check. A project with no recorded test decision starts a session, spends agent steps, and fails at the baseline or the first verification with an error that does not say setup is the cause. The gap is a one-time human decision (which command is the project's test, and how strict governance is), so the loop should stop on it first, plainly, before spending anything.
2. **Malformed instruction markers give an agent nothing to do.** When `upgrade` finds an unpaired or reversed `idefactory:start` or `idefactory:end` marker in `AGENTS.md`, `CLAUDE.md`, or the Copilot instructions, it leaves the file alone, which is right, and says "Repair them by hand." The file is a project file the agent can edit, and the exact fix is mechanical, but the message names neither the lines nor the edit.
3. **Text stops do not say what to run.** `run` prints the stop reason in text mode, and the supported next command appears only in the JSON report. An agent not using `--json`, which is most of them, sees `rejected` or `blocked` and no instruction.

## What Changes

- `run` and `next` check `setupReadinessErrors` first. When it is non-empty they stop with a blocked report, invariant `setup-incomplete`, without creating a session or running a baseline. The report's first option is recording the setup decision (a person confirms the test command and governance mode), and its second is `idefactory setup --detect`, which lets an agent prepare the proposal for that person. The stop is recorded as an event like any other.
- The malformed-marker note names the file, the line numbers of the markers found, what is wrong, and the exact edit that fixes it, and says an agent may make that edit and run `idefactory upgrade` again. Upgrade still never writes the file itself.
- Text output of a blocked stop prints a `Next:` line with the first supported option for an agent (or independent identity) and its command. It prints a person only when the first option's level is `human`.
- `doctor` lists malformed adapter files with the same exact-repair text.

## Capabilities

### Modified Capabilities

- `guided-setup`: the run loop checks setup first.
- `blocked-states`: the `setup-incomplete` invariant and the text `Next:` line.
- `adapter-ownership`: malformed markers come with the exact repair.

## Impact

- `src/lib/setup.mjs` (readiness already exists), `src/lib/orchestrate.mjs` and `src/lib/run.mjs` (preflight, `Next:` line), `src/lib/blocked-states.mjs` (new row), `src/lib/adapters.mjs` (marker diagnosis and note), `src/lib/govern.mjs` (doctor), `src/lib/command-help.mjs`, the `factory-setup` skill and adapter copies.
- `test/setup.test.mjs`, `test/orchestrate.test.mjs`, `test/blocked-states.test.mjs`, `test/adapters-apply.test.mjs`, `test/doctor.test.mjs`.
- No new dependencies.

Out of scope:

- Choosing the project's test command or governance mode. It is a project decision, and `setup` keeps its confirm step.
- Writing the marker repair automatically. The agent edits the file with its normal tools.
- Running `idefactory init` on behalf of a project. Installing the factory stays a person's decision.
