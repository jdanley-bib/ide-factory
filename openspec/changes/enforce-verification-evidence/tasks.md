# Tasks

## 1. Check registry

- [x] 1.1 Add failing tests that a schema-valid registry accepts an argv array, project working-directory policy, timeout, and artifact list, and that a shell command string, empty argv, unsupported schema version, or path outside the project is rejected. Implement the validator until `node --test test/verification-evidence.test.mjs` passes those cases.
- [x] 1.2 Add a versioned `.factory/checks.json` template that maps `unit` to `npm test` and no other kind. Extend install tests so a new init writes a schema-valid registry and a second init leaves an existing registry byte-for-byte unchanged. Verify with `node --test test/install.test.mjs`.

## 2. CLI-run evidence

- [x] 2.1 Add failing tests for `verify run`: exit zero stores a derived pass, exit non-zero is not passing, `--red` stores a record only on a non-zero exit, and a caller-supplied red object is not stored. Implement the command with `shell: false` until those tests pass.
- [x] 2.2 Add failing tests that a stored record includes schema version, kind, runner name and version, command digest, exit code, timestamps, source revision, log digest, artifact digests, and attempt id, and that a missing exit code is rejected. Verify with `node --test test/verification-evidence.test.mjs`.
- [x] 2.3 Add failing tests that a clean git HEAD is stored on a zero exit and that a dirty worktree or an unresolvable HEAD records no pass. Implement that binding and verify with `node --test test/verification-evidence.test.mjs`.
- [x] 2.4 Add a failing test that `verify` exits with an error and writes no evidence when `HALT` is present. Verify with `node --test test/verification-evidence.test.mjs`.

## 3. Imported attestations

- [x] 3.1 Add failing tests that a signature-valid attestation whose command digest and attempt id match is stored, and that an invalid signature, a missing registry key, or a different attempt id is rejected with no evidence added. Implement Ed25519 verification over canonical JSON using `node:crypto` until `node --test test/verification-evidence.test.mjs` passes. Do not accept an import as red evidence.

## 4. Fail-closed completion

- [x] 4.1 Add a failing test that `attempt transition` rejects a payload containing red, verification, or security results and leaves the attempt unchanged, while still accepting reviewer notes. Implement that rejection and verify with `node --test test/orchestration.test.mjs`.
- [x] 4.2 Add failing completion tests for a forged `passed: true`, an unknown check kind, a kind with no argv mapping, a non-zero or missing exit code, a command-digest mismatch, and a source revision other than the current clean HEAD. Each case must leave the work item unfinished. Implement the gate and verify with `node --test test/orchestration.test.mjs`.
- [ ] 4.3 Change existing successful-completion fixtures to create a clean git worktree, register every required check, and obtain evidence from `verify run` or a signature-valid import. Verify the accepted attempt still finalizes by running `node --test test/orchestration.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npx openspec validate enforce-verification-evidence --strict`, `npm test`, and `node src/cli.mjs doctor`. Record the commands and results in the implementation notes. Do not start a model, add a run-session budget, enforce `humanGate`, or change finalization atomicity.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request, on a factory run that keeps reviewer and implementer distinct.
- Archive only after that implementation is accepted and the human asks to archive.
