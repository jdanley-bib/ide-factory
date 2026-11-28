# Design

## Context

`setupReadinessErrors(project)` returns `missing test decision` and `missing principal verifier` (policy version 2). `doctor` and the `setup` command use it. `run` and `next` do not, so a project in that state reaches the baseline step and fails there. Marker problems are detected in `adapters.mjs` with reasons such as "the end marker comes before the start marker", and the note ends with "Repair them by hand." The blocked report already carries options with commands, and JSON output prints them.

## Decisions

### D1. Setup is the first check of `run` and `next`

Before opening or resuming a session, and before any baseline, `run` and `next` call `setupReadinessErrors`. A non-empty result throws `BlockedError(message, 'setup-incomplete', { gaps })` and is reported like any other stop with stop reason `blocked`. No session file is created, so no zeroed counters appear and no agent step is consumed. The message lists the gaps and says one answer is needed from a person.

`setup-incomplete` is added to `BLOCKED_TABLE` with retry class `only-after-change`. Options, in order:

1. `record-setup`: `idefactory setup --governance <lightweight|strict> --test <argv...>` or `--no-test`, authority `human`, enforcement `none`, "the project's test command and governance mode are a project decision". This is first because it is what resolves the stop.
2. `detect-setup`: `idefactory setup --detect`, authority `agent`, read-only, "print stack proposals the person can confirm".

The report's actor is `human`, which is accurate: the factory cannot decide which command is the project's test. A person answers once per project.

### D2. Existing projects

A project that already has a recorded decision never sees the check. A project without one would have failed at its baseline, so the new stop trades a confusing late failure for a clear early one. The check runs only when `.factory/` exists, so `run` outside a factory project keeps its existing error.

### D3. Marker diagnosis

The marker scan already finds the markers and the reason. It also records the 1-based line numbers of each marker found. The note becomes: file, the problem, the line numbers, and one sentence of repair chosen by case:

- start with no end: "add `<!-- idefactory:end -->` on its own line after the factory section that begins at line N, or delete the start marker at line N"
- end with no start: the mirror
- end before start: "swap them, or delete the pair and run `idefactory upgrade` to append a fresh section"
- repeated markers: "keep one pair, delete the others"

The note says an agent may make the edit and run `idefactory upgrade` again. The adapter planner still treats the file as malformed and unchanged until the edit is made, so no write behavior changes.

### D4. `Next:` in text output

When a run or next stop has a report, the text output prints `Next: <command>` for the first supported option, followed by who may run it in words ("an agent", "an identity other than the implementer", "a person"). It reads the same option the JSON report lists first, so text and JSON cannot disagree. When the report has no supported option, the text says so and names a person. The line is added after the existing stop lines, so scripts that read earlier lines are unaffected.

### D5. Doctor

`doctor` lists each malformed adapter file with the same note text, using the shared helper. It already lists setup gaps, so no change there beyond sharing the message.

## Risks and trade-offs

- A stop before the baseline might surprise a project that deliberately runs with no tests. That project records `--no-test` once, and the stop explains how.
- The marker repair sentence could be wrong for an unusual file. It is advice. The planner's behavior does not change, and a wrong edit leaves the file malformed and reported again.
