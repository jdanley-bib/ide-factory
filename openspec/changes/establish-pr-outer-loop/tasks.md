# Tasks

## 1. Pull request outer loop

- [x] 1.1 Add a failing test that `pr open` records one pull request for a change and a second open updates it, using a stub forge. Then implement that command. The test also asserts the stub argv does not merge and does not call the forge admin API. Verify the test fails with `node --test test/pull-request-outer-loop.test.mjs` before the command exists, and passes with the same command after it.
  - One change has one branch and one pull request record.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.2 Add a failing test that the pull request body includes the source revision and attempt id and omits check logs and environment values. Then include those links. Verify the test fails with `node --test test/pull-request-outer-loop.test.mjs` before the body change, and passes with the same command after it.
  - The body links evidence and leaves logs out.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.3 Add a failing test that `pr comment` posts the verdict already stored on the attempt, and that a missing verdict exits non-zero without writing one. Then implement that command. Verify the test fails with `node --test test/pull-request-outer-loop.test.mjs` before the command exists, and passes with the same command after it.
  - A posted verdict comes from the attempt record.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.4 Add a failing test that `pr capture` stores the same forge comment id once, and that a stored comment does not allow accept or complete without a scoped approval. Then implement capture. Verify the test fails with `node --test test/pull-request-outer-loop.test.mjs` before capture exists, and passes with the same command after it.
  - Human comments are stored once and are not approvals.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

## 2. Consumer CI scaffold

- [x] 2.1 Add a failing test that `ci scaffold` writes `.github/workflows/factory-consumer.yml` only when it is absent, that the file runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all` on Node 24, and that the file does not mention Semgrep or `pull_request_target`. The test also shows `init` does not create that file and the command does not call the forge admin API. Then implement the command in a temporary project. Verify the test fails with `node --test test/consumer-ci-scaffold.test.mjs` before the command exists, and passes with the same command after it.
  - The consumer workflow is written once and stays narrower than this repository's CI.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 2.2 Add a failing test that command help names `pr open`, `pr comment`, `pr capture`, and `ci scaffold`. Then add those lines to the help text. Verify the test fails with `node --test test/pr-help.test.mjs` before the help edit, and passes with the same command after it.
  - Help names the new commands.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic
