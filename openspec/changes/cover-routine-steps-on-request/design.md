# Design

## Context

One sentence carries the wait rule: "`sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks for that action." It appears in `templates/cursor/rules/factory.mdc`, `templates/cline/rules/factory.md`, `templates/copilot/factory.agent.md`, and the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skills, and from those in the installed copies under `.cursor`, `.cline`, `.github`, `.agents`, and `.claude`. `test/pr-guidance.test.mjs` pins the sentence and checks that each of the seven command names appears in the rule and in the run skill. The `ide-adapters` spec requires the sentence. Installed files carry the `<!-- idefactory:owned -->` marker and are refreshed on upgrade only when unmodified relative to a known baseline in `templates/adapter-history.json`.

The sentence is guidance, not enforcement. The CLI already enforces the profile human gate, lockouts, `HALT`, budgets, the writer lease, and independent review. The wait sentence therefore adds a conversational prompt on top of enforced limits, and it also stops agents at steps that have no external effect.

## Goals / Non-Goals

**Goals:**

- A request to run, or to run the full pipeline, is enough for the routine steps.
- An external-effect action is checked, not asked about.
- One wording that cannot drift between adapters.

**Non-Goals:**

- Changing any enforced gate.
- Covering `approve`, archive, or spec sync.

## Decisions

**1. The cover is defined by the request, bounded by the run.**
The cover starts when the human asks to run or to run the full pipeline for a named change and ends when the run stops. It does not carry to another change or to a later session. A bounded cover keeps the human's intent tied to a specific scope, which is what #51 asks for ("applicable authority") without a standing blanket permission.

**2. Four steps are covered; four stay separate.**
Covered: `sync-tasks`, `run`, `verify`, `complete`. Separate: `approve`, `ci scaffold`, archive, spec sync. `approve` is the human's own record and the CLI requires a verified principal that is not the implementer, so an agent cannot satisfy it for itself. `ci scaffold` writes a workflow into the repository that later runs on a hosted service, which is a setup decision rather than part of building a change. Archive and spec sync decide the project's specification history and are already guarded by the deliverable check. If the maintainers want any of these covered, it is a one-line change to the block and the drift test.

**3. External effects use `authorize`, with a stop rule and a no-ask rule.**
The block tells the agent to run `idefactory authorize` before any publish, deploy, spend, or account creation. `authorized: true` means proceed without asking, which removes the case where a human gave a standing authorization and the agent asks anyway. `authorized: false` means stop and report the reason and the `approve` command the report prints. This depends on `align-approval-actions`. The block must not ship before that command exists, because the guidance would name a command that fails.

**4. Enforced gates are named so the cover is not read as a waiver.**
A profile human gate, a lockout, `HALT`, a budget stop, and independent review remain. The sentence about `--new-run` stays because the CLI cannot tell whether a human or an agent passed the flag, and the `bounded-run-sessions` spec already requires that only a human does so after `vacuous-red` or `retry-cap`.

**5. One block with a heading, extracted and compared by a test.**
All seven template files gain the same section under the heading `## Routine steps and external effects`, and the drift test extracts the text from that heading to the next heading or the ownership marker and compares it across every shipped copy in `templates` and in each adapter path. Alternative: assemble the files from a fragment at install time. Rejected: it changes how adapters are rendered and upgraded for one paragraph, and the history digests would need to follow the assembled output anyway.

Proposed block:

```
## Routine steps and external effects

When the human asks you to run, or to run the full pipeline, for a change, that request covers `sync-tasks`, `run`, `verify`, and `complete` for that change, with the attempt, red, and method records they involve. Do not ask again before each of them. The cover ends when the run stops and does not extend to another change.

These still wait for a separate human request: `approve` (the human's own record; never run it for yourself), `ci scaffold`, archive, and spec sync. Only a human passes `--new-run` after a budget stop, `vacuous-red`, or `retry-cap`.

The cover does not waive a true profile human gate, an active lockout, `HALT`, a run budget stop, or independent review.

Before any action with an external effect (publish, deploy, spend, creating an account), run `idefactory authorize` and proceed only when it reports `authorized: true`. When it reports `authorized: false`, stop and report the reason and the `approve` command. When it reports `authorized: true`, do not ask the human whether to proceed.
```

**6. Upgrade behavior is unchanged.**
The rebuilt `adapter-history.json` adds the new digests, so an unmodified old file upgrades to the new text and an edited file is preserved and reported. The legacy-release fixtures stay as they are because they represent the old text.

## Risks / Trade-offs

- [An agent reads the cover as permission to skip a human gate] → The block names the enforced gates, and the CLI enforces them whatever the text says.
- [A human meant "run" for one task and the agent covers everything] → The cover is for the named change and ends at the run's stop. A request that names a single step covers that step only.
- [The block names `authorize` before the command exists] → The tasks order the change after `align-approval-actions`, and the drift test includes the command name so a partial landing fails loudly.
- [Copies drift again] → The drift test.

## Migration Plan

Land after `align-approval-actions`. Rebuild adapter history, then ship. Projects that upgrade get the new text on unedited files. Rollback is reverting the templates and history; an installed file that already took the new text is treated as modified relative to the old baseline, so a project that rolls back should reinstall adapters.

## Open Questions

- Whether a single-item `/factory-build` request should also cover `verify` and `complete` for that item. It is left as it is now because the request named run and the full pipeline only.
