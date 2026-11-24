# Implementation notes

## Verification results

- `openspec validate align-review-guidance-with-red-requirements --strict`: valid.
- `npm test`: 385 tests, 385 pass, 0 fail.
- `node src/cli.mjs doctor`: exit 0. The unmapped-check-kind warnings were already present.
- `node --test test/review-guidance.test.mjs`: covers the source and installed review command, every checked-in and installed `factory-build` copy, the charters, upgrade replacing an old unconditional command, and a waiver shown to the reviewer.

## Notes

- Checked-in adapter copies were regenerated with `node src/cli.mjs upgrade`. Only the review command and `factory-build` skill copies changed.
- This repository's own `.factory/agents/*/charter.md` files were not rewritten. Charters are written only when missing, so the new wording reaches new installs only.
- The packet computes `Task class` and `Red required for` from `taskType` and `requiredTestKinds`, so it matches the red gate. A `lightweight` item always shows `none`.
- `stageForState` now sends a `code` item with no required test kind from `implementing` straight to `verifying`.
- The `red waive` test uses `--acknowledge-not-stuck` to record the waiver without first producing a vacuous red.
- No pull request was opened. Per the workspace rule, `idefactory pr open <change>` is the human-started path.
