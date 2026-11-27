# Design

## Context

See proposal.md for motivation. Today:

- `verifyRun` in `src/lib/verification-evidence.mjs` stores a red with `attempt.evidence.reds = { ...attempt.evidence.reds, [kind]: record }`, which replaces any earlier red for that kind. It refuses a red for a kind that has any exception.
- `redForKind` in `src/lib/red-evidence.mjs` reads `evidence.reds[kind]`, with a legacy single `evidence.red` fallback. `hasAnyFailingRed`, the gates, and the exception code all read through it.
- An invalid-red waiver (from `invalid-red-waiver`) stores `invalidRed.redDigest`, the digest of the canonical JSON of the stored red. `redSatisfaction` returns `waiver` only while the stored red still has that digest.
- `mergeEvidence` in `src/lib/attempt.mjs` never writes `reds`, so only `verify run` changes red storage.
- An attempt may have at most one exception per kind (`bindRedException`).

## Goals / Non-Goals

**Goals:**

- No red record is ever lost or replaced.
- A later red after an invalidation is recordable, inspectable next to the invalidated one, and tied to the waiver by a verifiable digest.
- Existing readers keep working without edits.

**Non-Goals:**

- Detecting write order, allowing multiple exceptions per kind, or migrating old data.

## Decisions

**1. Append to a history and keep `reds[kind]` as the current pointer.**
`evidence.redHistory[kind]` is an array of every red record in order. `evidence.reds[kind]` continues to hold the latest record, written in the same attempt-file write. All existing readers use `reds[kind]`, so none changes. Alternative: change `reds[kind]` to an array. Rejected: it touches every reader and the stored shape of every old attempt. Alternative: a separate log file per attempt. Rejected: the attempt file is already the single atomic write for evidence, and a second file adds a crash window.

**2. Seed the history lazily.**
On the first append for a kind, if `reds[kind]` exists and the history does not, the existing record is copied into the history first. A reader of an attempt with no history treats `[reds[kind]]` as the history. No migration pass is needed, and the digest of an old red is the same value as before because the record bytes are not re-serialized differently (canonical JSON is the digest input).

**3. Allow `--red` after an invalid-red waiver only.**
`verifyRun` keeps refusing a kind with a reuse exception or an ordinary waiver. For an invalid-red waiver it proceeds and appends. This reverses part of the `invalid-red-waiver` rule, deliberately: that rule existed because a replacement would overwrite the invalidated record, and append-only storage removes that reason. Alternative: allow `--red` after any exception. Rejected: for reuse and ordinary waivers the system recorded that no red ran on this attempt, and a later red would contradict the stored claim.

**4. Satisfaction after invalidation.**
`redSatisfaction` for a kind with an invalid-red waiver: `waiver` if the current red's digest equals `invalidRed.redDigest`; `cli` if the current red is a failing CLI red, its `startedAt` is after the waiver's `issuance`, and the history holds an entry with `invalidRed.redDigest`; otherwise `missing`. The start-after-issuance check stops the old record being replayed, and the history check detects tampering with the invalidated entry. The returned value is `cli`, so every consumer treats it as an ordinary red, and the display adds the invalidation context from the waiver.

**5. One invalidation per kind.**
`bindRedException` already refuses a second exception for a kind. That limit is kept, so a later red that is itself post-hoc cannot be invalidated again on the same attempt. The attempt then follows the usual routes: review rejects it and a replacement attempt starts (a reused red cannot come from an invalidated source), or `evidence-recovery` applies after acceptance. This bounds the loop.

**6. `red list` as the inspection surface.**
It reads the history, computes each digest with the same function the waiver uses, and joins exception references. It is read-only and has a JSON form, so an agent or a script can verify a waiver's reference without parsing attempt files.

**7. Display reuses the exception description.**
`describeException` gains a branch for an invalid-red waiver whose kind now has a later red. The sentence names both digests and says the reviewer judges whether the later red preceded the implementation, matching the existing limitation that the CLI cannot detect write order.

## Risks / Trade-offs

- [The attempt file grows with each red] → Reds are bounded by the retry cap and the one-invalidation rule, and records are small (digests, not raw output).
- [A later red recorded after implementation looks genuine] → The history, timestamps, and both digests are shown to the reviewer, and the reviewer charter already requires judging red provenance. This is the same limitation as the existing invalid-red rule.
- [Two writers racing on the attempt file] → The writer lease already serializes factory writes, and the append is one atomic write.
- [Reversing part of the `invalid-red-waiver` refusal confuses readers of the archive] → The proposal and the spec delta name the rule being changed, and guidance states the final behavior once.

## Migration Plan

No data migration. Attempts without `redHistory` behave as a one-entry history. Rollback is a code revert: older builds ignore `redHistory` and read `reds[kind]`, which stays correct as the latest red; they would refuse a later red after an invalidation, as before.
