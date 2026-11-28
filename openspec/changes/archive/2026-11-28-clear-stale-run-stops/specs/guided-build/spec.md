## MODIFIED Requirements

### Requirement: Retry cap
The fourth identical infrastructure failure, the fourth `vacuous-red`, or the fourth review rejection of the same attempt SHALL be refused. Run SHALL then stop with reason `retry-cap` and SHALL emit no further request for that attempt until `--new-run` opens a new session within the new-run cap.

#### Scenario: Fourth identical infrastructure failure
- **WHEN** the same attempt has already recorded three identical infrastructure failures and a fourth is attempted
- **THEN** the fourth result is not stored as red
- **AND** the stop reason is `retry-cap`
- **AND** no orchestration request is printed
