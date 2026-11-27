## ADDED Requirements

### Requirement: Session stop events carry codes only
A cleared condition stop SHALL append one `run.stop-cleared` event naming the run id, the cleared stop reason, and a resolution code. An accepted `--new-run` SHALL append one `run.new-run` event naming the new run id and the previous stop reason. Neither event SHALL carry error text, notes, or check output.

#### Scenario: Stop cleared event
- **WHEN** a run reopens a session whose `vacuous-red` stop was resolved by a method proposal
- **THEN** the log gains one `run.stop-cleared` event with resolution `method`
- **AND** the event omits any text field

#### Scenario: New run event
- **WHEN** `--new-run` opens a session after `max-agent-steps`
- **THEN** the log gains one `run.new-run` event naming the previous stop reason
