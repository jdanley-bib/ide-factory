# Proposal

## Why

Part of #54 and #51. Agents follow the guidance they are shipped, and the guidance still says things the code no longer does or never did. The `factory-tdd` and `factory-verify` skills tell the agent to "ask the human first" on `vacuous-red`. The `factory-build` skill does the same under "Red exceptions". The `factory-run` skill says only the human may pass `--new-run`, and the shared routine-steps block repeated in the rules and four skills says it again. Each of those sentences stops an autonomous agent at exactly the point where the factory now offers it a supported step. Only one block of guidance is held identical by a test today, so the other sentences drifted as the CLI changed.

Separately, the blocked-state table advertises recovery options in states the commands refuse. `propose-method` is listed for `red-confirmed` and `verifying`, while the command accepts `planned`, `assigned`, and `implementing`. An agent that follows an advertised option and is refused learns to stop trusting the report.

## What Changes

- A second shared guidance block, `## Blocked states and authority`, ships identical in the Cursor, Cline, and Copilot rules and in the `factory-run`, `factory-coordinator`, `factory-governance`, and `factory-openspec` skills. It is generated from the authority table and the blocked-state table, so the list of human-only gates cannot drift from the code.
- `scripts/build-guidance.mjs` regenerates the block into the templates, and a test fails when a template differs from what the script would write.
- The stale sentences are removed or rewritten: `vacuous-red` in `factory-tdd`, `factory-verify`, and `factory-build` points to the supported agent options first (already-satisfied method, red invalidate) and to a human only for the options the table marks `human`; `factory-run` no longer says only the human passes `--new-run`; the routine-steps block states the bounded agent `--new-run`.
- A guidance test scans the shipped templates for human-only phrasing ("ask the human", "only the human", "wait for the human") and fails unless each occurrence is in an allowlist keyed to a human-level gate from the table or a named reserved reason.
- A conformance test runs each blocked-state option that names an attempt state against a project in that state and fails when the command refuses it for a state reason, so the table can only advertise what works.
- The README sticky-stop list and any other prose copy of the stop rules are updated to match.

## Capabilities

### Modified Capabilities

- `ide-adapters`: the second shared block, generated and drift-tested; the allowlist rule; the separate-requests wording.
- `blocked-states`: advertised options are accepted in the state that advertises them.

## Impact

- `templates/cursor/rules/factory.mdc`, `templates/cline/rules/factory.md`, `templates/copilot/factory.agent.md`, `templates/skills/factory-{run,coordinator,governance,openspec,tdd,verify,build}/SKILL.md`, their adapter copies, `templates/adapter-history.json`, `README.md`.
- New `scripts/build-guidance.mjs`; `test/guidance-block.test.mjs`, `test/guidance-human-allowlist.test.mjs` with `test/fixtures/guidance-human-allowlist.json`, `test/blocked-options.test.mjs`.
- Depends on `truthful-authority-levels` (the table the block is generated from), `already-satisfied-method`, `agent-red-invalidation`, and `clear-stale-run-stops` for the behavior the guidance describes.
- No new dependencies. The Cursor rule is regenerated with `idefactory upgrade`, not edited by hand.

Out of scope:

- The `factory-cloud` skill, whose stop rules were set by `agent-judged-operation-retries` and stay as they are.
- Install decisions. Running `idefactory init` still waits for a person, and the allowlist names that as a reserved reason.
- Rewording unrelated guidance.
