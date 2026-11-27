## ADDED Requirements

### Requirement: Autonomy report help
`idefactory help autonomy report` SHALL describe `decisions`, `unrecordedStops`, `measurementComplete`, `eventsRead`, `noStopEvents`, the deprecated `noEvents` alias, and that `routineClean` needs a complete measurement. The global usage text SHALL NOT change.

#### Scenario: Help names the fields
- **WHEN** the user runs `idefactory help autonomy report`
- **THEN** the output names `unrecordedStops`, `measurementComplete`, and `noStopEvents`

#### Scenario: Global text unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
