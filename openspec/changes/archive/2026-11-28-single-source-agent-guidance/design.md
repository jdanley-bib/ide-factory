# Design

## Context

`test/routine-steps-guidance.test.mjs` already extracts the block under `## Routine steps and external effects` from each shipped copy of the rules and four skills (in `templates/` and in every installed adapter path) and fails when one differs. That is the right mechanism, and it covers only that block. Other guidance is written per file. When the CLI changed, the per-file sentences did not.

## Decisions

### D1. A second generated block

The new block is `## Blocked states and authority`. It is extracted and compared exactly like the routine-steps block, using the same copy list, so adapter install, upgrade, and history handling need no new concept. Its content is generated, not hand-written:

1. How to act on a report: read `--json`; take the first supported option whose authority is `agent` or `independent`; for `independent` use an identity other than the implementer's, for example the reviewing role agent; never ask for a decision listed under standing decisions.
2. When a person is needed: a list of every gate whose level is `human`, generated from `AUTHORITY`, each with the command that records the human's decision.
3. Stop rules: retry class `never` stops; condition stops (`vacuous-red`, `unchanged-state`, `host-usage-unavailable`) clear when resolved, so resolve and run again, and do not pass `--new-run`; budget stops allow `--new-run` within the cap, and past the cap the report names a human.
4. The authority levels and enforcement labels in two lines each.

### D2. Generation, not a lint

`scripts/build-guidance.mjs` imports `AUTHORITY` and the blocked table, renders the block, and rewrites it in each template that carries the heading. `--check` renders without writing and exits non-zero on a difference. The test runs the check, so a change to the table that is not followed by a regenerate fails CI. Generated text is committed, because the adapters are installed from the committed templates.

Alternative considered: render at `upgrade` time from the installed CLI. Rejected because the installed adapter files are then no longer reviewable in the repository, and adapter history digests would stop matching a committed artifact.

### D3. Remove the stale sentences

The edits, by file:

- `factory-run`: replace the "New session (human only)" section with the rule in D1.3 and a pointer to the generated block.
- `factory-tdd` step 8 and `factory-verify` step 12 and `factory-build` "Red exceptions": on `vacuous-red`, first `method propose --reason already-satisfied` when the diff is test-only; then `red invalidate` when a stored red is not genuine; then the independent-level `red reuse` or `red waive` with an identity other than the implementer's. A person is named only where the table says `human`.
- The routine-steps block in all copies: the sentence ending "Only a human passes `--new-run` after a budget stop, `vacuous-red`, or `retry-cap`" becomes a statement that `--new-run` is for budget stops within the cap and that `vacuous-red` clears without it. The block's other text is unchanged, so the routine-steps drift test keeps its meaning and is updated once.

### D4. The human-phrase allowlist

`test/guidance-human-allowlist.test.mjs` scans the shipped templates for `ask the human`, `only the human`, `only a human`, and `wait for the human` (case-insensitive). Every hit must match an entry in `test/fixtures/guidance-human-allowlist.json`: `{ file, sentence, gate }`. `gate` must be a table gate whose level is `human`, or one of the reserved reasons listed in the same file: `product-decision` (the design conflicts with a recorded decision) and `install-decision` (installing the factory). The file is short and reviewed, and a new human-only sentence needs a visible entry and a reason.

### D5. Conformance of advertised options

`test/blocked-options.test.mjs` builds, for each option in the blocked table that has an attempt-state predicate, a temporary project with an attempt in each state the predicate allows and in one state it does not, runs the option's command with valid arguments, and asserts that the command is not refused for a state reason in allowed states and is refused in the disallowed one. The first corrections are `propose-method` (state list), `reopen-attempt`, and `waive-red`. This is a table-driven test, so a new option inherits the check by being added to the table.

### D6. Prose copies

`README.md` lists the sticky stops and who clears them. It is rewritten to the three classes from `clear-stale-run-stops` and links the authority table. Docs and templates under `.factory/` that restate the stop rules are updated in the same pass.

## Risks and trade-offs

- Generated text in templates means a table change touches many files. The script makes that one command, and the history test records the digest.
- The allowlist could be used to wave through any phrase. It is deliberately a reviewed file and each entry needs a gate that the authority table says is `human`.
- The conformance test needs fixture projects for each attempt state. Existing helpers in `test/helpers.mjs` and the attempt tests build those states, so the new test reuses them.
