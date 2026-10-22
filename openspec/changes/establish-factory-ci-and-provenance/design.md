# Design

## Context

See `proposal.md` for motivation. The repository has `package-lock.json`, `engines.node` of `>=20`, and no `.github/workflows/` directory. The installed check registry maps only `unit` to `npm test`. Factory completion, gates, sessions, and finalization already have their own changes and stay as they are.

CI pins Node 24 rather than a floating latest major. That satisfies `engines.node` of `>=20`. The sast job pins Python 3.14 for the Semgrep install.

## Goals / Non-Goals

**Goals:**

- Make the Phase 0 baseline one fail-closed GitHub Actions job.
- Run secret detection and SAST with the same fail-closed command locally and in CI.
- Produce a CycloneDX SBOM and SLSA v1 provenance for a version tag without publishing npm.
- Declare review and force-push controls in the repository without changing forge settings from code.

**Non-Goals:**

- Treating a CI pass as factory attempt evidence or adding scanner argv to `.factory/checks.json`.
- Enabling the GitHub ruleset from this change.
- SLSA Build L2 or L3, license policy, Scorecard, dependency-update bots, or a platform matrix.
- Observability, runbooks, Vally, QRSPI, Aspire, or an archive.

## Decisions

### One baseline job is the Phase 0 gate

Add `.github/workflows/ci.yml`, triggered on `pull_request` and `push`, with a job named `baseline`. Its steps are checkout, Node 24 setup with npm cache, `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`. Workflow permissions are `contents: read`. The job does not set `continue-on-error`. Secret-scan, sast, and the release workflow also set `node-version` to 24.

The dependency check is this audit step. A second audit job would be a second policy that could drift.

Alternative considered: a matrix of Node majors. Rejected because platform matrices are out of scope; one pinned major, Node 24, is enough for Phase 0.

### Secretlint and Semgrep share one command each

Secret detection uses `@secretlint/secretlint` with `@secretlint/secretlint-rule-preset-recommend`, added as exact devDependencies when this change is applied. The CI step and the test run the same `secretlint` command. Output is configured not to echo the matched secret. A temp fixture containing a high-confidence sample key must exit non-zero, and a clean tree must exit zero.

SAST stays on the official Semgrep CLI, invoked with `--error`, `--metrics=off`, and `p/javascript`. The shared command fails closed when the `semgrep` binary is absent and does not download it. `--skip-semgrep` is the only escape: it skips the scan, prints a warning, and writes a `SEMGREP_SKIP` record to stdout. Baseline CI and the sast job call that command without the flag. `npm test` uses an absent binary or a stub, passes without Semgrep, and does not download or install Semgrep.

The ide-factory sast job installs Semgrep on the GitHub Actions runner immediately before that command. The install pins release commit `240da9f30cd06fb4ee00c2c31c114c1c1f5ee0f4` (v1.182.0) and checks wheel sha256 `19a82868830389c039bb71bfc0aeebb28385e5b65740120710eff050324ad14f` before `pip install`. `actions/setup-python` is pinned to commit `a26af69be951a213d495a4c3e4e4022e16d87065` (v5.6.0) and selects Python 3.14. A failed install or scan fails the job. `idefactory init` does not copy this workflow or installer into other projects.

Alternative considered: install Semgrep during `npm test` or on developer machines. Rejected by the human review of attempt `983f8451-bce2-4aa9-bbe7-fb139d2bf2b1`. The later approval installs it only in this repository's sast job. CodeQL remains rejected because its analysis job can succeed while findings remain.

### Release bytes are generated, then attested

Add `.github/workflows/release.yml`, triggered only by a `v<major>.<minor>.<patch>` tag push. It runs `npm ci` and the official `@cyclonedx/cyclonedx-npm` CLI at an exact version recorded in the workflow. The invocation includes locked production and development dependencies. A post-step writes the lockfile SHA-256 and source revision into CycloneDX metadata properties without changing the component list. The job then attests those final SBOM bytes with `actions/attest-build-provenance`, using `subject-path` for the SBOM.

Release permissions are `contents: read`, `id-token: write`, and `attestations: write`. It uploads the SBOM as a workflow artifact. It does not create an npm publication or request contents write.

Alternative considered: SPDX via Syft. Rejected because one CycloneDX generator from the npm lockfile is enough and keeps the component source explicit. SLSA L2 was rejected because this change claims only v1 provenance.

### Pins are full SHAs, resolved at apply time

Every third-party action is pinned to a full commit SHA, with the human-readable version in a trailing comment. This proposal does not freeze SHAs that would go stale before apply. Implementation records the SHAs it resolved and tests reject a tag or branch reference.

`pull_request_target` is forbidden. No workflow secret is required.

### Branch controls are a declaration, not an API call

Add `.github/branch-review-controls.json`, schema version 1, with required status check `baseline`, `requiredApprovingReviewCount` 1, `allowForcePushes` false, protected branch `main`, and `enforcedByForge` false. The text states that a repository admin enables the matching GitHub ruleset after the baseline check exists.

Add `.github/CODEOWNERS` with `* @jdanley-bib`. That login is the owner already present in the Git remote `jdanley-bib/ide-factory`; it is not a new identity. CODEOWNERS requests review. It does not enforce the ruleset.

Alternative considered: a workflow script that calls the GitHub ruleset API. Rejected because changing branch protection is a human admin action and this change must not take it.

### Tests read the workflows and run the scanners

`test/ci-provenance.test.mjs` asserts the baseline commands, job name, read-only permissions, SHA pins, absence of `pull_request_target` and `continue-on-error`, scanner fail-closed behavior on fixtures, SBOM metadata and provenance subject path, and the branch declaration. It does not call a forge API.

## Threats

- **A floating action tag is replaced.** Pin every action to a full SHA and reject tag references in tests.
- **`pull_request_target` exposes a privileged token to fork code.** Do not use that trigger, and grant the baseline workflow contents read only.
- **`npm install` accepts a different tree than the lockfile.** The baseline job uses `npm ci` only.
- **The audit gate is quietly lowered.** The workflow and its test require `--audit-level=high`.
- **A secret scanner prints the secret.** Configure redaction and assert the fixture secret is absent from scanner output.
- **SAST findings do not fail the job.** Use Semgrep `--error`, forbid `continue-on-error`, and do not pass `--skip-semgrep` from CI.
- **A test downloads Semgrep.** `npm test` uses an absent binary or stub and does not run the runner installer.
- **The runner install floats.** Pin the Semgrep release commit and wheel sha256, and fail the job when the digest does not match.
- **Provenance describes a different artifact.** Attest only the final SBOM path after metadata is added.
- **The SBOM omits build tooling.** Include locked development dependencies and assert `@fission-ai/openspec` is present.
- **The declaration is mistaken for live branch protection.** Keep `enforcedByForge` false until a human changes it.
- **Implementation enables protection through the admin API.** Tests and review reject that call.
- **CI success is treated as attempt evidence.** Do not modify the check registry, gate policy, or completion code.

## Risks / Trade-offs

- [Node is pinned to 24 while engines allow 20] → One major keeps Phase 0 reproducible. A matrix is a later change. The sast install uses Python 3.14.
- [Semgrep rule packs change upstream] → Pin the CLI version. A pack change can add or remove findings; the seeded fixture must be one the pinned ruleset detects, and the test records that expected finding.
- [Secretlint is not the same detector as GitHub secret scanning] → It is the fail-closed repository check. Native GitHub scanning may remain a separate forge setting.
- [Tag provenance is SLSA v1, not a hosted-isolated L2 claim] → The statement names the repository, revision, and SBOM digest without claiming a stronger level.
- [CODEOWNERS cannot stop a direct push] → The human ruleset is the enforcement step. The declaration stays honest until then.
- [Adding devDependencies changes the lockfile] → That lockfile is the intended SBOM input. Do not add runtime dependencies.

## Migration Plan

This planning commit adds only the OpenSpec change. It does not edit product code or `.factory/` execution state.

On apply, add the workflows, scanner devDependencies needed for the shared secretlint command, the branch declaration, CODEOWNERS, and tests. Do not rewrite decisions, histories, attempts, work items, or the active-change pointer. Existing completed attempts remain valid and receive no retroactive CI attestation.

After the baseline job exists, a repository admin may enable a GitHub ruleset for `main` with the declared check, one approving review, and force-push disabled. That admin action is not part of implementation.

Rollback by reverting the workflow and dependency commit. Attestations already produced for a tag remain immutable; do not delete them as part of rollback. If a human-enabled ruleset blocks the revert, the human bypasses or disables that ruleset. Do not mark `enforcedByForge` true in the revert.

## Open Questions

None. The job split, scanner commands, SBOM format, provenance level, and human ruleset boundary are fixed above.
