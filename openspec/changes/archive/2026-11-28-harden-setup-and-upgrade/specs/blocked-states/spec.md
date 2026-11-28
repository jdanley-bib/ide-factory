## ADDED Requirements

### Requirement: Setup-incomplete stop
The `setup-incomplete` report SHALL have retry class `only-after-change`, SHALL list recording the setup decision first with authority `human`, and SHALL list `idefactory setup --detect` second with authority `agent`. Its actor SHALL be `human`.

#### Scenario: Option order
- **WHEN** a `setup-incomplete` report is built
- **THEN** its first option is recording the setup decision and its second is `idefactory setup --detect`

#### Scenario: Actor
- **WHEN** the report is printed
- **THEN** the actor is `human`

### Requirement: Text stops name the next step
When `run` or `next` stops with a blocked report, the text output SHALL print a `Next:` line naming the first supported option's command and who may run it: an agent, an identity other than the implementer, or a person. When no option is supported it SHALL say so and name a person. The JSON output SHALL be unchanged.

#### Scenario: Rejected attempt
- **WHEN** run stops with `rejected` and the first supported option starts a new attempt
- **THEN** the text output contains `Next: idefactory attempt start` with the change and task
- **AND** it says an agent may run it

#### Scenario: No supported option
- **WHEN** a stop has no supported option
- **THEN** the text says there is no supported recovery and names a person

#### Scenario: Text and JSON agree
- **WHEN** the same stop is printed in text and JSON
- **THEN** both name the same first option
