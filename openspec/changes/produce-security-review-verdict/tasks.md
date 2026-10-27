# Tasks

## 1. Require and post a security review verdict

- [x] 1.1 Add a failing test that security-stage work (a work item whose `factory.securityProfile` is `security-sensitive`) cannot move from `security-checking` to `awaiting-review` without a stored `ACCEPT` verdict and a distinct security reviewer identity, and that a stored `ACCEPT` verdict with a distinct identity lets the transition succeed. Then implement that validation. Verify the test fails with `node --test test/security-review-verdict.test.mjs` before the edit, and passes with the same command after it.
  - Security-stage work cannot advance to awaiting-review without an accepted verdict from a distinct security reviewer.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [x] 1.2 Add a failing test that a security reviewer identity equal to the implementer identity is rejected, and that a stored `REJECT` verdict with a distinct security reviewer identity transitions the attempt directly to `rejected`. Then implement the `security-checking` to `rejected` transition and the distinct-identity check. Verify the test fails with `node --test test/security-review-verdict.test.mjs` before the edit, and passes with the same command after it.
  - A security reviewer who matches the implementer cannot produce a verdict, and a REJECT verdict ends the attempt.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic

- [ ] 1.3 Add a failing test that the stored security verdict keeps the reviewer identity that produced it, and that the pull-request comment for that verdict names that reviewer when a pull request record exists, the same way an accept or reject comment already does. Then thread the identity into the stored evidence and the forge post. Verify the test fails with `node --test test/security-review-verdict.test.mjs` before the edit, and passes with the same command after it.
  - The posted security verdict comment names the security reviewer, the same way an accept or reject comment already does.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic
