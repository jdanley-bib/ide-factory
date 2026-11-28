# Design

## Context

`startAttempt` writes a new attempt file and calls `updateWorkItem(..., { status: 'in_progress', attemptId })`. `orchestrate` starts an attempt only when the stored attempt file is missing, so the normal loop does not duplicate; the duplication comes from direct `attempt start` calls from a retried command, a second agent, or a resumed skill. Nothing in the work item remembers a prior pointer, so the displaced attempt can only be found by listing `.factory/attempts/`.

## Decisions

### D1. A live attempt with evidence blocks `attempt start`

"Live" means the stored state is not `accepted`, `rejected`, or `abandoned`. "Evidence" means the attempt has at least one of: a red record or diagnostic, a verification record, a method proposal or review, an exception, or a review verdict. The check reads the attempt file only. When both hold, `attempt start` throws `BlockedError(message, 'attempt-active', context)` with `context` carrying the attempt id, state, and counts per evidence type. Alternative: always refuse when any live attempt exists. Rejected because a retried `attempt start` that produced an empty attempt would then block forever on its own leftover.

### D2. A live empty attempt is reused

When the current attempt is live and empty, `attempt start` returns it with `reused: true` and writes nothing. The return value is otherwise the same shape, so callers need no change. This makes the command idempotent for the retry case, which is the commonest cause of duplicates.

### D3. Terminal attempts are replaced, and history records it

When the current attempt is `rejected` or `abandoned`, start proceeds as today. `accepted` still refuses as today (the item is done). Every pointer change appends `{ previousAttemptId, attemptId, cause, at }` to `attemptHistory` on the work item, where `cause` is one of `first`, `after-rejection`, `after-abandon`, or `repair`. History is append-only and kept when the item is later completed. It lives on the work item because the item is what points at attempts and is already run state under `.factory/work/`.

### D4. Repair is plan then apply, reusing the reconcile convention

`attempt repoint` follows the `sync-tasks --plan` and `--apply --plan-digest --decided-by` flow already in the codebase. The preview prints the current attempt, the target attempt, an evidence summary of each, and a digest over the canonical JSON of `{ change, task, currentAttemptId, targetAttemptId, evidenceSummaries }`. Apply recomputes the digest and refuses if anything changed since the preview. Apply writes only the work item pointer and history. No attempt file is edited, so evidence is never rewritten.

### D5. Who may repair

Repair never needs a human by itself. When the displaced attempt has evidence, `--decided-by` must differ from that attempt's recorded implementer, and under policy version 2 the principal verifier confirms the identity, the same check other independent gates use. When the displaced attempt is empty, any recorded identity suffices. This is the `independent` authority level defined by `truthful-authority-levels`; until that change lands the rule is stated here directly and uses the existing identity check helper.

### D6. Targets that are refused

The target must exist, belong to the same change and task, differ from the current pointer, and not be `rejected` or `abandoned` (start a new attempt instead). Repair is refused while HALT is set and for an `accepted` current attempt on a completed item.

### D7. Orphans are reported, not fixed

An attempt file whose change and task match a work item, but whose id is neither the item's pointer nor in its history, is an orphan. `run` and `status` print a notice naming the orphan id and the repair command. The notice does not stop the run. A pointer repair appends the displaced attempt to history, so it no longer counts as an orphan.

### D8. Events

`attempt.started` already exists for starts; a reuse emits nothing. `attempt.repointed` carries `change`, `task`, `previousAttemptId`, `attemptId`, and `resolver`. The allowlist gains `previousAttemptId`. The reason text lives only in the repair record under `.factory/work/repairs/`, which is already run state.

## Risks and trade-offs

- A bad evidence predicate could block a legitimate restart. Mitigation: the predicate is a single function with a test per evidence type, and a rejected attempt always bypasses it.
- Attempt files written by older versions have no history entry for themselves. The first start after upgrade records `cause: first` with a null previous id. Orphans created before upgrade are reported by D7 and repairable.
