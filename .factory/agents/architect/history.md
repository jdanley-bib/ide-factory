# History

## 2026-10-22 — clarify crash-true recovery semantics (make-finalization-recoverable)

Clarified existing approved behavior after independent ACCEPT review of journaled `complete` integration. No scope change, no product edits, no task-checkbox or factory-execution mutations.

Exact clarifications documented in `design.md`, `specs/recoverable-finalization/spec.md`, and `specs/guided-build/spec.md`:

1. **Durable commit on journal** — Schema version 1 journal durably includes the work-item commit target (exact after bytes/digests) and frozen `finalizedAt` so process-restart recovery has exact commit bytes without rebuilding the plan. The commit target remains applied last and is not a pre-commit target.
2. **`finalize-failed` window** — Attempt status `finalize-failed` may be written only when failure happens before journal durability. After the journal is durable, attempt bytes are frozen and replayed; complete must not rewrite the attempt to `finalize-failed`.
3. **Dirty worktree on retry** — A retry may proceed with a dirty worktree only when that dirt is exactly partial finalization state from journaled targets and a valid journal remains bound to unchanged clean source HEAD (`sourceRevision` equals current HEAD). Unrelated dirt, HEAD drift, missing/unbound journal, or target conflict fails closed.

Split long ADDED requirements in recoverable-finalization so strict OpenSpec length checks pass; guided-build keeps the MODIFIED requirement short and places the same clarifications in scenarios.

Validation: `npx openspec validate make-finalization-recoverable --strict`.
