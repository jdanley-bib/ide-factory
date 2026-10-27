# Tasks

## 1. Post a stored review comment

- [x] 1.1 Add a failing test that accepting an attempt stores the role `reviewer` with the verdict, and that a change with a pull request record gets one stub comment containing that role, verdict, and attempt id. Then store the role and post. Verify the test fails with `node --test test/review-comment.test.mjs` before the edit, and passes with the same command after it.
  - An accept verdict is posted once with the reviewer role.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.2 Add a failing test that a security-reviewer verdict is stored with the role `security-reviewer` and posted once, and that a handoff with no verdict writes nothing and posts nothing. Then implement that store. Verify the test fails with `node --test test/review-comment.test.mjs` before the edit, and passes with the same command after it.
  - A stored security-reviewer verdict is posted and a missing one is not invented.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.3 Add a failing test that storing the same attempt and role again does not post a second comment, and that storing a verdict with no pull request record leaves the verdict stored and does not call the forge. Then implement that behavior. Verify the test fails with `node --test test/review-comment.test.mjs` before the edit, and passes with the same command after it.
  - Repeat posts and a missing pull request record do not call the forge again.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic
