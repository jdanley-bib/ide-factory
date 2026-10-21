# Tasks

## 1. Contract traceability

- [x] 1.1 Add or refine queue contract tests for unchecked, checked, duplicate, and `.factory/work/`-only behavior; verify with `node --test test/queue.test.mjs`
  factory:
    kind: general
    roles: [engineer, test-engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low

- [x] 1.2 Add or refine orchestration contract tests for one-role requests, illegal attempt transitions, security-reviewer routing, distinct reviewers, required evidence, finalization, and HALT; verify with `node --test test/orchestration.test.mjs`
  factory:
    kind: general
    roles: [engineer, test-engineer, security-reviewer, reviewer, scribe]
    checks: [unit, threat-review]
    verificationProfile: security-sensitive

- [ ] 1.3 Add or refine install and governance contract tests for the seven-role roster, `.factory/governance.md`, preserved legacy `GOLDEN_RULES.md`, and the full shared adapter command set; verify with `node --test test/install.test.mjs test/govern.test.mjs`
  factory:
    kind: general
    roles: [engineer, test-engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low

## 2. Specification baseline

- [ ] 2.1 Validate every delta against current behavior, correct any overclaim without changing runtime scope, and verify with `npx openspec validate reconcile-factory-specifications --strict`
  factory:
    kind: docs
    roles: [lead, reviewer, scribe]
    checks: [docs]
    verificationProfile: docs

- [ ] 2.2 Run the complete repository baseline and confirm the reconciled change is ready for sync; verify with `npm test`, `node src/cli.mjs doctor`, and `npx openspec validate --all`
  factory:
    kind: docs
    roles: [lead, reviewer, scribe]
    checks: [unit, docs]
    verificationProfile: frontend-low

## Workflow follow-up

- Sync the accepted delta specifications into the main OpenSpec specs.
- Archive the change after review and verification are complete.
- Start `enforce-verification-evidence` as the next enterprise-readiness OpenSpec change.
