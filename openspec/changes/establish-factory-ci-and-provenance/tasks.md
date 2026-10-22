# Tasks

## 1. Baseline CI

- [x] 1.1 Add a failing test that the baseline job runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`, and that a non-zero command fails the job. Implement `.github/workflows/ci.yml` with job name `baseline` on pull request and push, using Node 22. Verify with `node --test test/ci-provenance.test.mjs`.
- [x] 1.2 Add a failing test that the baseline workflow uses `contents: read`, pins every third-party action to a full commit SHA, and does not use `pull_request_target` or `continue-on-error`. Update the workflow to match. Verify with `node --test test/ci-provenance.test.mjs`.

## 2. Security scanning

- [x] 2.1 Add a failing test that the shared secretlint command exits non-zero on a seeded high-confidence secret, exits zero on a clean tree, and does not print the secret. Add the exact devDependencies, configuration, and the same CI step. Verify with `node --test test/ci-provenance.test.mjs`.
- [x] 2.2 Add failing tests that the Semgrep command exits non-zero when its binary is absent, that `--skip-semgrep` prints a warning and records the skip, and that baseline CI does not pass that flag. Use a stub or absent binary, do not download Semgrep, and keep `npm test` passing without Semgrep installed. Add the fail-closed CI command with `--error`, `--metrics=off`, and `p/javascript`, without an installer or `--skip-semgrep`. Verify with `node --test test/ci-provenance.test.mjs`.

## 3. Release provenance

- [x] 3.1 Add a failing test that a version-tag workflow generates a CycloneDX SBOM containing locked production and development dependencies, including `@fission-ai/openspec`, plus lockfile and source-revision metadata. Implement `.github/workflows/release.yml` with the pinned `@cyclonedx/cyclonedx-npm` command. Verify with `node --test test/ci-provenance.test.mjs`.
- [x] 3.2 Add a failing test that provenance uses `actions/attest-build-provenance` with the final SBOM as `subject-path`, requests identity-token write only for attestation, and does not claim SLSA Build L2 or L3. Implement that attestation step and verify with `node --test test/ci-provenance.test.mjs`.

## 4. Branch and review controls

- [ ] 4.1 Add a failing test that `.github/branch-review-controls.json` names required check `baseline`, one approving review, force-push disabled, protected branch `main`, and `enforcedByForge` false, and that implementation contains no forge admin API call. Add that declaration and `.github/CODEOWNERS` for `@jdanley-bib`. Verify with `node --test test/ci-provenance.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npx openspec validate establish-factory-ci-and-provenance --strict`, `npx openspec validate --all`, `npm test`, and the four baseline commands `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`. Record the commands and results in this change's implementation notes. Do not start a model, change factory gate or evidence policy, call the GitHub admin API, add observability, or archive.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request, on a factory run that keeps reviewer and implementer distinct.
- A repository admin enables the declared GitHub ruleset only after that human chooses to do so.
- Archive only after implementation is accepted and the human asks to archive.
