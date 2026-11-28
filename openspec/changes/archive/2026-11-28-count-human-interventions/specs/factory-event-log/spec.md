## ADDED Requirements

### Requirement: Every stop is recorded
A run session closed with a stop reason, and a command failing with a blocked-state error, SHALL append one `blocked.recorded` event through the same deduplicating path regardless of which command produced it. A stop already recorded for the same invariant, attempt, and attempt state SHALL NOT be recorded again.

#### Scenario: Vacuous red from verify
- **WHEN** `verify run --red` closes the session with `vacuous-red`
- **THEN** the log gains one `blocked.recorded` event with invariant `vacuous-red`

#### Scenario: Same stop through two paths
- **WHEN** the same stop is reached by `verify run --red` and then by `run`
- **THEN** the log holds one event for it

### Requirement: Halt resume and command errors are recorded
`idefactory resume` SHALL append one `halt.resumed` event with the time. A command that fails with an error that has no blocked-state mapping SHALL append one `command.error` event naming the command and the code `unclassified`. Neither event SHALL carry error text, notes, or paths.

#### Scenario: Resume event
- **WHEN** `idefactory resume` removes HALT
- **THEN** the log gains one `halt.resumed` event

#### Scenario: Unmapped failure
- **WHEN** a command fails with an unmapped error
- **THEN** the log gains one `command.error` event with code `unclassified`
- **AND** the event omits the error text
