## ADDED Requirements

### Requirement: Stop events carry codes only
Events that record a reported blocked state or its resolution SHALL carry the invariant code, the actor, the retry class, whether a supported resolving option for an agent existed, and the resolution kind. They SHALL NOT carry error text, approval notes, exception reasons, environment values, or check output.

#### Scenario: Blocked event content
- **WHEN** a stop is reported for a work item
- **THEN** the appended event names the invariant code, actor, retry class, and agent-option flag
- **AND** the event omits error text

#### Scenario: Resolution event content
- **WHEN** a later run resolves a recorded stop
- **THEN** the appended event names the resolution kind and the related ids
- **AND** the event omits notes and reasons
