# Tasks

## 1. Journal and deterministic plan

- [x] 1.1 Add failing tests that a schema version 1 finalization journal binds change, task, attempt, clean source revision, completion date, ordered allowlisted targets, before/after digests, exact after bytes, and an immutable plan digest, and that corrupt, unsupported, path-traversing, identity-mismatched, or revision-mismatched journals fail without marking the item done. Implement journal validation and atomic creation. Verify with `node --test test/finalization-recovery.test.mjs`.
- [x] 1.2 Add failing tests that complete creates one deterministic plan for the checkbox, scribe marker, identity note, finalized attempt, intended work index, ready journal, and atomic work-item update; timestamps stay fixed across retries, and the work-item `done` write is the final correctness-critical write. Implement the planned target generation and verify with `node --test test/finalization-recovery.test.mjs`.

## 2. Replay and crash recovery

- [x] 2.1 Add failing tests that replay skips an after-digest target, applies a before-digest target, rejects any other digest as a conflict, and repeats an already committed completion without changing bytes or duplicating checkbox, scribe, or attempt history. Implement compare-and-apply recovery, allow a matching finalized attempt with an unfinished journal to resume, and verify with `node --test test/finalization-recovery.test.mjs`.
- [x] 2.2 Add a library-only fault hook and table-driven failing tests before and after journal creation, every pre-commit target, the ready-journal write, and immediately before the commit point. At every boundary the failed call leaves the item not done and an uninjected retry reaches one byte-consistent final state. Add an orchestration regression that an unfinished finalized attempt with a matching journal emits `needs-complete`. Verify with `node --test test/finalization-recovery.test.mjs test/orchestration.test.mjs`.

## 3. Lockout lifecycle

- [x] 3.1 Add failing tests that lockout creation writes immutable schema version 1 `created.json` data under a printed lockout id and blocks completion, and that `lockout resolve <id>` requires a distinct resolver and reason, writes one immutable `resolved.json`, unblocks completion, repeats identical resolution without duplication, and rejects conflicting resolution. Add legacy markdown resolution by exact basename and digest without renaming or deleting the note. Update all shipped factory-governance skill copies with the supported command. Verify with `node --test test/govern.test.mjs test/finalization-recovery.test.mjs`.

## 4. One-writer lease

- [ ] 4.1 Add failing tests that atomic lease acquisition has exactly one winner, a non-expired owner makes a second writer fail clearly without mutation, success and handled errors release only the matching lease id, and read-only commands neither acquire nor remove a lease. Implement the schema version 1 lease and command wrapper primitives. Verify with `node --test test/writer-lease.test.mjs`.
- [ ] 4.2 Add failing fake-clock and multi-process tests for one-minute heartbeat, five-minute expiry, one-winner stale-directory takeover, owner-loss failure, corrupt/unsupported lease refusal, HALT bypass, and top-level coverage of init, upgrade, sync-tasks, next, run, attempt mutations, verify, complete, approve, reject, lockout create/resolve, and resume. Wire CLI dispatch without nested acquisition and verify with `node --test test/writer-lease.test.mjs test/orchestration.test.mjs test/govern.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `npx openspec validate make-finalization-recoverable --strict`, `npm test`, and `node src/cli.mjs doctor`. Record the commands and results in this change's implementation notes. Do not start a model, add CI or provenance, add observability, change gate/evidence policy, or archive.

## Workflow follow-up

- Stop for human review of this proposal before apply.
- Apply only after a new human request, on a factory run that keeps reviewer and implementer distinct.
- Archive only after that implementation is accepted and the human asks to archive.
