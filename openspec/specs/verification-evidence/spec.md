# verification-evidence Specification

## Purpose
Records verification and red results only from a schema-validated check registry, a CLI run, or a signature-checked import bound to the source revision.

## Requirements

### Requirement: Check registry schema
The factory SHALL load a versioned check registry that maps each check kind to a non-empty argv array, a working-directory policy, a timeout, and an artifact policy. The registry SHALL be rejected when its schema version is unsupported or any mapping uses a shell command string, an empty argv, or a working directory outside the project root.

#### Scenario: Valid registry entry
- **WHEN** the registry maps `unit` to an argv array, the project working-directory policy, a timeout, and an artifact list
- **THEN** verification accepts that mapping
- **AND** the stored command digest identifies that argv

#### Scenario: Shell command string rejected
- **WHEN** a registry entry gives the command as a single shell string
- **THEN** registry validation fails and no check runs

### Requirement: CLI-run attestation
A verification command SHALL execute one registered argv without a shell, capture its exit code, and write the evidence record itself. The caller SHALL NOT supply the pass boolean for that record. A red run SHALL store a record only for an assertion failure, and only under that check kind.

#### Scenario: Command exits zero
- **WHEN** the verification command runs a registered check and the process exits zero before the timeout
- **THEN** the attempt stores an evidence record whose exit code is zero and whose pass result is derived from that exit
- **AND** the record names the runner and its version

#### Scenario: Command exits non-zero
- **WHEN** the verification command runs a registered check without the red flag and the process exits non-zero
- **THEN** the attempt stores that exit code and the record is not passing evidence

#### Scenario: Red run
- **WHEN** the verification command records a red result and the process exits non-zero after tests have run
- **THEN** the record is stored under that check kind
- **AND** a caller-supplied red object is not stored

### Requirement: Imported attestation
The factory SHALL import an attestation only when it matches the evidence schema, its signature verifies against a public key in the registry, and its command digest matches the registered argv. An import SHALL fail closed when no verification key is configured or the signature is invalid.

#### Scenario: Valid signed import
- **WHEN** an attestation signature verifies and its command digest matches the registry
- **THEN** the attempt stores that attestation as imported evidence

#### Scenario: Invalid signature
- **WHEN** an attestation signature does not verify
- **THEN** import fails and the attempt gains no verification evidence

#### Scenario: Replay across attempts
- **WHEN** an attestation names a different attempt id than the attempt receiving the import
- **THEN** import fails and does not reuse that attestation

### Requirement: Evidence schema
Each stored check record SHALL include schema version, check kind, runner name and version, command digest, exit code, start and finish timestamps, source revision, log digest, artifact digests, and attempt id. A record missing any of those fields SHALL be rejected. A CLI record written by this release also includes the configuration digest and environment fingerprint required by the fingerprinted records requirement.

#### Scenario: Complete record accepted
- **WHEN** a CLI run or valid import writes a record containing every required field
- **THEN** the attempt retains that record

#### Scenario: Missing exit code
- **WHEN** a check record has no exit code
- **THEN** verification rejects the record

### Requirement: Source revision binding
A passing check record SHALL identify the git revision and clean worktree against which the check ran. Verification SHALL refuse to record a pass when the worktree is dirty or the revision cannot be resolved. Uncommitted paths under `.factory/approvals/` or `.factory/exceptions/` and uncommitted changes to `.factory/decisions.md` SHALL NOT by themselves make the worktree dirty. The factory SHALL NOT gitignore `.factory/approvals/` or `.factory/exceptions/`.

#### Scenario: Clean revision recorded
- **WHEN** a registered check exits zero on a clean git worktree
- **THEN** the evidence source revision equals that worktree HEAD

#### Scenario: Dirty worktree
- **WHEN** the worktree has uncommitted changes outside factory run-state and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Approval files alone stay clean
- **WHEN** the only uncommitted paths are under `.factory/approvals/` or are `.factory/decisions.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Exception files alone stay clean
- **WHEN** the only uncommitted paths are under `.factory/exceptions/`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Product changes stay dirty
- **WHEN** `.factory/decisions.md` is modified and a product source file is also modified
- **AND** a check is run
- **THEN** verification does not record a passing result

### Requirement: Check registry preview
The factory SHALL print a preview of registry entries for profile check kinds missing from `checks.json`. It SHALL infer a `unit` entry from a `package.json` test script only when `unit` is missing. The preview SHALL NOT write `checks.json`, SHALL NOT replace an existing entry, and SHALL NOT run a check.

#### Scenario: Missing unit check is previewed
- **WHEN** a profile requires `unit`, `checks.json` has no `unit` entry, and `package.json` has a test script
- **THEN** the preview includes a `unit` entry
- **AND** `checks.json` is unchanged

#### Scenario: Existing entry is kept
- **WHEN** `checks.json` already maps `unit`
- **THEN** the preview does not replace that entry

#### Scenario: Preview does not execute
- **WHEN** the preview command runs
- **THEN** no registered check process starts

### Requirement: Agent histories stay run-state
An uncommitted `.factory/agents/<role>/history.md` file, for any single role directory, SHALL NOT by itself make the worktree dirty for source-revision binding. That binding is the clean-HEAD check for a passing check, for a human gate authorizing accept or complete, and for complete. An uncommitted charter, an uncommitted `.factory/identity/now.md`, a nested history file, or a product source file SHALL still make the worktree dirty. The factory SHALL NOT gitignore agent history files.

#### Scenario: History alone stays clean
- **WHEN** the only uncommitted path is `.factory/agents/engineer/history.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Reviewer history stays clean
- **WHEN** the only uncommitted path is `.factory/agents/reviewer/history.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Accept stays authorized
- **WHEN** an approval bound to the current HEAD has action `accept`
- **AND** the only uncommitted path besides that approval and `.factory/decisions.md` is an agent history file
- **THEN** that approval authorizes accept

#### Scenario: Complete stays authorized
- **WHEN** an approval bound to the current HEAD has action `complete`
- **AND** the only uncommitted path besides that approval and `.factory/decisions.md` is an agent history file
- **THEN** that approval authorizes complete

#### Scenario: Complete does not refuse a history-only worktree
- **WHEN** complete receives an accepted attempt with distinct role identifiers, a passing attestation for every required check at the current HEAD, and a verification profile whose `humanGate` is false
- **AND** the only extra uncommitted path is an agent history file
- **THEN** complete does not fail because the worktree is dirty
- **AND** the work item is done

#### Scenario: Charter stays dirty
- **WHEN** `.factory/agents/engineer/charter.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Identity note stays dirty
- **WHEN** `.factory/identity/now.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Nested history stays dirty
- **WHEN** `.factory/agents/engineer/notes/history.md` is modified and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Product changes stay dirty
- **WHEN** an agent history file is modified and a product source file is also modified
- **AND** a check is run
- **THEN** verification does not record a passing result

#### Scenario: History stays tracked
- **WHEN** ignore rules are checked for `.factory/agents/engineer/history.md`
- **THEN** that file is not ignored

### Requirement: Red records do not replace other kinds
A stored red record for one check kind SHALL NOT replace a stored red record for a different kind.

#### Scenario: Second kind is added
- **WHEN** a red assertion failure is already stored for `unit` and a red run then records `integration`
- **THEN** the attempt still has the `unit` red record
- **AND** it also has the `integration` red record

### Requirement: Infrastructure failure is not red
A red run SHALL NOT store a red record when the argv cannot be started, the run times out, or the runner reports that no tests executed. The command SHALL exit non-zero and SHALL name the result `infrastructure-failure`.

#### Scenario: Command cannot start
- **WHEN** a red run's argv cannot be started
- **THEN** no red record is stored
- **AND** the result is named `infrastructure-failure`

#### Scenario: No tests executed
- **WHEN** a red run exits non-zero and the runner reports that no tests executed
- **THEN** no red record is stored
- **AND** the result is named `infrastructure-failure`

### Requirement: Vacuous red stores nothing
When a red run exits zero, the factory SHALL NOT store a red record, SHALL exit non-zero, and SHALL name the result `vacuous-red`.

#### Scenario: Red run already passes
- **WHEN** a red run exits zero
- **THEN** no red record is stored
- **AND** the result is named `vacuous-red`

### Requirement: Red failure entry is recorded
When a red run does not record an assertion failure, the factory SHALL append a structured failure entry under `evidence.redFailures` on the attempt. The entry SHALL carry the check kind, the classification, whether the run timed out, the timeout limit, the elapsed duration, the exit code, the spawn error code when one exists, the log digest, and the time recorded.

#### Scenario: Timed-out red run is recorded
- **WHEN** a red run's check times out after its registered timeout
- **THEN** the attempt gains a `redFailures` entry for that kind with `timedOut` true, the registered `timeoutMs`, the elapsed duration, and the log digest

#### Scenario: Command cannot start
- **WHEN** a red run's argv cannot be started
- **THEN** the `redFailures` entry records the spawn error code and no exit code

#### Scenario: Exit code is recorded
- **WHEN** a red run exits with a non-zero code that is not an assertion failure
- **THEN** the `redFailures` entry records that exit code

#### Scenario: Red record is unchanged
- **WHEN** a non-assertion red run records a `redFailures` entry
- **THEN** `evidence.reds` has no entry for that kind
- **AND** no evidence record is stored for that kind

### Requirement: Red failure error reports its diagnostics
The error thrown for a non-assertion red run SHALL begin with the classification, as the infrastructure-failure requirement already requires, and SHALL state the diagnostic detail for that run: the timeout limit and elapsed time for a timeout, the spawn error code for a command that cannot start, or the exit code otherwise.

#### Scenario: Timeout detail in the error
- **WHEN** a red run times out
- **THEN** the error names `infrastructure-failure` and states the timeout limit and elapsed time

#### Scenario: Spawn error detail in the error
- **WHEN** a red run's argv cannot be started with a spawn error code of `ENOENT`
- **THEN** the error names `infrastructure-failure` and states `ENOENT`

### Requirement: Raw output stays out of red records
The factory SHALL NOT store raw check output in the attempt, in the thrown error, or in any control event for a red run. The `redFailures` entry SHALL carry only a `sha256:` log digest of the captured output.

#### Scenario: Sentinel output is absent
- **WHEN** a red run's check writes a distinctive string to stdout or stderr and fails without an assertion
- **THEN** that string does not appear in the attempt file, the thrown error, or the control event log
- **AND** the `redFailures` entry carries a `sha256:` log digest

### Requirement: Timed-out red runs count toward the retry cap
A timed-out red run SHALL increment the retry counter for its check kind in the same way as any other infrastructure failure. The fourth occurrence for the same kind SHALL close the run session with `retry-cap` and SHALL throw an error that begins with `retry-cap:` and carries the same diagnostics as the infrastructure-failure error.

#### Scenario: Fourth timeout reaches the cap
- **WHEN** a red run for `unit` times out for the fourth time on the same attempt
- **THEN** the retry counter for `unit` is four
- **AND** the latest run session is closed with `retry-cap`
- **AND** the error begins with `retry-cap:` and states the timeout limit

#### Scenario: Earlier timeout does not close the session
- **WHEN** a red run for `unit` times out once on an attempt
- **THEN** the retry counter for `unit` is one
- **AND** the run session stays open

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
