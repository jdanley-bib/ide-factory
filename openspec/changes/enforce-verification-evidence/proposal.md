# Proposal

## Why

Completion still treats a caller-supplied `passed: true` as proof. `complete` matches a check kind and a boolean; `attempt transition` stores whatever JSON the same session provides. Profiles name checks but do not map them to an argv, and nothing binds a result to the source revision that was actually checked. A work item can be finalized on forged evidence.

## What Changes

- Add a versioned, schema-validated check registry that maps each check kind to an argv array, working-directory policy, timeout, and artifact policy.
- Add a CLI verification command that runs a registered check and writes the evidence record itself.
- Add an import command for an externally produced attestation that verifies against a configured public key and the same evidence schema.
- Require evidence to carry runner identity and version, command digest, exit code, start and finish timestamps, source revision, log and artifact digests, and attempt id.
- Bind every passing result to the source revision that was checked, and reject a result when that revision is stale or the worktree no longer matches it.
- **BREAKING:** `attempt transition` no longer accepts caller-supplied red, verification, or security pass/fail records. `complete` fails closed on an unknown check, a missing registry mapping, a non-zero or missing exit code, a stale source revision, a signature or schema failure, or a self-asserted pass boolean.

Out of scope:

- Durable run sessions, step/task/time budgets, and explicit stop-reason persistence.
- Risk policy, `humanGate` enforcement, scoped approvals, and making the security-checking transition mandatory.
- Transactional finalization, crash recovery, lockout resolution, and one-writer leases.
- CI workflows, SBOM generation, SLSA provenance, secret-scan/SAST/dependency tool selection, and observability export.
- Changing which checks a profile lists, or inferring new security checks during classification.
- Archiving `reconcile-factory-specifications` or editing `.factory/` execution state in this planning change.

## Capabilities

### New Capabilities

- `verification-evidence`: Schema-validated check registry, CLI-run and imported attestations, evidence schema, and source-revision binding.

### Modified Capabilities

- `guided-build`: Attempt transitions retain only CLI-issued or imported check evidence, and completion fails closed unless every required check has a fresh, schema-valid attestation.
- `project-install`: Init installs the versioned check registry and preserves an existing registry on reinstall.

## Impact

- Affected specs: new `verification-evidence`; modified `guided-build` and `project-install`.
- Affected runtime, when applied: check registry schema and template, `idefactory verify` run/import, attempt evidence merge, and `complete` evidence checks. Profiles continue to name required checks only.
- Affected tests, when applied: orchestration fixtures that currently finalize with synthetic `passed: true` must go through the verification command or the same writer it uses.
- Dependencies: Node `node:crypto` for digests and signature verification. No new package and no model launcher.
- Verification commands for this planning change: `npx openspec validate enforce-verification-evidence --strict` and `npm test`.
- This proposal does not apply, implement, or archive the change.

## Acceptance criteria

- Strict validation of this change passes, and `npm test` still passes with no runtime edits in the planning commit.
- After implementation, a caller-supplied verification object with `passed: true` cannot move an attempt to a passing check record and cannot satisfy `complete`.
- After implementation, `complete` rejects each of these cases in its own test: unknown check kind, check kind with no registry mapping, missing or non-zero exit code, source revision different from the current clean HEAD, imported attestation with an invalid signature, and evidence that does not match the schema.
- After implementation, every successful `complete` in the suite used a CLI-run or signature-valid imported attestation whose `sourceRevision` equals the clean HEAD being finalized.
- After implementation, `idefactory init` on an empty project writes a schema-valid registry, and reinstall leaves an existing registry byte-for-byte unchanged.
