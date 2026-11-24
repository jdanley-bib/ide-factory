# Implementation notes

## Verification results

- `openspec validate evidence-file-for-attempt-transitions --strict`: valid.
- `npm test`: 373 tests, 373 pass, 0 fail.
- `node src/cli.mjs doctor`: exit 0.
- `node --test test/evidence-file.test.mjs`: covers the reader, every failure message, the CLI wiring, the skill, README, and help text, and a full attempt driven by evidence files.

## Notes

- `readTransitionEvidence` lives in `src/lib/evidence-input.mjs` and takes the working directory so a relative path resolves from the CLI's current directory.
- Inline `--evidence ''` still means no evidence, as before. `--evidence-file ''` and a bare flag with no value fail with the transition usage.
- The integration test writes the evidence files to the operating system temporary directory and covers a UTF-8 BOM file and a UTF-16LE file, then runs `verify run` and `complete` on the same project.
- No pull request was opened. Per the workspace rule, `idefactory pr open <change>` is the human-started path.
