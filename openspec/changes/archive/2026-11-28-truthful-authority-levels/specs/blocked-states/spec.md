## MODIFIED Requirements

### Requirement: Responsible actor
The report SHALL name one actor from `human`, `independent-agent`, `implementing-agent`, or `tooling`, derived from the authority level of its first usable option. The actor SHALL be `human` whenever the next step is a human-level gate, and `independent-agent` whenever it needs an identity other than the implementer's. Each option SHALL also carry its authority level and enforcement label.

#### Scenario: Reviewer lockout
- **WHEN** the stop is a reviewer lockout
- **THEN** the actor is `independent-agent`
- **AND** the resolve option's level is `independent`

#### Scenario: Review needed
- **WHEN** the attempt awaits review
- **THEN** the actor is `independent-agent`

#### Scenario: Human gate
- **WHEN** the stop needs approval of a publish action
- **THEN** the actor is `human`
