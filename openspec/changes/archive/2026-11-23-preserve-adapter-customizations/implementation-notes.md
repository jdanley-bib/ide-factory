# Implementation notes — preserve-adapter-customizations (task 8.4)

Final verification for issue #31. Commands were run in the repository root; exit codes and summaries are from those runs.

## Commands

### `npx openspec validate preserve-adapter-customizations --strict`

- Exit code: `0`
- Summary: `Change 'preserve-adapter-customizations' is valid`

### `npm test`

- Exit code: `0`
- Summary: `# tests 492`, `# pass 492`, `# fail 0`

### `node src/cli.mjs doctor`

- Exit code: `0`
- Summary: `doctor: ok`, `policy version: 2`, followed by the existing `unmapped check kind` warnings (unchanged by this change)

### `node scripts/build-adapter-history.mjs` and `node src/cli.mjs upgrade`

- The history table was rebuilt with 84 paths and did not change.
- Upgrading this repository reported `84 current` and wrote nothing. The committed `.factory/adapters.json` is the manifest from dogfooding the first upgrade.

## What changed against the proposal

- **`modified` status.** The proposal had two outcomes for an edited file. An edit with no upstream change would have exited 3 and staged a run on every upgrade forever. It is now `modified`: listed, kept, nothing staged, exit 0. It becomes `preserved` when its template next changes. `--replace <path>` also replaces a modified file; `--force` replaces preserved files only.
- **Malformed instruction sections.** An unpaired, reversed, or repeated marker pair is reported as `malformed`, left untouched, and exits 3. Neither `--force` nor `--replace` rewrites it.
- **Legacy fixture.** `test/fixtures/legacy-release/` holds the full rendering of the release before the conditional review guidance. The history guard test requires that every fixture file is recognized by the shipped table, and the end-to-end test upgrades from it with LF and CRLF files.
- **Existing tests.** The three tests that wrote an invented body at a generated path and expected a replace now cover both cases. An unmodified copy from an older release is replaced. An edited copy is kept: an edit with nothing new upstream is `modified` (exit 0), and in the review-command test the edit meets a changed template, so it is `preserved`, exits 3, and stages the incoming copy.

## Caveats

- Tasks 7.2 and the README test (8.3) passed as soon as they were written, because the planner and the extension inlining they exercise already existed. They guard the behavior against regression.
- A file that an earlier release overwrote cannot be recovered by this change. Only git history holds it.
- The history table is append-only. A release that changes a template must re-run `node scripts/build-adapter-history.mjs`; the guard test fails until it does.
- No model was launched. No pull request was opened, and this change was not archived.
