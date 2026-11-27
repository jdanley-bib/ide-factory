# autonomy-acceptance Specification

## Purpose
Defines the repeatable local proof that ordinary work proceeds without routine human intervention, and the record required before a cloud integration is called proven.

## Requirements

### Requirement: Local end-to-end autonomy run
The repository SHALL include an automated end-to-end run of a multi-task change driven by a scripted deterministic agent. The run SHALL cover planning handoffs, implementation, checks, independent review, and completion. It SHALL assert the autonomy report for the run, and SHALL fail when an ordinary task needs a `failure` or `redundant` intervention.

#### Scenario: Ordinary change completes
- **WHEN** the run executes a three-task change with its authority configured
- **THEN** every task is completed
- **AND** the report is `routineClean`

#### Scenario: Recoverable failure
- **WHEN** a check fails once for an infrastructure reason and then passes
- **THEN** the run retries within its failure budget and continues
- **AND** the report counts one autonomous recovery and no intervention

#### Scenario: Unrecoverable loop
- **WHEN** a task's check always fails
- **THEN** the run stops within the configured bound with a blocked-state report
- **AND** the number of agent steps taken does not exceed the bound

#### Scenario: Decisions survive handoffs
- **WHEN** a human decision was recorded before the run
- **THEN** every role's packet lists it
- **AND** the report shows no new intervention for it

#### Scenario: Out-of-authority step pauses
- **WHEN** a task needs a `deploy` action with no authorization
- **THEN** the run pauses with a `policy-decision` intervention
- **AND** the effect is not performed
- **AND** after an authorization is recorded the run resumes without another intervention

### Requirement: Cloud acceptance record
A cloud acceptance record SHALL name the provider and transport, the trigger, the run or automation identifier and link, the repository commit, the pull request, the time, and the pull request reviewer. It SHALL give an outcome of `passed`, `failed`, `not-run`, or `not-available` for each required behavior.

#### Scenario: New record
- **WHEN** a record is created for a provider
- **THEN** every required behavior is `not-run`

#### Scenario: Provider without a transport
- **WHEN** a provider has no supported transport in the repository
- **THEN** its record is `not-available` and is not counted as passed

### Requirement: Required cloud behaviors
The required behaviors SHALL be an unattended run to a review-ready pull request, a recovered transient failure, a rejected review addressed within delegated scope, bounded retry and loop handling, duplicate-claim protection, durable decisions across handoffs, and a clean stop for an unauthorized external effect.

#### Scenario: Record lists every behavior
- **WHEN** a record is read
- **THEN** it has an outcome for each of the seven behaviors

#### Scenario: Missing behavior
- **WHEN** a record omits a required behavior
- **THEN** the format check fails naming it

### Requirement: Mocked evidence is not a pass
A behavior SHALL be recorded as `passed` only with identifiers from a real run through a real trigger and provider. A local fixture, mock, or recorded replay SHALL NOT satisfy it, and a record that cites one for `passed` SHALL fail the format check.

#### Scenario: Fixture identifier
- **WHEN** a record marks a behavior `passed` with a local fixture identifier
- **THEN** the format check fails naming the behavior

### Requirement: No self-approval of the pull request
A cloud acceptance record SHALL name a pull request reviewer who is not the agent identity that produced the pull request, and a record naming the same identity SHALL fail the format check.

#### Scenario: Same identity
- **WHEN** the reviewer equals the producing agent identity
- **THEN** the format check fails

### Requirement: Each provider is judged separately
The record for each provider and transport SHALL be kept separately, and acceptance for one SHALL NOT count for another.

#### Scenario: One provider passes
- **WHEN** the Azure DevOps record is `passed` and the GitHub record is `not-available`
- **THEN** the acceptance state reports each separately
