## MODIFIED Requirements

### Requirement: Unrelated gates stay in force
An exception SHALL NOT waive a passing attestation at the current clean HEAD, a distinct reviewer, a security stage, a human gate, a lockout, the retry cap, or the `code` classification, and SHALL NOT alter the rejected attempt or its evidence. It SHALL NOT edit a run session file. A closed `vacuous-red` session SHALL reopen on the next run once its stop condition is resolved, and not before.

#### Scenario: Completion still needs clean passing evidence
- **WHEN** an attempt with a valid exception completes with a stale or missing passing attestation
- **THEN** complete fails

#### Scenario: Review is still independent
- **WHEN** the reviewer identifier equals the implementer identifier on an attempt with an exception
- **THEN** completion fails

#### Scenario: Run session stays closed
- **WHEN** the latest run session stopped for `vacuous-red` and a waiver is then recorded
- **THEN** the session file bytes are unchanged until the next run evaluates it
- **AND** the next run reopens the session because the waiver resolves the stop
