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

