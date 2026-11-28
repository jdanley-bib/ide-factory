## ADDED Requirements

### Requirement: Advertised options are accepted
A recovery option that names an attempt state SHALL be accepted by its command in every state it names, and a test SHALL drive each such option in an allowed and a disallowed state to check it. An option SHALL NOT name a state its command refuses for a state reason.

#### Scenario: Method proposal states
- **WHEN** a `vacuous-red` report lists the method option for an attempt in `implementing`
- **THEN** running the listed command does not refuse for the attempt state

#### Scenario: Disallowed state
- **WHEN** the attempt is in `verifying`
- **THEN** the report does not list the method option and the command refuses for the state

#### Scenario: Table change without a command change
- **WHEN** an option names a state its command refuses
- **THEN** the conformance test fails naming the option and the state
