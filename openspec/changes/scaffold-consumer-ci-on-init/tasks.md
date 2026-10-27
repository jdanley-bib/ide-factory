# Tasks

## 1. Scaffold the consumer workflow from init

- [x] 1.1 Add a failing test that `idefactory init` in a temporary project with no consumer workflow creates `.github/workflows/factory-consumer.yml`, that the file runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all` on Node 24, and that the file does not mention Semgrep or `pull_request_target`. The test also shows the temporary project does not gain this repository's `ci.yml` or `release.yml`, and that those two files in this repository are byte-for-byte unchanged. Then make init write the workflow through the write-if-absent helper in design.md. Verify the test fails with `node --test test/consumer-ci-scaffold.test.mjs` before the edit, and passes with the same command after it.
  - Init creates the absent consumer workflow and leaves this repository's CI unchanged.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.2 Add a failing test that when `idefactory init` creates `.github/workflows/factory-consumer.yml`, the command output names that path, including when factory state already exists and only the workflow is missing. When the file already exists, init still exits 0, leaves the bytes unchanged, and does not name that path. Then add the path to init's created list only when the write-if-absent helper creates the file. Verify the test fails with `node --test test/consumer-ci-scaffold.test.mjs` before the edit, and passes with the same command after it.
  - Init names the consumer workflow only when it creates that file.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.3 Add a failing test that `idefactory ci scaffold <checkout>` run from a different working directory writes `.github/workflows/factory-consumer.yml` into the checkout that already has `.factory/team.md`, and does not write that file into the working directory or into this repository. The command does not call the forge, and this repository's `ci.yml` and `release.yml` stay byte-for-byte unchanged. Then select that checkout path. Verify the test fails with `node --test test/consumer-ci-scaffold.test.mjs` before the edit, and passes with the same command after it.
  - A checkout path passed to ci scaffold receives the workflow even when it is not the working directory.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

## Workflow follow-up

- Jason approves this change before it is executable. Do not sync tasks until then.
- Archive only after implementation and review, in a later request.
