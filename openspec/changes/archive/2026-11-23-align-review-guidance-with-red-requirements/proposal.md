# Proposal

## Why

The generated review guidance tells reviewers to "accept only if a failing test was written first" and that "acceptance requires red evidence", with no conditions. The CLI is conditional. A transition into `verifying` needs a recorded failing red, or a valid human-authorized red exception, only for a non-`lightweight` item whose checks include a test kind. A reviewer who follows the unconditional wording can reject valid lightweight work, a code item with no test check, or an attempt whose red is a recorded exception, and can ask for a failing test that cannot exist ([issue #32](https://github.com/jdanley-bib/ide-factory/issues/32), related to #27). The reviewer also cannot tell which case applies, because the work packet does not state the task class or which checks need a red.

## What Changes

- Rewrite `templates/commands/factory-review.md`, the Review section of the `factory-build` skill, and the unconditional red lines in the `factory-build` Method so review requires what the CLI requires:
  - every required verification check has a passing CLI record on the current clean HEAD;
  - a `code` item with a test check (`unit`, `integration`, `playwright`, `contract`, `unit-*`) has a recorded failing red for each such kind, or a valid recorded red exception for it;
  - a `lightweight` item, or a `code` item with no test check, needs no red and no new failing test.
- State that an exception is not a red that ran, that a reviewer relies on the evidence recorded on the attempt, and that a reviewer does not ask for a new failing test where a valid exception is recorded.
- Keep review by a different role, clean-revision verification, lockouts, and every CLI gate exactly as they are. This is a guidance change, not a relaxation.
- Make the engineer and reviewer charters installed for a new project use the same conditions.
- Add `Task class` and `Red required for` lines to the work packet, so the reviewer and the implementer can see which case applies.
- Make the run request for a `code` item with no test check say that a failing test is not required and route to `verifying`, as it already does for a `lightweight` item. Today it asks for a red that the gate does not require.
- Ship the same wording in the source templates and every generated and checked-in adapter copy, and add regression tests over each.

Out of scope:
- Changing any CLI gate, red exception rule, or the independent-review requirement.
- Refreshing charters in projects that already have them. Init writes a charter only when it is missing, and that is not changed here.
- Protecting project-edited adapter files from being overwritten on `init` or `upgrade` ([issue #31](https://github.com/jdanley-bib/ide-factory/issues/31)).
- New wording for the `factory-tdd`, `factory-verify`, or `factory-debug` skills, which already state the task-class condition.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-build`: adds requirements that review guidance matches the red gate, that the work packet states the task class and the red requirement, and that a run request for a code item with no test check does not ask for a failing test.
- `ide-adapters`: adds a requirement that every generated review command and every shipped copy of the build skill carry the same conditional review wording.

## Impact

- Code: the packet text in `src/lib/queue.mjs` and the implementing-stage routing and message in `src/lib/orchestrate.mjs`.
- Templates and copies: `templates/commands/factory-review.md`, `templates/skills/factory-build/SKILL.md`, and the engineer and reviewer charters under `templates/factory/agents/`. The generated copies are the four command directories (`.cursor/commands`, `.claude/commands`, `.github/prompts`, `.cline/workflows`) and the five skill directories that this repository checks in.
- Tests: new regression tests over the templates, a fresh init, and the checked-in copies, plus packet and orchestration tests.
- No new dependencies and no change to `.factory/` state formats. A project picks up the new wording with `idefactory upgrade`, which replaces adapter files wholesale as it does today.
