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
A verification command SHALL execute one registered argv without a shell, capture its exit code, and write the evidence record itself. The caller SHALL NOT supply the pass boolean for that record.

#### Scenario: Command exits zero
- **WHEN** the verification command runs a registered check and the process exits zero before the timeout
- **THEN** the attempt stores an evidence record whose exit code is zero and whose pass result is derived from that exit
- **AND** the record names the runner and its version

#### Scenario: Command exits non-zero
- **WHEN** the verification command runs a registered check and the process exits non-zero
- **THEN** the attempt stores that exit code and the record is not passing evidence

#### Scenario: Red run
- **WHEN** the verification command records a red result for a registered check
- **THEN** the record is stored only when that command exits non-zero
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
Each stored check record SHALL include schema version, check kind, runner name and version, command digest, exit code, start and finish timestamps, source revision, log digest, artifact digests, and attempt id. A record missing any of those fields SHALL be rejected.

#### Scenario: Complete record accepted
- **WHEN** a CLI run or valid import writes a record containing every required field
- **THEN** the attempt retains that record

#### Scenario: Missing exit code
- **WHEN** a check record has no exit code
- **THEN** verification rejects the record

### Requirement: Source revision binding
A passing check record SHALL identify the git revision and clean worktree against which the check ran. Verification SHALL refuse to record a pass when the worktree is dirty or the revision cannot be resolved. Uncommitted paths under `.factory/approvals/` and uncommitted changes to `.factory/decisions.md` SHALL NOT by themselves make the worktree dirty. The factory SHALL NOT gitignore `.factory/approvals/`.

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
