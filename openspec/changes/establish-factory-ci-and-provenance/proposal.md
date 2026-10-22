# Proposal

## Why

The factory repository has no CI workflow, scanner, SBOM, or release provenance. Phase 0 is not met until a clean install, tests, dependency audit, and full OpenSpec validation pass in CI. Local checks alone cannot show that pull requests and releases were built from a reviewed, traceable source.

## What Changes

- Add baseline CI that runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`, and fails when any command fails. Phase 0 is met when this baseline job passes.
- Add CI jobs for dependency audit, secret detection, and SAST. Each job fails on a finding and does not continue after an error.
- Add a release workflow that generates a CycloneDX SBOM from the lockfile and attaches SLSA v1 build provenance whose subject is that SBOM.
- Record branch and review controls: one approving review, the named baseline check, and no force-push. The in-repository files name those controls; enabling them on GitHub remains a human repository-admin action.
- Pin third-party actions to full commit SHAs, use least-privilege workflow permissions, and do not use `pull_request_target`.

Out of scope:

- OpenTelemetry, dashboards, metrics, retention, redaction policy, SLOs, and operational runbooks.
- Vally or other skill-evaluation suites, QRSPI planning artifacts, and Aspire or other product scaffolds.
- License policy, OpenSSF Scorecard gates, platform matrices, Dependabot or Renovate, and SLSA Build L2 or L3.
- npm publish, deployment, account creation, or spending.
- Changing factory check-registry completion policy, `humanGate`, security-stage rules, run budgets, finalization, or lockout behavior.
- Installing these workflows into other projects through `idefactory init`.
- Calling the GitHub admin API to enable branch protection.
- Archiving earlier changes, or editing `.factory/` execution state in this planning change.

## Capabilities

### New Capabilities

- `baseline-ci`: Pull-request and push CI that fails closed on clean install, tests, high-severity dependency audit, or OpenSpec validation.
- `security-scanning`: CI secret detection and SAST that fail on findings without printing secret material.
- `release-provenance`: CycloneDX SBOM generation and SLSA v1 provenance bound to the SBOM digest.
- `branch-review-controls`: The required review, required baseline check, and force-push prohibition, with human enablement kept outside the workflow.

### Modified Capabilities

None. Existing factory runtime requirements stay unchanged.

## Impact

- Affected specs: new `baseline-ci`, `security-scanning`, `release-provenance`, and `branch-review-controls`. No main spec requirement changes.
- Affected repository files, when applied: `.github/workflows/`, `.github/CODEOWNERS`, and focused tests that read those files and exercise scanner fixtures. No factory CLI behavior change.
- Dependencies, when applied: pinned GitHub Actions, a pinned secret scanner, a pinned SAST runner, and a pinned CycloneDX npm generator. No model launcher and no production runtime dependency.
- Verification commands for this planning change: `npx openspec validate establish-factory-ci-and-provenance --strict`, `npx openspec validate --all`, and `npm test`.
- Threats, tool choices, migration, and rollback are specified in `design.md`. This proposal does not apply, implement, or archive the change.

## Acceptance criteria

- Strict validation of this change passes, `npx openspec validate --all` passes, and `npm test` passes with no runtime or `.factory/` execution edits in the planning commit.
- After implementation, the baseline workflow job runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`, and fails if any command fails. Phase 0 is met when that job passes.
- After implementation, secret detection exits non-zero for a seeded secret fixture and does not print the secret. SAST exits non-zero for a seeded finding fixture. Neither job sets `continue-on-error`.
- After implementation, a release run produces a CycloneDX SBOM that includes locked production and development dependencies and SLSA v1 provenance whose subject digest equals that SBOM.
- After implementation, every third-party action is pinned to a full commit SHA, baseline permissions are read-only, and the workflow does not use `pull_request_target`.
- After implementation, the repository states the required baseline check, one approving review, and the force-push prohibition. Implementation does not call the GitHub admin API.
