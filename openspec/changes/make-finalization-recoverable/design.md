# Design

## Context

See `proposal.md` for motivation. `completeWorkItem()` currently writes the work item `done`, the OpenSpec checkbox, scribe history, identity, and attempt state in that order. Its catch path can set `finalize-failed`, but it cannot undo an already-done item or determine which later writes landed. Scribe history is append-only, so blind retries can duplicate it.

An active lockout is currently any `.factory/orchestration/*lockout*.md` filename. The CLI can create one but cannot resolve one. An earlier recovery required a human-approved manual rename.

The CLI dispatches all commands from one process entry point, but no command-level mutual exclusion exists. Internal writes use a mix of direct writes, append, and temp-plus-rename. `.factory/orchestration/`, `.factory/attempts/`, `.factory/work/`, and the ledger are already ignored by clean-source verification.

`HALT` is the emergency stop and must remain settable even when another command owns the writer lease. The ledger is best-effort observability and is not part of transaction correctness.

## Goals / Non-Goals

**Goals:**

- Make the machine work-item `done` update an atomic, last-write commit point.
- Resume interrupted completion from durable intent without duplicating append-only records.
- Exercise every finalization boundary with deterministic in-process crash injection.
- Resolve both new and legacy lockouts through a supported, history-preserving command.
- Serialize all ordinary CLI mutations and recover automatically from a crashed writer after expiry.

**Non-Goals:**

- A filesystem transaction across arbitrary product files or repositories.
- A distributed lock, daemon, database, external coordinator, or lease service.
- CI, provenance, telemetry, dashboards, or operational incident runbooks.
- Host-authenticated resolver or lease-owner identity.
- Changing gate policy, evidence semantics, run budgets, or archive behavior.

## Decisions

### Journal exact target bytes

Each attempt gets `.factory/orchestration/finalizations/<attempt-id>.json`, schema version 1. The journal binds `change`, `taskId`, `attemptId`, clean `sourceRevision`, `completionDate`, and ordered targets. Every target stores its relative path, before digest, after digest, and exact after bytes. The journal also stores a digest of its immutable plan and phase `prepared` or `ready-to-commit`.

The planned pre-commit targets are:

1. the matching OpenSpec `tasks.md`;
2. scribe history with one marker keyed by attempt id;
3. `.factory/identity/now.md`;
4. the attempt JSON with one finalized history event;
5. `.factory/work/index.json`;
6. the same journal rewritten atomically as `ready-to-commit`.

The schema version 1 journal also durably records the work-item commit target (exact after bytes and digests) and the frozen `finalizedAt` timestamp so a process-restart recovery can apply the commit without rebuilding plan bytes. That commit target is not a pre-commit target: it remains the atomic last write and is applied only after every prior target matches its after digest. It is written with temp-plus-rename. No correctness-critical finalization write follows it. Lease release and best-effort ledger append are outside the finalization transaction.

A journal in `ready-to-commit` plus a done work item is committed; no journal rewrite is needed afterward. This avoids a window where the item is done but a later journal-status write can fail.

Alternative considered: write `done` first and compensate on error. Rejected because another process can observe completion and compensation can itself crash.

### Recovery is a compare-and-apply replay

On retry, each target has three outcomes:

- current digest equals after digest: skip;
- current digest equals before digest: atomically write exact after bytes;
- otherwise: stop with a conflict and keep the item not done.

The completion date, timestamps (including frozen `finalizedAt`), history entry, scribe marker, and commit-target bytes are frozen in the first durable journal, so replay does not create new bytes. Because those attempt bytes are frozen once the journal exists, complete MAY write attempt status `finalize-failed` only when failure happens before journal durability. After the journal is durable, recovery replays frozen bytes and MUST NOT rewrite the attempt into `finalize-failed`.

A retry is permitted when the attempt is `accepted`, `finalize-failed` (pre-journal failure), or already `finalized` with this matching journal and an unfinished item. The orchestrator treats that last state as `needs-complete` so the skill loop can recover without manual JSON edits.

Evidence and journal binding still use the clean `sourceRevision` captured at journal creation. A retry MAY proceed with a dirty worktree only when that dirt is exactly partial finalization state from applying journaled targets and a valid journal remains bound to an unchanged clean source HEAD (`sourceRevision` equals current HEAD). Unrelated dirt, an unbound or missing journal, a changed HEAD, or a target conflict fails closed.

If the item and matching ready journal are already committed, `complete` returns the existing finalized result without writes. An item that says done without a matching ready journal is an inconsistency and fails closed.

Alternative considered: infer progress only from current files. Rejected because append-only text cannot distinguish a prior retry from an unrelated edit.

### Fault injection is a library-only hook

The finalizer accepts an optional injected callback in its library options. Tests receive named boundaries before and after journal creation, every pre-commit target, the ready-journal write, and immediately before the work-item commit. The production CLI passes no hook; there is no CLI flag or environment variable that can manufacture a crash.

At each boundary, tests assert the item is not done after failure and that an uninjected retry produces byte-identical final state. The work-item commit itself is atomic, so process death observes either the old non-done bytes or the complete done bytes.

Alternative considered: an environment variable read by production code. Rejected because it creates an externally triggerable denial-of-service path.

### Lockouts use immutable event files

New lockouts live under `.factory/orchestration/lockouts/<lockout-id>/created.json`. Creation data is schema version 1 and includes lockout id, agent, reviewer, reason, and time. Resolution writes `resolved.json` once with resolver, reason, and time. Creation is never edited or deleted.

`idefactory lockout --agent ...` remains an alias for creation, and the explicit form is `idefactory lockout create`. Both print the id. `idefactory lockout resolve <id> --resolver <id> --reason <text>` requires a resolver different from the locked agent.

Repeating the exact resolution returns success and the existing path. Different resolution inputs fail. For a legacy markdown basename, resolution writes a new event directory whose creation reference contains the normalized legacy path and digest; the markdown file remains untouched. Active-lockout detection ignores that legacy note only when its matching resolution event is valid.

Alternative considered: rename or delete the old lockout file. Rejected because it repeats the manual workaround and discards a stable reference.

### One top-level lease wraps each mutation

The CLI classifies commands before dispatch. Mutating commands are init, upgrade, sync-tasks, next, run, attempt start/transition, verify run/import, complete, approve, reject, lockout create/resolve, and resume. They execute inside one `withWriterLease()` call. Internal helpers do not reacquire. Help, status, doctor, and attempt show are read-only. Halt bypasses the lease so the emergency stop cannot be blocked by a stuck writer.

The lease is the atomically created directory `.factory/orchestration/writer.lease/` containing `owner.json`: schema version 1, random lease id, command, pid, hostname, acquiredAt, and expiresAt. Creating parent directories before acquisition is idempotent bootstrap; no application state changes before ownership.

The initial expiry is five minutes. An asynchronous heartbeat renews it once per minute with temp-plus-rename only while the stored lease id matches. The owner removes the directory in `finally` only when that id still matches. A heartbeat that sees a missing or different id marks ownership lost; the wrapper rejects before returning success.

Alternative considered: a PID-only lock. Rejected because PIDs are host-local, reusable, and do not recover across a killed container.

### Stale takeover uses atomic rename

A contender reads and validates the current record. A non-expired lease is never stolen. For an expired lease it re-reads, verifies the same lease id and expiry, then atomically renames `writer.lease` to a unique stale tombstone before creating a new lease directory. Only the rename winner can continue. The winner removes its tombstone after acquiring; other stale tombstones are harmless.

A malformed or unsupported active lease fails closed and is not automatically deleted. Recovery requires a human to inspect and remove that corrupt record; adding a lease-force command is outside this change.

Alternative considered: unlink an expired owner file. Rejected because two contenders can both observe absence between unlink and create.

## Threats

- **Concurrent completion corrupts append-only memory** → The command lease serializes writers; journal replay uses exact bytes and digests.
- **Crash after partial finalization claims done** → Work-item `done` is the atomic final correctness write.
- **Replay duplicates scribe or attempt history** → Stable after bytes and attempt markers make replay idempotent.
- **Journal is edited to overwrite arbitrary files** → Validation accepts only the fixed allowlisted target paths for its bound change/task/attempt and rejects path traversal, symlinks outside the project, schema mismatch, and plan-digest mismatch.
- **Journal from another revision is replayed** → Source revision, identities, and target before/after digests must match.
- **Second writer steals a live lease** → Non-expired records are refused; heartbeat extends live ownership; release checks lease id.
- **Crashed writer blocks forever** → Expired leases have one-winner atomic takeover.
- **Corrupt lease is treated as stale** → Parse or schema failure blocks automatic takeover.
- **Locked agent resolves its own lockout** → Resolver must differ; host identity remains an acknowledged trust boundary.
- **Legacy lockout is silently removed** → Resolution references its path and digest and never renames or deletes it.
- **HALT is blocked by a stuck writer** → Halt bypasses the lease; other mutations still check HALT under their lease.

## Risks / Trade-offs

- [The journal stores copies of factory and OpenSpec target bytes] → Targets are already local repository state; journals stay under ignored orchestration state. Do not add logs, secrets, prompts, or product files to the target allowlist.
- [Five-minute expiry is based on wall clock] → Heartbeats renew active commands; tests inject a clock. Cross-host clock assurance is outside a local filesystem lease.
- [A synchronous operation can block heartbeat delivery] → Current long verification execution is asynchronous. Keep synchronous critical sections below the expiry and fail if ownership is lost.
- [Legacy lockout resolution trusts a resolver string] → Preserve the event and require separation from the locked agent. Host-issued identity remains out of scope.
- [Index can temporarily show done before the item commit] → Queue readers derive status from item files; recovery restores the planned index, and the item itself remains authoritative.
- [Rollback after new journals exist] → Old code ignores journals but may mishandle partially finalized attempts. Roll back only when no prepared journal has an unfinished item.

## Migration Plan

No eager rewrite runs on install or upgrade. Existing completed items remain valid and get no synthetic journals. New `complete` calls create journals lazily.

Legacy markdown lockouts remain active. Resolve them with `idefactory lockout resolve <basename> --resolver <id> --reason <text>`; the original file remains byte-for-byte unchanged.

The lease directory is created lazily. Existing `.factory/config.json`, profiles, decisions, histories, attempts, work items, and run sessions are not rewritten.

Before deployment, tests cover every injected boundary, journal conflict, committed retry, new and legacy lockout resolution, two-process lease contention, lease release on errors, heartbeat, stale takeover, corrupt lease, read-only commands, and HALT.

Rollback by reverting the code only when there is no unfinished journal. Committed journals and immutable lockout event directories may remain as inert records. If an unfinished journal exists, finish it with the new version before rollback; do not manually mark the item done. No journal, lockout event, or decision history is deleted by rollback.

## Open Questions

None. The commit point, lease lifetime and heartbeat, legacy lockout migration, and corrupt-lease behavior are fixed above.
