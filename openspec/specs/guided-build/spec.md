# guided-build Specification

## Purpose
Gives the IDE one role-scoped packet for the next factory work item and requires test-first work plus a separate review.

## Requirements

### Requirement: One role per packet
`idefactory next` and `idefactory run` SHALL name exactly one active role and SHALL include only that role's charter and history paths as required role context.

#### Scenario: Engineer packet
- **WHEN** a work item is ready and next runs
- **THEN** the packet names the engineer role and the engineer charter and history paths
- **AND** it does not include other agents' charters as required reading

### Requirement: Method and review
The work packet and factory skills SHALL require a failing test before production code only when the work item's task class is `code` and its verification profile includes a test check. A `lightweight` item SHALL NOT require a failing test. For a `code` item the skills SHALL name `idefactory verify run --check <kind> --red` for the failing test and `idefactory verify run --check <kind>` for the passing run. The skills SHALL NOT tell the session to attach a pass boolean to an attempt transition. Verification evidence SHALL still be produced by the verification command before review, and review SHALL still be a role other than the implementer.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read for a `code` work item whose profile includes a test check
- **THEN** it requires `idefactory verify run` with `--red` before production code, a later passing `idefactory verify run`, and a different role for review

#### Scenario: Build skill for a lightweight item
- **WHEN** the factory-build skill is read for a `lightweight` work item
- **THEN** it does not require a failing test before production code

### Requirement: No autonomous loop
The CLI SHALL NOT launch an IDE agent, a model process, or a continuous build loop. Human-started orchestration SHALL return one role-scoped request only when the persisted session still has remaining budget and the work state changed since the previous request.

#### Scenario: Next is text only
- **WHEN** next runs
- **THEN** it prints a packet and does not spawn a child process that invokes a model

#### Scenario: Run requests an IDE step
- **WHEN** run reaches a work item stage that needs an IDE role and the persisted session has remaining budget and a changed work state
- **THEN** it exits with the needs-agent code and prints one role-scoped orchestration request
- **AND** it does not spawn a model process

#### Scenario: Budget stops the request
- **WHEN** the persisted session has no remaining agent-step budget
- **THEN** run does not exit with the needs-agent code
- **AND** it prints no orchestration request

#### Scenario: Unchanged work stops the request
- **WHEN** the work state is unchanged since the previous request
- **THEN** run prints no orchestration request
- **AND** it does not spawn a model process

### Requirement: Halt
When a file named `HALT` exists in the project root, next, sync-tasks, run, attempt mutations, and complete SHALL refuse to mutate factory state.

#### Scenario: Halt file
- **WHEN** `HALT` exists and run executes
- **THEN** the command exits with an error and does not emit an agent request

### Requirement: Attempt lifecycle
Each started work item SHALL have a persisted attempt whose state transitions reject illegal stage changes. Review notes are accepted from the reviewer. Red, verification, and security check records SHALL be retained only when the verification command wrote them. A `code` attempt SHALL NOT enter `verifying` until each required test kind has a stored failing red record or a valid red exception from the red-evidence-exceptions capability. A `lightweight` attempt MAY enter `verifying` from `implementing` with no red record.

#### Scenario: Illegal transition
- **WHEN** an attempt transition skips from assigned directly to accepted
- **THEN** the command exits with an illegal-transition error

#### Scenario: Caller-supplied check result
- **WHEN** an attempt transition includes a caller-supplied red, verification, or security result
- **THEN** the transition is rejected and the attempt does not store that result

#### Scenario: Code attempt needs every test kind
- **WHEN** a `code` attempt requires `unit` and `integration` and only `unit` has a stored failing red record
- **THEN** the transition into `verifying` is rejected

#### Scenario: Exception satisfies one kind
- **WHEN** a `code` attempt requires `unit` and `integration`, has a stored failing red record for `unit`, and has a valid red exception for `integration`
- **THEN** the transition into `verifying` is accepted

#### Scenario: Lightweight attempt skips red
- **WHEN** a `lightweight` attempt transitions from `implementing` to `verifying` with no red record
- **THEN** the transition is accepted

### Requirement: Security review stage
Run SHALL request the security-reviewer role before the reviewer when a work item's `securityProfile` is `security-sensitive` or when its checks include a security-patterned check (for example threat-review, sast, secret, or audit). Run SHALL NOT treat `verificationProfile` alone as that trigger. For that work, a transition from `verifying` to `awaiting-review` SHALL be rejected and SHALL leave the attempt state unchanged.

#### Scenario: Security-sensitive verification
- **WHEN** an attempt whose work item has `securityProfile: security-sensitive` or a security-patterned check reaches verification
- **THEN** the next orchestration request names the security-reviewer role

#### Scenario: Direct review is rejected
- **WHEN** that attempt transitions from `verifying` to `awaiting-review`
- **THEN** the transition is rejected
- **AND** the attempt remains in `verifying`

### Requirement: Separate reviewer
Completion SHALL require recorded implementer and reviewer identifiers and SHALL refuse when the two identifiers are equal. When governance policy version is 2, the reviewer identifier SHALL be a verified principal subject. The implementer identifier SHALL remain a local agent id.

#### Scenario: Same reviewer and implementer
- **WHEN** complete receives an accepted attempt whose reviewer identifier equals its implementer identifier
- **THEN** completion fails and the work item remains unfinished

#### Scenario: Policy version 2 reviewer is not verified
- **WHEN** policy version is 2 and the reviewer identifier is not a verified principal subject
- **THEN** completion fails and the work item remains unfinished

### Requirement: Finalize accepted work
Complete SHALL require an accepted attempt, or a matching recoverable finalization journal, and, for every required check, a schema-valid passing attestation whose exit code is zero and whose source revision equals the current clean HEAD. A `code` item SHALL also have, for each required test kind, a stored failing CLI red record or a valid red exception from the red-evidence-exceptions capability. A `lightweight` item SHALL NOT require a red record.

#### Scenario: Successful completion
- **WHEN** complete receives an accepted `code` attempt with distinct role identifiers, a schema-valid passing attestation for every required check at the current clean HEAD, a stored failing red record or valid red exception for each required test kind, and a verification profile whose `humanGate` is false
- **THEN** the matching journal is ready to commit, the OpenSpec checkbox is checked, scribe and identity records are current, the attempt is finalized, and the work item is done
- **AND** the atomic work-item done update was the final correctness-critical write
- **AND** the journal includes the durable commit target and frozen `finalizedAt` applied last, not as a pre-commit target

#### Scenario: Missing evidence
- **WHEN** required verification evidence is absent
- **THEN** complete fails and does not claim the work item is finalized

#### Scenario: Forged pass boolean
- **WHEN** an attempt carries a caller-supplied check object whose pass boolean is true and no verification-command attestation
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Unknown or unmapped check
- **WHEN** a required check kind is absent from the registry or has no argv mapping
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Stale source revision
- **WHEN** a required attestation names a source revision other than the current clean HEAD
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Lightweight completion without red
- **WHEN** complete receives an accepted `lightweight` attempt that meets every passing-attestation requirement and has no red record
- **THEN** the missing red record does not fail completion

#### Scenario: Code completion missing one red kind
- **WHEN** a `code` item requires `unit` and `integration` and the attempt has a failing red record for `unit` only
- **THEN** complete fails and the work item remains unfinished

#### Scenario: Code completion with an exception
- **WHEN** a `code` item requires `unit` and the accepted attempt has a valid reuse exception for `unit` and every other completion requirement
- **THEN** complete succeeds
- **AND** the attempt still has no CLI red record for `unit`

#### Scenario: Altered exception at completion
- **WHEN** the attempt's only red for a required kind is an exception whose file no longer matches its stored digest
- **THEN** complete fails and the work item remains unfinished

### Requirement: Journaled completion commit
Complete SHALL journal deterministic target contents, idempotently apply every pre-commit target, and atomically mark the work item done as the final correctness-critical write. A failure before that commit point SHALL leave the item not done and recoverable by repeating complete.

#### Scenario: Recover interrupted completion
- **WHEN** complete is repeated for a matching journal whose work item is not done
- **THEN** it resumes remaining journal steps without duplicate finalization records
- **AND** it marks the item done only after every pre-commit target matches the journal
- **AND** the commit uses the journaled commit-target bytes and frozen `finalizedAt`

#### Scenario: Finalize-failed only before journal
- **WHEN** completion fails before the journal is durable
- **THEN** complete MAY record attempt status `finalize-failed`
- **AND** after journal durability it resumes frozen bytes instead of rewriting finalize-failed

#### Scenario: Dirty worktree only for partial finalization
- **WHEN** retry dirt is exactly partial journaled finalization and a valid journal remains bound to unchanged clean source HEAD
- **THEN** complete may proceed
- **AND** unrelated dirt, HEAD drift, or conflict fails closed

### Requirement: Gated completion approval
When the verification profile `humanGate` is true, complete SHALL also require a valid scoped approval whose action is `complete`.

#### Scenario: Gated completion
- **WHEN** `humanGate` is true and no valid `complete` approval exists
- **THEN** complete fails and the work item remains unfinished

### Requirement: Task class
Each work item SHALL have task class `code` or `lightweight`. An explicit `factory.taskType` of one of those two values SHALL win. When it is omitted, inferred kind `docs` SHALL be `lightweight` and every other inferred kind SHALL be `code`. Any other explicit value SHALL fail sync and SHALL NOT write the work item. A required test kind SHALL be `unit`, `integration`, `playwright`, `contract`, or a kind whose name starts with `unit-`.

#### Scenario: Docs default to lightweight
- **WHEN** a task has no `factory.taskType` and its inferred kind is docs
- **THEN** the work item's task class is `lightweight`

#### Scenario: Explicit class wins
- **WHEN** a task's inferred kind is docs and `factory.taskType` is `code`
- **THEN** the work item's task class is `code`

#### Scenario: Invalid class fails sync
- **WHEN** `factory.taskType` is any value other than `code` or `lightweight`
- **THEN** sync fails and does not write that work item

### Requirement: Baseline before implement
Before the first implement request of a run, the factory SHALL run each mapped test command once.

#### Scenario: Baseline runs before implement
- **WHEN** a run is about to emit its first implement request and has not baselined the current HEAD
- **THEN** it runs each mapped test command before that request

### Requirement: Baseline infrastructure failure
When a baseline command cannot start, times out, or reports that no tests executed, run SHALL stop with reason `infrastructure-failure`, SHALL print no implement request, and SHALL name setup in the output.

#### Scenario: Baseline command cannot start
- **WHEN** the baseline command cannot start
- **THEN** run prints no implement request
- **AND** the stop reason is `infrastructure-failure`
- **AND** the output names setup

### Requirement: Baseline assertion failure
When a baseline command exits non-zero after tests ran, run SHALL stop with reason `baseline` and SHALL NOT store a red record. `--accept-baseline` for that HEAD SHALL record the human's acceptance and SHALL allow the implement request. A later run whose baseline commands exit zero SHALL continue without `--accept-baseline`.

#### Scenario: Accepted baseline
- **WHEN** the baseline exits non-zero after tests ran and the human passes `--accept-baseline` for that HEAD
- **THEN** the run may emit the implement request
- **AND** no red record is stored for the baseline

#### Scenario: Green baseline continues
- **WHEN** a later run's baseline commands exit zero
- **THEN** the run continues without `--accept-baseline`

### Requirement: Retry cap
The fourth identical infrastructure failure, the fourth `vacuous-red`, or the fourth review rejection of the same attempt SHALL be refused. Run SHALL then stop with reason `retry-cap` and SHALL emit no further request for that attempt until the human passes `--new-run`.

#### Scenario: Fourth identical infrastructure failure
- **WHEN** the same attempt has already recorded three identical infrastructure failures and a fourth is attempted
- **THEN** the fourth result is not stored as red
- **AND** the stop reason is `retry-cap`
- **AND** no orchestration request is printed

### Requirement: Implementer packet includes prior rejections
The implementer packet for a work item SHALL include the rejection notes stored on earlier attempts for that same change and task, in attempt order, each with its attempt id. A packet for any other role SHALL NOT include those notes. When no earlier attempt was rejected, the implementer packet SHALL NOT contain a prior-rejection section. Rejection notes SHALL NOT authorize accept or complete.

#### Scenario: Second attempt sees the rejection
- **WHEN** an earlier attempt for the same work item was rejected with notes and next prints an implementer packet for a new attempt
- **THEN** the packet contains those notes and the rejected attempt id

#### Scenario: Reviewer packet omits the notes
- **WHEN** next prints a reviewer packet for a work item that has a prior rejection
- **THEN** the packet does not contain those rejection notes

#### Scenario: Notes do not authorize completion
- **WHEN** a prior rejection note exists and no scoped approval exists
- **THEN** the note does not authorize accept or complete

### Requirement: Transition evidence sources
`idefactory attempt transition` SHALL accept its evidence from exactly one of `--evidence <json>`, which carries inline JSON, or `--evidence-file <path>`, which names a file holding JSON. A relative path SHALL resolve from the current working directory. Evidence from either source SHALL go through the same validation and produce the same attempt result. `--evidence-file` SHALL NOT accept inline JSON, and the command SHALL NOT modify, move, or delete the file.

#### Scenario: Evidence from a file
- **WHEN** a transition is run with `--evidence-file` naming a file that holds a JSON object with a reviewer id and verdict
- **THEN** the attempt moves to the requested state with that evidence
- **AND** the stored attempt equals the one the same evidence passed inline would produce

#### Scenario: Evidence file with spaces and escaped quotes
- **WHEN** the evidence file holds a note containing spaces and escaped quotation marks
- **THEN** the stored note equals the file content character for character

#### Scenario: Inline evidence is unchanged
- **WHEN** a transition is run with `--evidence` and valid inline JSON
- **THEN** it behaves as it did before this requirement

#### Scenario: File is left in place
- **WHEN** a transition with `--evidence-file` succeeds or fails
- **THEN** the named file still exists with its original content

#### Scenario: Both sources given
- **WHEN** a transition is run with both `--evidence` and `--evidence-file`
- **THEN** the command exits with an error that tells the user to include only one of them
- **AND** the attempt is not changed

#### Scenario: Inline JSON passed as the file value
- **WHEN** `--evidence-file` is given a value that is JSON text rather than the path of an existing file
- **THEN** the command exits with an error that names the missing file
- **AND** it does not parse the value as evidence

### Requirement: Transition evidence file encoding
The evidence file SHALL be read as UTF-8 and its content SHALL otherwise be parsed unchanged. The reader SHALL accept a leading UTF-8 byte-order mark and SHALL decode UTF-16LE content that begins with a UTF-16LE byte-order mark, because Windows PowerShell 5.1 writes both.

#### Scenario: UTF-8 with a byte-order mark
- **WHEN** the evidence file is UTF-8 with a leading byte-order mark
- **THEN** the transition accepts its JSON object

#### Scenario: UTF-16LE file
- **WHEN** the evidence file is UTF-16LE with a byte-order mark
- **THEN** the transition accepts its JSON object

#### Scenario: Non-ASCII text
- **WHEN** the evidence file is UTF-8 and the note contains non-ASCII characters
- **THEN** the stored note equals the file content

### Requirement: Transition evidence input errors
A transition that cannot obtain evidence SHALL fail before it changes the attempt and SHALL name the cause. A missing path, an unreadable file, a directory, an empty file, content that is not valid JSON, and JSON that is not an object SHALL each fail with a message that names the evidence file path. A flag given without a value SHALL fail with the transition usage. Inline JSON that does not parse SHALL fail with a message that names `--evidence-file` as the alternative.

#### Scenario: Missing file
- **WHEN** `--evidence-file` names a path that does not exist
- **THEN** the command exits with an error that names that path
- **AND** the attempt is not changed

#### Scenario: Directory
- **WHEN** `--evidence-file` names a directory
- **THEN** the command exits with an error that names that path

#### Scenario: Empty file
- **WHEN** the evidence file is empty
- **THEN** the command exits with an error that says the file is empty and names its path

#### Scenario: Malformed JSON in the file
- **WHEN** the evidence file holds text that is not valid JSON
- **THEN** the command exits with a parse error that names the file path

#### Scenario: JSON that is not an object
- **WHEN** the evidence file holds a JSON array, string, number, boolean, or null
- **THEN** the command exits with an error that says evidence must be a JSON object and names the file path

#### Scenario: Flag without a value
- **WHEN** `--evidence` or `--evidence-file` is given with no value
- **THEN** the command exits with the transition usage

#### Scenario: Malformed inline JSON
- **WHEN** `--evidence` holds text that is not valid JSON
- **THEN** the command exits with an error that names `--evidence-file` as an alternative
- **AND** the attempt is not changed

#### Scenario: Existing validation still applies
- **WHEN** the evidence file holds a caller-supplied verification result
- **THEN** the transition is rejected as it is for inline evidence

### Requirement: Packet names the evidence file option
The work packet SHALL tell the implementing role to record transition evidence with `--evidence-file`.

#### Scenario: Engineer packet
- **WHEN** a work packet is rendered for the engineer role
- **THEN** it names `idefactory attempt transition` and `--evidence-file`

### Requirement: Review requires what the red gate requires
The factory-review command and the Review section of the factory-build skill SHALL tell the reviewer to accept only when every required verification check has a passing CLI record on the current clean HEAD and, for a `code` item whose checks include a test kind, each such kind has a recorded failing red or a valid recorded red exception.

#### Scenario: Code item with a test check
- **WHEN** the review command is read for a `code` work item whose checks include `unit`
- **THEN** it requires a recorded failing red or a valid red exception for `unit` and a passing CLI record for each required check

#### Scenario: Unconditional wording is gone
- **WHEN** the review command and the build skill are read
- **THEN** neither says to accept only if a failing test was written first
- **AND** neither says acceptance requires red evidence without naming the conditions

### Requirement: Review guidance names the cases that need no red
The review guidance SHALL say that a `lightweight` item, and a `code` item whose checks include no test kind, need no failing test. It SHALL say that a red exception is not a red that ran, that the reviewer relies on the evidence recorded on the attempt, and that the reviewer does not ask for a new failing test where a valid exception is recorded. It SHALL keep review by a role other than the implementer.

#### Scenario: Lightweight item
- **WHEN** the review command is read for a `lightweight` work item
- **THEN** it does not require a failing test

#### Scenario: No test check
- **WHEN** the review command is read for a `code` item whose checks include no test kind
- **THEN** it does not require a failing test

#### Scenario: Recorded exception
- **WHEN** the attempt holds a valid reuse or waiver exception for a required kind
- **THEN** the guidance tells the reviewer to accept the exception as satisfying that kind
- **AND** it does not tell the reviewer to treat the exception as a red that ran or to ask for a new failing test

#### Scenario: Independent review remains
- **WHEN** the review command is read
- **THEN** it still says the reviewer is a different role from the implementer and that clean-revision verification must pass

### Requirement: Charters match the review guidance
The engineer and reviewer charters that init writes for a new project SHALL state the same conditions for a failing test as the review guidance: required only for a `code` item whose checks include a test kind, satisfied by a recorded red or a valid red exception.

#### Scenario: New project charters
- **WHEN** init runs in a directory with no `.factory/`
- **THEN** the engineer charter requires a failing test only for a `code` item whose checks include a test kind
- **AND** the reviewer charter accepts a valid recorded red exception in place of a red

### Requirement: Packet states the red requirement
The work packet SHALL state the work item's task class and the check kinds that need red evidence, or that none do. A `lightweight` item and a `code` item with no test kind SHALL show none.

#### Scenario: Code item with a test check
- **WHEN** a packet is rendered for a `code` item whose checks are `unit` and `build`
- **THEN** it states task class `code` and red required for `unit`

#### Scenario: Lightweight item
- **WHEN** a packet is rendered for a `lightweight` item whose checks include `unit`
- **THEN** it states task class `lightweight` and that no red is required

#### Scenario: No test kind
- **WHEN** a packet is rendered for a `code` item whose checks are `build`
- **THEN** it states task class `code` and that no red is required

### Requirement: Run request matches the red gate
An implementing-stage run request for a `code` attempt whose checks include no test kind SHALL say that a failing test is not required and SHALL name `verifying` as the next state. A `code` attempt whose checks include a test kind SHALL still be asked for a red, unless every such kind already has a red or a valid exception.

#### Scenario: Code item with no test kind
- **WHEN** run reaches the implementing stage for a `code` attempt whose checks are `build`
- **THEN** the request says a failing test is not required
- **AND** its next state is `verifying`

#### Scenario: Code item with a test kind
- **WHEN** run reaches the implementing stage for a `code` attempt whose checks include `unit` and no red or exception is recorded
- **THEN** the request asks for a failing test recorded with `idefactory verify run --red`
- **AND** its next state is `red-confirmed`

### Requirement: Required checks are the profile and item checks together
The required checks for a work item's attempt SHALL be the checks of its `verificationProfile` together with its own `checks`, with duplicates removed. The review handoff and completion SHALL use that same set. A `verificationProfile` that is not defined in `.factory/profiles.json` SHALL refuse the handoff and completion with an error that names it.

#### Scenario: Profile check missing from the item
- **WHEN** a `code` item lists only `unit` and its `verificationProfile` also requires `build`, and the attempt has a passing `unit` record but no `build` record
- **THEN** the attempt is not handed to the reviewer
- **AND** the request names `build` as missing and tells the engineer to record it with `idefactory verify run`

#### Scenario: Completion uses the profile too
- **WHEN** complete receives an accepted attempt whose item lists only `unit` and whose profile also requires `build`, and no passing `build` record exists at the current clean HEAD
- **THEN** completion fails naming `build`
- **AND** the work item remains unfinished

#### Scenario: Review entry is refused while a check is missing
- **WHEN** a transition from `verifying` or `security-checking` to `awaiting-review` is requested and a required check has no passing record at the current clean HEAD
- **THEN** the transition is refused
- **AND** the attempt state is unchanged

#### Scenario: Unknown profile
- **WHEN** an item's `verificationProfile` is not defined in `.factory/profiles.json`
- **THEN** the handoff and completion are refused with an error that names the profile
- **AND** the factory does not fall back to `unit`

#### Scenario: Unit-only profile
- **WHEN** an item's `verificationProfile` is `cli` with checks `["unit"]` and its only check has a passing record at the current clean HEAD
- **THEN** the attempt may be handed to review and completed

### Requirement: Transition evidence keys and shapes
`idefactory attempt transition` SHALL accept only the evidence keys `reviewerId`, `implementerId`, `securityReviewerId`, `verdict`, `notes`, `changedFiles`, and `baseRev`. A transition given any other key, or a supported key whose value has the wrong type, SHALL fail before it changes the attempt and SHALL name the offending key or value. A `verdict` that conflicts with the transition SHALL be refused.

#### Scenario: Nested review shape is refused
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with evidence that nests the notes under a `review` key
- **THEN** the command exits with an error that names `review` and points to the top-level `notes` key
- **AND** the attempt file is byte-for-byte unchanged

#### Scenario: Documented top-level notes are stored
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with `reviewerId`, `verdict` of `REJECT`, and top-level `notes` containing review findings
- **THEN** the attempt moves to `rejected`
- **AND** its stored `evidence.review.notes` equals those findings

#### Scenario: Misspelled key is refused
- **WHEN** a transition is given evidence with a key such as `note` that the command does not support
- **THEN** the command exits with an error that names `note`
- **AND** the attempt is not changed

#### Scenario: Wrong value type is refused
- **WHEN** `notes` is an object, or `changedFiles` is not an array of strings
- **THEN** the command exits with an error that names that key
- **AND** the attempt is not changed

#### Scenario: Conflicting verdict is refused
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with a `verdict` of `ACCEPT`
- **THEN** the transition is refused with an error that names the conflicting verdict
- **AND** the attempt is not changed

#### Scenario: Rejection without a verdict is accepted
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with `reviewerId` and `notes` and no `verdict`
- **THEN** the attempt moves to `rejected` with the notes stored
