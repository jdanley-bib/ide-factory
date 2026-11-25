## ADDED Requirements

### Requirement: Supplied identities are validated
`idefactory attempt transition` SHALL refuse a supplied `implementerId`, `reviewerId`, or `securityReviewerId` that is empty or outside the shared identity format, before it changes the attempt. The error SHALL name the evidence key, the value, and the allowed characters. Identities already stored on an attempt SHALL NOT be re-validated.

#### Scenario: Dotted implementer id
- **WHEN** a transition to `implementing` supplies `implementerId` `engineer-5.1-abc123`
- **THEN** the attempt moves to `implementing` with that implementer id stored

#### Scenario: Invalid reviewer id
- **WHEN** a reviewer transition supplies `reviewerId` `"bad id"`
- **THEN** the command exits with an error naming `reviewerId` and the allowed characters
- **AND** the attempt file is byte-for-byte unchanged

#### Scenario: Stored identity is not re-checked
- **WHEN** an attempt already stores an `implementerId` outside the format and a later transition supplies only a valid `reviewerId`
- **THEN** the transition succeeds and the stored implementer id is unchanged
