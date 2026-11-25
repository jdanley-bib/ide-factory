# Spec Delta

## ADDED Requirements

### Requirement: Reusable passing evidence
A passing CLI check record SHALL remain valid at a later HEAD only when its source revision is an ancestor of HEAD, every path that differs between that revision and HEAD is factory run-state, the worktree has no dirty non-run-state path, and the registry entry's configuration digest equals the record's. Any other case SHALL be stale, and a git error while checking SHALL make the record stale.

#### Scenario: Run-state commit keeps evidence valid
- **WHEN** a check passed at revision R and the only paths changed between R and HEAD are under `.factory/attempts/` or `.factory/work/`
- **AND** the registry entry is unchanged
- **THEN** the record is valid at HEAD

#### Scenario: Product change makes evidence stale
- **WHEN** a check passed at revision R and a product source file changed between R and HEAD
- **THEN** the record is stale
- **AND** the reason names the changed product path

#### Scenario: Registry change makes evidence stale
- **WHEN** a check passed at revision R and `.factory/checks.json` changed between R and HEAD
- **THEN** the record is stale

#### Scenario: Timeout change makes evidence stale
- **WHEN** a check passed and its registry entry's timeout is later changed
- **THEN** the record is stale because the configuration digest differs

#### Scenario: Rewritten history makes evidence stale
- **WHEN** a check passed at revision R and R is no longer an ancestor of HEAD
- **THEN** the record is stale

#### Scenario: Rename into run-state does not hide a product path
- **WHEN** a product file was renamed to a run-state path between R and HEAD
- **THEN** the record is stale because the product path is among the changed paths

#### Scenario: Git error fails closed
- **WHEN** the ancestor check or the changed-path listing fails
- **THEN** the record is stale and the reason says git could not verify the revision

### Requirement: One validity rule for every gate
Review handoff, review entry, the run baseline, complete, and the security gate SHALL decide whether a record is valid with the same validity check. A gate SHALL NOT compare a record's revision to HEAD on its own. An imported signed attestation SHALL be valid only at exactly the current clean HEAD.

#### Scenario: Gates agree on one record
- **WHEN** a record is valid by the validity check
- **THEN** review handoff, review entry, and complete all accept it

#### Scenario: Imported attestation is exact-HEAD only
- **WHEN** an imported attestation was recorded at revision R and a run-state commit moves HEAD past R
- **THEN** the import is stale and the reason says an import is reused only at its exact revision

### Requirement: Fingerprinted CLI records
A CLI check record written by this release SHALL include a configuration digest over the registry entry's argv, cwdPolicy, timeoutMs, and artifacts, and an environment fingerprint with the Node version, platform, and architecture. A CLI record without either field SHALL be retained on the attempt, SHALL NOT be reusable, and SHALL report the reason `re-run verify`.

#### Scenario: New record carries the fingerprint
- **WHEN** a CLI run writes a check record
- **THEN** the record holds a configuration digest and an environment fingerprint

#### Scenario: Legacy record is kept but not reused
- **WHEN** an attempt holds a CLI record written before this release
- **THEN** the record remains on the attempt
- **AND** the record is stale with the reason `re-run verify`

### Requirement: Verification status report
`idefactory verify status <attemptId>` SHALL print, for each required check of the attempt, one state from `valid`, `stale`, `missing`, `failed`, or `untrusted`, with a reason. With `--json` it SHALL print one document with `schemaVersion` 1, `allValid`, and one entry per check. The command SHALL NOT write any file, SHALL NOT take the writer lease, and SHALL exit zero whether or not every check is valid.

#### Scenario: Valid check is reported
- **WHEN** a required check has a valid record
- **THEN** its state is `valid` and `allValid` is true only if every required check is valid

#### Scenario: Stale check names the reason
- **WHEN** a required check's only record is stale because of a product change
- **THEN** its state is `stale` and the reason names the changed path

#### Scenario: Missing and failed checks
- **WHEN** a required check has no record
- **THEN** its state is `missing`
- **AND WHEN** a required check's newest record exited non-zero and no record is valid
- **THEN** its state is `failed`

#### Scenario: Untrusted record
- **WHEN** a required check's newest record names a different attempt or command digest
- **THEN** its state is `untrusted`

#### Scenario: Status does not fail the command
- **WHEN** at least one required check is not valid
- **THEN** the command exits zero and `allValid` is false

#### Scenario: Status writes nothing
- **WHEN** `verify status` runs on an attempt
- **THEN** no file under the project changes

## MODIFIED Requirements

### Requirement: Evidence schema
Each stored check record SHALL include schema version, check kind, runner name and version, command digest, exit code, start and finish timestamps, source revision, log digest, artifact digests, and attempt id. A record missing any of those fields SHALL be rejected. A CLI record written by this release also includes the configuration digest and environment fingerprint required by the fingerprinted records requirement.

#### Scenario: Complete record accepted
- **WHEN** a CLI run or valid import writes a record containing every required field
- **THEN** the attempt retains that record

#### Scenario: Missing exit code
- **WHEN** a check record has no exit code
- **THEN** verification rejects the record
