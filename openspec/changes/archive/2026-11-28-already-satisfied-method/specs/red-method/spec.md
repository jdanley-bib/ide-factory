## MODIFIED Requirements

### Requirement: Reason classes are a closed set
A proposal's reason class SHALL be one of `docs-or-text`, `configuration`, `behavior-preserving`, `mechanical`, `exploratory`, or `already-satisfied`. A `behavior-preserving` proposal SHALL cite at least one test file that exists in the repository and is tracked by git. Any other class or a missing or untracked test file for `behavior-preserving` SHALL refuse the proposal.

#### Scenario: Unknown class
- **WHEN** a proposal names the reason class `faster`
- **THEN** it is refused naming the allowed classes

#### Scenario: Behavior-preserving without a test
- **WHEN** a `behavior-preserving` proposal cites no test file, or a file that does not exist
- **THEN** it is refused and nothing is recorded

#### Scenario: Class list includes the new class
- **WHEN** a proposal names an unknown reason class
- **THEN** the refusal lists `already-satisfied` among the allowed classes

### Requirement: Guidance explains the choice
The shipped build, test-first, and verify skills, the engineer and reviewer charters, and the review command SHALL say that `red-first` is the default, name the six reason classes, tell the implementer to propose `no-red` only when a failing test cannot specify the change, tell the implementer to propose `already-satisfied` when a red run reports `vacuous-red` for tests that cover behavior that already exists, and tell the reviewer to reject a method whose reason class does not fit the diff.

#### Scenario: Build skill
- **WHEN** the factory-build skill is read
- **THEN** it names `idefactory method propose` and the six reason classes
- **AND** it states that an explicit task class is not overridden by the judgment-based classes

#### Scenario: Vacuous red guidance
- **WHEN** the factory-build or factory-tdd skill is read
- **THEN** it says a `vacuous-red` result is answered with an `already-satisfied` proposal, not by asking a human

## ADDED Requirements

### Requirement: Already-satisfied needs observed passes
An `already-satisfied` proposal SHALL be accepted only when each covered kind has, on the attempt, at least one `vacuous-red` failure entry recorded by a CLI red run whose command digest equals the digest of the check's current registered command. The method record SHALL store, per kind, the latest such entry's log digest, command digest, source revision, and time. The proposal SHALL NOT accept an observed pass supplied by the caller.

#### Scenario: Observed pass present
- **WHEN** a `unit` red run exited zero on the attempt and a proposal covers `unit` with reason class `already-satisfied`
- **THEN** the method record holds the `unit` log digest, command digest, source revision, and time

#### Scenario: No observed pass
- **WHEN** a proposal covers `unit` with `already-satisfied` and the attempt has no `vacuous-red` entry for `unit`
- **THEN** it is refused naming `unit` and nothing is recorded

#### Scenario: Registered command changed
- **WHEN** the check registered for `unit` changed after the vacuous run
- **THEN** the proposal is refused because the recorded command digest no longer matches

#### Scenario: Partly covered
- **WHEN** a proposal covers `unit` and `integration` and only `unit` has an observed pass
- **THEN** it is refused naming `integration`

### Requirement: Already-satisfied allows only test changes
An `already-satisfied` proposal SHALL cite at least one `--test-path`, each an existing file or directory that need not be tracked. Every path changed since the attempt's start revision, excluding factory run state, SHALL equal a cited path or lie under a cited directory. Otherwise the proposal SHALL be refused naming up to ten offending paths.

#### Scenario: Only tests changed
- **WHEN** the attempt added `test/new.test.mjs` and the proposal cites it
- **THEN** the proposal is accepted

#### Scenario: Production file changed
- **WHEN** the attempt also modified `src/lib/x.mjs`
- **THEN** the proposal is refused naming `src/lib/x.mjs`

#### Scenario: No test path
- **WHEN** the proposal cites no `--test-path`
- **THEN** it is refused and nothing is recorded

### Requirement: Changed paths come from git
The changed paths for an `already-satisfied` check SHALL be the union of tracked changes since the start revision, deletions, and new untracked files that git does not ignore. The method record SHALL store the cited paths and up to 50 changed paths with the total count.

#### Scenario: Untracked file counts
- **WHEN** the attempt created an untracked production file outside the cited paths
- **THEN** the proposal is refused naming that file

#### Scenario: Deleted file counts
- **WHEN** the attempt deleted a tracked file outside the cited paths
- **THEN** the proposal is refused naming that file

#### Scenario: Record is bounded
- **WHEN** 60 test files changed under a cited directory
- **THEN** the record stores 50 paths and the total count of 60

### Requirement: Attempts record their start revision
Starting an attempt SHALL record `startRevision` as the current git commit when the project is a git repository with a commit, and null otherwise. An `already-satisfied` proposal on an attempt whose `startRevision` is null SHALL be refused with a message that says the attempt has no start revision.

#### Scenario: Git project
- **WHEN** an attempt starts in a git repository with a commit
- **THEN** the attempt records that commit as `startRevision`

#### Scenario: No git history
- **WHEN** an attempt starts where git has no commit
- **THEN** `startRevision` is null
- **AND** an `already-satisfied` proposal is refused naming the missing start revision

### Requirement: Already-satisfied is rechecked at acceptance
Moving an attempt with an `already-satisfied` method to `accepted`, and completing it, SHALL recompute the changed paths since `startRevision` and SHALL refuse when any path lies outside the cited test paths and factory run state, naming those paths.

#### Scenario: Production edit after the proposal
- **WHEN** a production file is changed after an `already-satisfied` proposal and the attempt is moved to `accepted`
- **THEN** the transition is refused naming the file

#### Scenario: Unchanged diff
- **WHEN** the changed paths still lie within the cited tests
- **THEN** the acceptance check passes

### Requirement: Explicit task class does not block already-satisfied
An explicit `factory.taskType` SHALL NOT by itself refuse an `already-satisfied` proposal. Every other refusal SHALL still apply to it: a stored failing red or exception for a covered kind, a covered kind the item does not require, a lightweight item, and an earlier rejected `no-red` method for the item.

#### Scenario: Explicit code class
- **WHEN** a work item states `factory.taskType: code` and the attempt has an observed pass and a test-only diff
- **THEN** an `already-satisfied` proposal is accepted

#### Scenario: Earlier rejection still blocks
- **WHEN** an earlier attempt's `no-red` method was rejected in review
- **THEN** an `already-satisfied` proposal for that item is refused

### Requirement: Already-satisfied is visible to the reviewer
The reviewer packet, status, and the pull request verdict comment SHALL, for an `already-satisfied` method, show the observed passes, the cited test paths, the diff check result, and an instruction to reject the method if the cited tests do not cover the task's acceptance criteria. They SHALL NOT say a red ran for a covered kind.

#### Scenario: Reviewer packet
- **WHEN** a reviewer packet is rendered for an `already-satisfied` attempt
- **THEN** it shows the per-kind log digests, the cited paths, and the changed-path count
- **AND** it says the reviewer must confirm the tests cover the acceptance criteria
