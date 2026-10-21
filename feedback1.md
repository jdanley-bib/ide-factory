No—not yet. What ran was a solid prompt-guided workflow prototype, but not full-fledged orchestration.

## What worked

- Human-defined scope stayed in OpenSpec.
- OpenSpec tasks synced idempotently into Backlog.md.
- One task was selected and implemented.
- A red/green test cycle was recorded.
- A separate reviewer subagent accepted the work.
- Backlog status, OpenSpec checkbox, and team memory were updated.
- HALT, protected paths, and approval rules exist.
- The Windows Backlog launcher defect was fixed and covered by tests.

That demonstrates useful workflow discipline and auditability.

## What did not happen

### 1. The CLI does not orchestrate agents

`idefactory next` only prints a packet:

```10:12:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\src\lib\run.mjs
The IDE session model does the work. This CLI installs shared state and
prints work packets. It does not launch a model
```

The active chat interpreted that packet. It manually became the engineer, launched one reviewer subagent, then directly performed the scribe updates.

The lead, engineer, and scribe were therefore mostly personas assumed by one session—not independently managed agents.

### 2. Model selection is not implemented

The configuration explicitly says model settings are hints:

```5:11:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\templates\factory\config.json
"models": {
  "note": "Hints only. The IDE session model does the work. idefactory does not launch a model.",
  "lead": "ide-session",
  "architect": "ide-session",
  "engineer": "ide-session",
  "reviewer": "ide-session",
  "scribe": "ide-session"
}
```

The reviewer used a generic subagent inheriting the current model. No task complexity, model capability, cost, or risk influenced selection.

### 3. Role routing is extremely limited

Only tasks containing architecture-related words become architect tasks; everything else becomes engineering:

```108:112:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\src\lib\queue.mjs
function routeRole(text) {
  if (/\b(architect|production architecture|production-architecture)\b/i.test(text)) return 'architect';
  return 'engineer';
}
```

There are no QA, test automation, security, accessibility, DevOps, or specialist roles.

### 4. Backlog is a queue, but not yet an execution graph

All five generated tasks had no dependencies. Although `next` consults `isReady`, `sync-tasks` does not create dependency relationships. TASK-3 could theoretically be selected before TASK-2.

Task selection is just the first ready To Do item:

```60:67:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\src\lib\queue.mjs
let tasks = listTasks(project, env).filter((task) => isTodo(task));
if (change) {
  const scoped = tasks.filter((task) => (task.labels || []).includes(change));
  if (scoped.length) tasks = scoped;
}
const ready = tasks.find((task) => task.isReady !== false) || tasks[0];
```

### 5. Acceptance criteria are circular

Every generated task gets essentially the same criterion:

```115:121:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\src\lib\backlog.mjs
-d', `openspec-task: ${id}\n\nChange: openspec/changes/${change}/tasks.md\n\n${title}`,
-l', `${change},factory`,
'--ac', `Checkbox ${id} is implemented and checked in openspec/changes/${change}/tasks.md.`,
```

“Checkbox is checked” is bookkeeping, not evidence that the behavior works. The verification requirement exists only in the description text.

### 6. Verification is not risk-based

The factory mandates a failing test for every task. For scaffold task 1.1, this produced a structural test that failed because `package.json` did not exist. It was valid, but somewhat artificial.

There is no mechanism to derive a verification profile such as:

- unit tests
- integration tests
- Playwright scenarios
- accessibility checks
- dependency auditing
- secret scanning
- SAST
- production build
- browser compatibility

The only universal policy is “write a failing test” and “run a verification command.”

### 7. Review is advisory, not mechanically enforced

The reviewer returned `ACCEPT`, but the parent session then manually:

- checked the OpenSpec checkbox
- changed Backlog status
- wrote verification notes
- updated engineer history
- updated reviewer history
- updated scribe history
- updated `identity/now.md`

There is no transactional finalization command validating that the reviewer is different, evidence exists, required checks passed, and all state updates agree.

### 8. No bounded end-to-end run exists

The user must invoke `/factory-build` once per task. That is safe, but it is not the “squad carries work through the development process” experience you described.

The current ceremonies even state:

```1:7:C:\Users\Jason.Danley\source\repos\jdanley-bib\ide-factory\templates\factory\ceremonies.md
These are prompts for the IDE session, not a scheduler.

- **Status.** Read team, decisions, the active OpenSpec change, and the backlog.
- **Plan.** Read a human-authored change and sync its unchecked tasks into Backlog.md.
- **Build.** Implement one backlog task, test first, then ask the reviewer.
```

## Recommended architecture

### 1. Make `idefactory` a lifecycle state machine

Represent an execution attempt explicitly:

```text
planned
→ assigned
→ implementing
→ red-confirmed
→ verifying
→ security-checking
→ awaiting-review
→ accepted
→ finalized
```

Each transition should validate prerequisites and append an event to the ledger.

### 2. Add a bounded orchestration command

For example:

```text
idefactory run --change hello-world-web-app --until human-gate
```

It should continue until:

- a task is rejected
- verification fails
- a human decision is required
- HALT appears
- a configured task/time limit is reached
- all tasks are completed

This remains human-initiated without becoming an uncontrolled autonomous loop.

### 3. Introduce task classification

Each task should carry machine-readable metadata:

```yaml
factory:
  kind: frontend
  risk: low
  roles: [engineer, reviewer]
  modelProfile: coding-standard
  dependencies: [TASK-1]
  checks:
    - unit
    - build
    - playwright
  securityProfile: dependency-basic
```

OpenSpec task annotations or a sidecar generated during `/factory-plan` could supply this.

### 4. Implement an IDE capability adapter

The core tool should produce an orchestration request, while each IDE adapter launches agents using that IDE’s native mechanism.

For Cursor, the adapter would choose:

- subagent type
- model
- role charter
- allowed files
- work packet
- foreground/background execution

Keep model aliases in configuration rather than embedding Cursor-specific model names into core workflow logic.

### 5. Expand the squad

A useful default roster would be:

- Lead: scope, sequencing, conflict resolution
- Architect: architecture and cross-cutting design
- Engineer: implementation
- Test Engineer: unit/integration/Playwright strategy
- Security Reviewer: dependency, secret, SAST, and threat checks
- Reviewer: correctness and maintainability
- Scribe: durable memory and evidence reconciliation

Not every task needs every role. Classification should select the minimum appropriate pipeline.

### 6. Make verification profiles configurable

Examples:

- `docs`: link/spelling validation
- `frontend-low`: unit + build
- `frontend-interactive`: unit + build + Playwright + accessibility
- `backend-api`: unit + integration + contract tests
- `security-sensitive`: normal checks + threat review + SAST + dependency audit
- `release`: full suite + packaging; deployment still requires human approval

### 7. Capture structured evidence

Each execution attempt should record:

- agent role and agent ID
- selected model/profile
- base revision
- changed files
- red test command and result
- verification commands and results
- security checks
- reviewer agent and verdict
- timestamps
- retry/rejection history

Do not rely only on prose history files.

### 8. Add an atomic completion command

For example:

```text
idefactory complete TASK-1 --attempt <id>
```

It should refuse completion unless:

- required checks passed
- reviewer differs from implementer
- reviewer accepted
- no lockout or HALT exists
- acceptance criteria are satisfied

Then it should atomically update Backlog, the OpenSpec checkbox, identity state, histories, and ledger.

### 9. Preserve real acceptance criteria

Instead of “checkbox is checked,” parse or generate behavior-based criteria from the OpenSpec task and referenced scenarios. Checkbox synchronization should be an effect of acceptance, not the acceptance criterion itself.

### 10. Add orchestration-level tests

The current tests cover syncing, packets, HALT, and Backlog launching well. Add scenarios for:

- dependency ordering
- role and model selection
- implementer/reviewer separation
- failed verification blocking completion
- rejected review causing lockout
- required security checks
- interrupted/resumed attempts
- atomic finalization
- stale task detection
- bounded multi-task execution

## Suggested implementation order

1. Structured task metadata and dependency syncing.
2. Execution-attempt records and lifecycle transitions.
3. Atomic review/finalization.
4. Risk-based verification profiles.
5. Native IDE agent adapter and model selection.
6. QA/security roles.
7. Bounded `/factory-run` orchestration.

The current project is a good workflow foundation, but I would describe it as a **role-guided task runner**, not yet a **software-development factory orchestrator**. The most important next step is moving lifecycle enforcement and evidence from prompt convention into executable state transitions.