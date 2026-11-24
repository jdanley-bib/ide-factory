# Spec Delta

## ADDED Requirements

### Requirement: Transition evidence keys and shapes
`idefactory attempt transition` SHALL accept only the evidence keys `reviewerId`, `implementerId`, `securityReviewerId`, `verdict`, `notes`, `changedFiles`, and `baseRev`. A transition given any other key, or a supported key whose value has the wrong type, SHALL fail before it changes the attempt and SHALL name the offending key or value. A `verdict` that conflicts with the transition SHALL be refused.

#### Scenario: Nested review shape is refused
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with evidence that nests the notes under a `review` key
- **THEN** the command exits with an error that names `review` and points to the top-level `notes` key
- **AND** the attempt file is byte-for-byte unchanged

#### Scenario: Documented top-level notes are stored
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with `reviewerId`, `verdict` of `REJECT`, and top-level `notes` containing review findings
- **THEN** the attempt moves to `rejected`
- **AND** its stored `evidence.review.notes` equals those findings

#### Scenario: Misspelled key is refused
- **WHEN** a transition is given evidence with a key such as `note` that the command does not support
- **THEN** the command exits with an error that names `note`
- **AND** the attempt is not changed

#### Scenario: Wrong value type is refused
- **WHEN** `notes` is an object, or `changedFiles` is not an array of strings
- **THEN** the command exits with an error that names that key
- **AND** the attempt is not changed

#### Scenario: Conflicting verdict is refused
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with a `verdict` of `ACCEPT`
- **THEN** the transition is refused with an error that names the conflicting verdict
- **AND** the attempt is not changed

#### Scenario: Rejection without a verdict is accepted
- **WHEN** a reviewer rejects an attempt in `awaiting-review` with `reviewerId` and `notes` and no `verdict`
- **THEN** the attempt moves to `rejected` with the notes stored
