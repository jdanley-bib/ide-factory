# Tasks

## 1. Scaffold the consumer workflow from init

- [ ] 1.1 Add a failing test that `idefactory init` in a temporary project with no consumer workflow creates `.github/workflows/factory-consumer.yml`, that the file runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all` on Node 24, and that the file does not mention Semgrep or `pull_request_target`. The test also shows the temporary project does not gain this repository's `ci.yml` or `release.yml`, and that those two files in this repository are byte-for-byte unchanged. Then make init write the workflow through the write-if-absent helper in design.md. Verify the test fails with `node --test test/consumer-ci-scaffold.test.mjs` before the edit, and passes with the same command after it.
  - Init creates the absent consumer workflow and leaves this repository's CI unchanged.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.2 Add a test that `idefactory init` exits 0 and leaves an existing consumer workflow byte-for-byte unchanged, that `idefactory upgrade` still does not create a missing workflow, and that `idefactory ci scaffold` still exits non-zero and leaves existing bytes unchanged. Then keep that exists-path on the write-if-absent helper so init does not use the throwing scaffold command. Verify with `node --test test/consumer-ci-scaffold.test.mjs`. The exists and upgrade assertions pass on current main; they must still pass after task 1.1.
  - Init keeps an existing workflow, upgrade does not write one, and ci scaffold still refuses to overwrite.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.3 Add a test that `idefactory ci scaffold` in a temporary consumer checkout which already has `.factory/team.md` and no consumer workflow writes `.github/workflows/factory-consumer.yml` there, does not call the forge, does not create the file in this repository, and leaves this repository's `ci.yml` and `release.yml` byte-for-byte unchanged. Do not use init to produce the missing file, because init now creates it. Verify with `node --test test/consumer-ci-scaffold.test.mjs`. The command already writes an absent file; the test must pass without a second writer.
  - An existing consumer checkout receives the workflow from ci scaffold.
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
