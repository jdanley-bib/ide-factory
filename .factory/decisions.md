# Decisions

Append entries below. Do not remove earlier entries.

## 2026-10-20 accepted factory-orchestration

Status: accepted
Id: factory-orchestration
Note: Replaced Backlog.md with .factory/work, added attempts/complete/run, retired GOLDEN_RULES.md, expanded roster, added /factory-run. CLI still does not launch models.

## 2026-10-21 accepted reconcile-factory-specifications-lockout-recovery

Status: accepted
Id: reconcile-factory-specifications-lockout-recovery
Authorized-at: 2026-10-21T15:39:53Z
Authorized-by: human
Rejected-attempt: 8a92d9a8-ba4b-4251-9ff1-aa1350b2b5a3
Rejected-implementer: bc-ac0c1584-e5e6-5ff8-88c6-4b4b65ade097
Rejecting-reviewer: bc-8664bbff-5a34-5a2c-9246-5e4262d63718
Note: Human authorized manual recovery because the current CLI has no unlock command. Preserve the rejected attempt and review; discard only its uncommitted test edits; append resolution evidence to the lockout record; move that resolved record out of the active `*lockout*.md` filename pattern; start a fresh task 1.3 attempt with an implementer distinct from the rejected implementer; require a real failing unit run before the minimal passing edit; retain independent review; then resume the bounded run. This authorization does not add a product unlock feature and does not waive any verification or review gate.


## 2026-10-21 accepted enforce-verification-evidence-4.1-unit-check

Status: accepted
Id: enforce-verification-evidence-4.1-unit-check
Authorized-at: 2026-10-21T16:42:30Z
Authorized-by: factory lead aligning the machine queue to the human task and the approved design
Work-item: enforce-verification-evidence/4.1
Attempt: dad29b9c-88bc-4ad3-8ee9-c1b51e4fe665
Note: The classifier marked 4.1 security-sensitive because the task text contains "security results", and inferred checks unit, build, dependency-audit, and threat-review. The human task verifies only `node --test test/orchestration.test.mjs`. The approved design ships a registry whose only argv is unit -> npm test and forbids inventing build, SAST, or threat-review commands. Security review still ran: reviewer bc-6880a005-5532-5942-8e01-c14e1872901f accepted the transition gate; `npm test` exited 0 and `npm audit --audit-level=high` exited 0. Those audit and build results are not recorded as passing check evidence. The work item checks used for complete are set to unit so finalization matches the human verification command. This does not add a build tool, a risk gate, or a forged pass.

## 2026-10-21 accepted persist-bounded-run-sessions-3.4-unit-check

Status: accepted
Id: persist-bounded-run-sessions-3.4-unit-check
Authorized-at: 2026-10-21T18:52:30Z
Authorized-by: factory lead aligning the machine queue to the human task and approved scope
Work-item: persist-bounded-run-sessions/3.4
Attempt: c923e6ab-933a-44a2-a41e-4969af7b9380
Note: The classifier marked 3.4 security-sensitive because the task text names the security-reviewer route and inferred unit, build, dependency-audit, and threat-review. The human task verifies only `node --test test/orchestration.test.mjs`, the check registry maps only unit to `npm test`, and this approved change explicitly excludes security-stage enforcement and new security tooling. Keep the existing security-reviewer route and its independent review, but set the work item's completion checks to unit. Do not invent build, dependency-audit, or threat-review commands and do not record forged passing evidence.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-2.2-unit-check

Status: accepted
Id: enforce-risk-gates-and-security-stage-2.2-unit-check
Authorized-at: 2026-10-21T20:29:00Z
Authorized-by: factory lead aligning the machine queue to the human task and approved scope
Work-item: enforce-risk-gates-and-security-stage/2.2
Attempt: 049a0a00-f6c2-4187-ab0f-7baadd95180a
Note: The classifier inferred unit, build, dependency-audit, and threat-review because the task tests approval security. The human task verifies only `node --test test/risk-gates.test.mjs`; the registry maps only unit to `npm test`; and the approved design explicitly forbids inventing scanner argv. Set completion checks to unit. Retain the security-sensitive route and independent security review, but do not forge build, dependency-audit, or threat-review evidence.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-3.1-unit-check

Status: accepted
Id: enforce-risk-gates-and-security-stage-3.1-unit-check
Authorized-at: 2026-10-21T20:42:32Z
Authorized-by: factory lead aligning the machine queue to the human task and approved scope
Work-item: enforce-risk-gates-and-security-stage/3.1
Attempt: 934b44b7-55ff-47e4-8ddf-9313707ab641
Note: The classifier inferred unit, build, dependency-audit, and threat-review because the task tests the security stage. The human task verifies with `node --test test/risk-gates.test.mjs test/orchestration.test.mjs`; the registry maps only unit to `npm test`; and the design forbids inventing scanner argv. Set completion checks to unit. Retain security-sensitive routing and independent security review; do not forge build, dependency-audit, or threat-review evidence.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-3.2-bootstrap

Status: accepted
Id: enforce-risk-gates-and-security-stage-3.2-bootstrap
Authorized-at: 2026-10-21T20:56:15Z
Authorized-by: factory lead aligning the machine queue to the approved design
Work-item: enforce-risk-gates-and-security-stage/3.2
Attempt: 30dbe229-266c-4a72-922e-ceebdc47f490
Note: Task 3.2 implements the mandatory CLI security-evidence gate. If its classifier-generated `security-sensitive` metadata remains, the newly implemented gate would require a live `threat-review` mapping to review this same bootstrap attempt. The approved design explicitly forbids inventing scanner argv, and the registry maps only unit to `npm test`. For this work item only, set completion checks to unit and machine securityProfile to dependency-basic. Still require a distinct security-reviewer to inspect the implementation before the distinct reviewer accepts it, but do not forge or label unit output as threat-review evidence. Product behavior remains fail-closed for security-sensitive work.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-4.1-unit-check

Status: accepted
Id: enforce-risk-gates-and-security-stage-4.1-unit-check
Authorized-at: 2026-10-21T21:13:45Z
Authorized-by: factory lead aligning the machine queue to the approved task
Work-item: enforce-risk-gates-and-security-stage/4.1
Attempt: 18d745da-e9df-445c-a5a5-9ab639d96f4b
Note: The classifier inferred security checks because the task names the `security-sensitive` profile. The human task only edits the profile template and verifies `node --test test/install.test.mjs`; the shipped registry has no scanner argv. Set completion checks to unit and machine securityProfile to dependency-basic. Require a distinct manual security review before the distinct reviewer accepts, without forged security evidence.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-4.2-unit-check

Status: accepted
Id: enforce-risk-gates-and-security-stage-4.2-unit-check
Authorized-at: 2026-10-21T21:22:52Z
Authorized-by: factory lead aligning the machine queue to the approved task
Work-item: enforce-risk-gates-and-security-stage/4.2
Attempt: f6d2af51-ad7a-435f-9c0e-16e92bcc9924
Note: The classifier inferred security checks because the task documents `human-gate`. The human task only updates five factory-run skill copies and verifies them through `test/risk-gates.test.mjs`; the registry maps only unit. Set completion checks to unit and machine securityProfile to dependency-basic. Require a distinct manual security review before the distinct reviewer accepts; do not invent scanner argv or forge evidence.

## 2026-10-21 accepted enforce-risk-gates-and-security-stage-5.1-unit-check

Status: accepted
Id: enforce-risk-gates-and-security-stage-5.1-unit-check
Authorized-at: 2026-10-21T21:35:30Z
Authorized-by: factory lead aligning the machine queue to the approved task
Work-item: enforce-risk-gates-and-security-stage/5.1
Attempt: c55fda80-405c-41b0-ae1c-743da4435908
Note: The classifier inferred security checks because the integration task names excluded provenance. The human task runs strict OpenSpec validation, `npm test`, and doctor; the registry maps only unit. Set completion checks to unit and machine securityProfile to dependency-basic. Require a distinct manual security review before the distinct reviewer accepts; do not invent scanner argv or forge evidence.
