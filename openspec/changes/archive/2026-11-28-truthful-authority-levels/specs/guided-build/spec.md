## MODIFIED Requirements

### Requirement: Baseline assertion failure
When a baseline command exits non-zero after tests ran, run SHALL stop with reason `baseline` and SHALL NOT store a red record. `--accept-baseline` together with `--reason "<text>"` for that HEAD SHALL record the acceptance, its reason, the HEAD, and the time, and SHALL allow the implement request. `--accept-baseline` without a reason SHALL be refused. A later run whose baseline commands exit zero SHALL continue without `--accept-baseline`.

#### Scenario: Accepted baseline
- **WHEN** the baseline exits non-zero after tests ran and `--accept-baseline` with a reason is passed for that HEAD
- **THEN** the run may emit the implement request
- **AND** no red record is stored for the baseline
- **AND** the acceptance, reason, HEAD, and time are recorded

#### Scenario: Missing reason
- **WHEN** `--accept-baseline` is passed without `--reason`
- **THEN** the run is refused naming `--reason` and no acceptance is recorded

#### Scenario: Green baseline continues
- **WHEN** a later run's baseline commands exit zero
- **THEN** the run continues without `--accept-baseline`
