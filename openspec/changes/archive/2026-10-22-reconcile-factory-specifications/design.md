# Design

## Context

See `proposal.md` for motivation. The accepted `factory-orchestration` decision and current runtime use `.factory/work/`, persisted attempts, `run` requests, separate reviewers, and `complete`. Main specs predate that design. This change is a contract reconciliation: implementation and tests are evidence for the intended observable behavior, not targets for modification.

Constraints:

- Preserve human-authored OpenSpec scope and `.factory/work/` as the only machine queue.
- Do not modify product/runtime code, factory memory, `.squad/`, or legacy human files.
- Keep capability paths stable so OpenSpec can merge deltas into existing main specs.
- Every requirement must have a level-4 WHEN/THEN scenario and pass strict validation where practical.

## Goals / Non-Goals

**Goals:**

- Replace contradicted requirements with complete, testable versions.
- Add missing lifecycle requirements without overclaiming controls the runtime does not enforce.
- Map every changed or added scenario to existing tests or a documentation-focused test update.
- Produce a clean baseline for later behavior-changing enterprise-readiness changes.

**Non-Goals:**

- Improving self-attested evidence, durable run budgets, approvals, concurrency, or finalization atomicity.
- Renaming capability directories or redesigning the OpenSpec schema.
- Deleting legacy compatibility code.

## Decisions

### Use delta specs rather than editing main specs directly

The change records the human-approved scope and allows standard OpenSpec review, apply, sync, and archive behavior. Direct edits would erase the distinction between current contract and proposed reconciliation.

Alternative considered: edit the five main specs immediately. Rejected because it bypasses the requested OpenSpec workflow and weakens auditability.

### Preserve existing capability paths

`spec-to-backlog` remains the capability path even though its purpose changes to the factory work queue. Renaming the directory would broaden this change into migration and link maintenance. Requirement text removes Backlog.md as an active queue.

Alternative considered: introduce `spec-to-work-queue`. Deferred to a separately justified capability migration.

### Specify only behavior already present

The deltas describe current queue creation, role requests, attempt transitions, security routing, reviewer distinction, completion, governance installation, and adapter coverage. Known enterprise gaps remain explicit non-goals rather than aspirational requirements.

Alternative considered: include roadmap Phase 0 enforcement requirements now. Rejected because those require runtime design and test-first implementation in later changes.

### Treat existing tests as the implementation map

Most scenarios already map to install, queue, governance, and orchestration tests. Implementation should add or adjust tests only where a reconciled scenario is not explicitly covered, then update the main specs through the normal OpenSpec sync/archive path.

Alternative considered: documentation-only edits with no test review. Rejected because a specification baseline should maintain traceability to executable behavior.

## Risks / Trade-offs

- [Capability path still says “backlog”] → Keep the path stable for this reconciliation and state `.factory/work/` unambiguously in purpose and requirements.
- [Specs could overstate security enforcement] → Specify routing to security-reviewer, not mandatory unskippable transition or trustworthy evidence.
- [Current implementation may fail a newly explicit scenario] → Add a focused failing test before any corrective runtime change; if behavior change is required, stop and move it to a separate OpenSpec change.
- [Archive/sync could lose requirement detail] → Each MODIFIED block includes the complete requirement and all scenarios.

## Migration Plan

1. Validate the change artifacts strictly.
2. Map delta scenarios to current tests and add only missing contract tests.
3. Run the repository test suite and doctor.
4. Sync/archive through the standard OpenSpec workflow after human review; do not hand-edit archived state.
5. Roll back by reverting the spec-only commit if validation or review finds the accepted architecture was described incorrectly.
