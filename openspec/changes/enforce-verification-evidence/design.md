# Design

## Context

See `proposal.md` for motivation. Today `profiles.json` names check kinds. `attempt transition --evidence` copies caller JSON into the attempt, and `complete` accepts a matching kind with `passed === true`. Red confirmation requires only `command` and `passed: false`. No argv registry, exit code, digest, runner identity, or source revision is required. The reconciled `guided-build` spec describes that current gate and is the baseline this change tightens.

Constraints:

- Keep `.factory/work/` as the only queue and keep the IDE session model. The CLI runs processes; it does not launch a model.
- Preserve profile check lists and security-stage routing. This change decides whether a named check has trustworthy evidence, not which stage is mandatory.
- Use Node APIs already available to the package. Do not add a dependency.
- Installation must preserve an existing registry, decisions, and histories.

## Goals / Non-Goals

**Goals:**

- Make every passing check result come from `idefactory verify run` or a signature-valid `idefactory verify import`.
- Validate the registry and evidence with an in-repo schema, and derive pass/fail from the exit code.
- Bind a pass to the clean git HEAD that was checked, and fail closed on mismatch.
- Give implementation a test-first map for forged booleans, unknown checks, missing mappings, bad exits, stale revisions, and bad signatures.

**Non-Goals:**

- Durable run budgets, risk gates, approval tokens, mandatory security transitions, transactional `complete`, lockout recovery, and one-writer leases.
- Choosing or installing secret-scan, SAST, dependency-audit, or build tools. Kinds without a registry argv stay unmapped and fail closed.
- CI configuration, SBOM, SLSA provenance, key distribution, and telemetry.

## Decisions

### Keep the registry separate from profiles

`.factory/checks.json` is the versioned execution registry. `profiles.json` continues to list which kinds a profile requires. Completion still resolves the required kind list as it does now, then asks the registry how each kind runs.

`schemaVersion` is `1`. Each entry has `argv` (non-empty string array), `cwdPolicy` (`project` only), `timeoutMs` (positive integer), and `artifacts` (relative paths inside the project). Validation rejects a shell string, an empty argv, a relative parent segment, or an absolute path outside the project root. The shipped template maps `unit` to `["npm", "test"]` because that is the command this repository runs. It does not invent argv for the other profile names.

Alternative considered: put argv on each profile. Rejected because several profiles share `unit` and the execution contract would drift.

### The verify command is the only check-evidence writer

`idefactory verify run <attemptId> --check <kind>` loads the registry, resolves the kind, requires a clean git HEAD, spawns `argv` with `cwd` at the project root and `shell: false`, enforces the timeout, and writes one evidence record onto that attempt. `idefactory verify run <attemptId> --check <kind> --red` uses the same path and stores the record as red evidence only when the exit code is non-zero.

`attempt transition` still accepts review fields (`reviewerId`, `verdict`, `notes`). If the evidence payload contains `red`, `verification`, or `security`, the transition fails and writes nothing from that payload. `passed` on a stored record is derived: exit code `0`, `timedOut: false`, schema valid, and worktree clean at start. Callers cannot set it.

A `HALT` file blocks verify, transition, and complete.

Alternative considered: keep transition storage but ignore `passed` unless other fields look right. Rejected because the caller can still forge exit code and digests.

### Import verifies a pinned signature and does not replace red

`idefactory verify import <attemptId> --file <attestation.json>` accepts a record with the evidence schema plus a base64 Ed25519 signature. The signed bytes are canonical JSON: UTF-8, recursively sorted keys, no insignificant whitespace, signature field removed. The registry `importKeys` entries are SPKI PEMs. Verification uses `node:crypto`. Missing keys, an unknown key id, or a bad signature fail closed.

The attestation `attemptId` must equal the target attempt, and its `commandDigest` must equal the digest of the current registry argv for that kind. Import can satisfy a passing check. It cannot create red evidence.

Alternative considered: accept any JSON that matches the field list. Rejected because that recreates self-assertion. Full certificate chains and transparency logs belong to the later provenance change.

### Evidence identity and digests

A stored record contains `schemaVersion`, `id`, `attemptId`, `kind`, `issuer` (`cli` or `import`), `runner.name`, `runner.version`, `argv`, `commandDigest`, `cwdPolicy`, `exitCode`, `timedOut`, `startedAt`, `finishedAt`, `sourceRevision`, `worktreeClean`, `logDigest`, and `artifactDigests`. Digests are lowercase `sha256:` hex. The log digest covers the captured stdout and stderr. Each declared artifact is hashed after the process exits; a missing declared artifact makes the record non-passing.

`commandDigest` is the hash of the canonical argv JSON. Completion recomputes it from the current registry and rejects a mismatch, so editing the registry after a run invalidates old passes.

### Source revision is clean HEAD

When git cannot resolve `HEAD`, or `git status --porcelain` is non-empty, verify does not record a pass. A passing record stores that HEAD as `sourceRevision`. Completion accepts the record only when the worktree is still clean and HEAD is still that revision. Red evidence keeps the revision it ran against and is not required to equal the later green HEAD. A required test kind still needs one CLI red record for that same registered kind before complete.

Alternative considered: hash the whole worktree without git. Rejected because the reconciled factory already lives in git, and a second digest would weaken the stale-revision rule.

### Completion fails closed without changing finalization order

`complete` keeps its current order: gate checks, then mark the work item, checkbox, scribe note, and finalized state. This change replaces `assertChecksPassed` with schema, registry, issuer, exit code, digest, and revision checks. It does not add a journal or make those writes atomic.

Required kinds still come from `item.factory.checks` when present, otherwise the profile, otherwise `unit`. An unknown kind or a kind with no registry entry fails completion.

## Risks / Trade-offs

- [Caller forges `passed: true` through `attempt transition`] → Reject check-result payloads and derive pass from the exit code written by verify.
- [Shell injection or a substituted command string] → Store argv arrays only, spawn with `shell: false`, and recheck `commandDigest` at completion.
- [Evidence from a stale or dirty tree is reused] → Pass records require a clean HEAD, and completion repeats that comparison.
- [An imported attestation is replayed on another attempt or commit] → Bind `attemptId`, `commandDigest`, and `sourceRevision`; fail closed without a configured key.
- [A timeout or missing artifact is treated as a pass] → Store `timedOut` and require every declared artifact digest.
- [The registry is weakened after a successful run] → Completion hashes the current argv and rejects a changed digest.
- [Red evidence is fabricated to satisfy test-first] → Red records come only from a non-zero CLI run of the registered argv.
- [Projects whose profiles name `build`, `integration`, or security checks have no default argv] → Those checks fail closed until the project registers an argv. This change does not select those tools.
- [In-flight attempts hold the old evidence shape] → They cannot complete until verify is re-run. Rollback is a code revert, which restores the weaker boolean gate.
- [Import public keys checked into the project are an operator trust decision] → The schema stores keys; distribution and rotation stay outside this change.

## Migration Plan

1. Add the schema, `.factory/checks.json` template, and init behavior that writes a missing registry without replacing an existing one.
2. Add failing tests for registry rejection, CLI-run evidence, red runs, import success and failure, transition rejection, and each completion rejection case before production edits.
3. Update current orchestration fixtures that finalize with synthetic `passed: true`. Each successful complete path creates a clean git fixture, registers the required argv, and uses verify or import.
4. Switch `complete` and transition to the new gate. Do not change profile contents, security routing, or the finalization write sequence.
5. Verify with `npx openspec validate enforce-verification-evidence --strict`, `npm test`, and `node src/cli.mjs doctor`.
6. Roll back by reverting the implementation commit. Old attempts remain JSON. The previous CLI will again trust `passed`; operators who need the strict gate stay on the new revision. No data migration script is required.

## Open Questions

None. Key distribution, CI signing, and tool choice for unmapped check kinds are deferred to later roadmap changes rather than left open inside this design.
