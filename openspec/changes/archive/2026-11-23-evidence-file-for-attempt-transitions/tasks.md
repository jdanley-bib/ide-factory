# Tasks

## 1. Evidence reader

- [x] 1.1 Add failing tests in new `test/evidence-file.test.mjs` for `readTransitionEvidence`: inline JSON returns the object, a file holding a JSON object returns the same object, content with spaces, escaped quotes, and non-ASCII text round-trips unchanged, a UTF-8 BOM file and a UTF-16LE BOM file parse, and the file is left unmodified. Implement `readTransitionEvidence` in new `src/lib/evidence-input.mjs`. Verify with `node --test test/evidence-file.test.mjs`.
- [x] 1.2 Add failing tests for the failures: both sources given names both flags and says to include only one, either flag with no value fails with the transition usage, a missing path, a directory, an empty file, malformed JSON in the file, and JSON that is an array, string, number, boolean, or null each fail naming the file path, JSON text passed as the `--evidence-file` value fails as a missing file and points to `--evidence`, and malformed inline JSON names `--evidence-file`. Implement the checks and messages from design.md. Verify with `node --test test/evidence-file.test.mjs`.

## 2. CLI wiring

- [x] 2.1 Add failing CLI tests that `attempt transition` with `--evidence-file` produces the same stored attempt as the same evidence passed inline, that both flags together exit non-zero and leave the attempt file byte-identical, that a missing, empty, and malformed file each exit non-zero and leave the attempt byte-identical, that a caller-supplied verification result in the file is rejected like inline evidence, that the file still exists afterward on success and failure, and that existing inline `--evidence` calls behave as before. Replace the inline parse in `src/lib/run.mjs` with `readTransitionEvidence`, and change the help line and the usage error to show `[--evidence json | --evidence-file path]`. Verify with `node --test test/evidence-file.test.mjs test/orchestration.test.mjs test/review-comment.test.mjs test/writer-lease.test.mjs`.

## 3. Packet, skills, and docs

- [x] 3.1 Add a failing packet test in `test/queue.test.mjs` that the engineer packet names `idefactory attempt transition` and `--evidence-file`. Update the packet method line in `src/lib/queue.mjs`. Verify with `node --test test/queue.test.mjs`.
- [x] 3.2 Add a failing skill-text test in `test/evidence-file.test.mjs` over `templates/skills` and the `.cursor`, `.claude`, `.cline`, `.github`, and `.agents` skill copies of factory-build and factory-run. Each must name `--evidence-file`, name `--evidence` as the inline alternative with only one allowed, tell the session to create the file in the operating system temporary directory and not inside the project, and tell it to remove the file after the command whether it succeeds or fails. Update `templates/skills` and copy the files to every shipped IDE directory. Verify with `node --test test/evidence-file.test.mjs test/install.test.mjs`.
- [x] 3.3 Document `--evidence-file`, the single-source rule, the encodings accepted, and a PowerShell example that writes a temporary file, runs the transition, and removes the file, in the README commands or usage section. Add a failing test that the README and `node src/cli.mjs --help` name both flags, then make it pass. Verify with `node --test test/evidence-file.test.mjs test/readme-approve-example.test.mjs test/install.test.mjs`.

## 4. Integration

- [x] 4.1 Run `npx openspec validate evidence-file-for-attempt-transitions --strict`, `npm test`, and `node src/cli.mjs doctor`. Add a CLI test that runs a reviewer verdict through `--evidence-file` from a temporary directory outside the project, on a UTF-8 BOM file and on a UTF-16LE file, and that `verify run` and `complete` still succeed afterward. Record the results in `implementation-notes.md` in the change directory. Verify with `node --test test/evidence-file.test.mjs`.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
