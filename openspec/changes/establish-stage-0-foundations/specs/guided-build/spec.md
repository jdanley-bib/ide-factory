# guided-build Specification

## MODIFIED Requirements

### Requirement: Separate reviewer
Completion SHALL require recorded implementer and reviewer identifiers and SHALL refuse when the two identifiers are equal. When governance policy version is 2, the reviewer identifier SHALL be a verified principal subject. The implementer identifier SHALL remain a local agent id.

#### Scenario: Same reviewer and implementer
- **WHEN** complete receives an accepted attempt whose reviewer identifier equals its implementer identifier
- **THEN** completion fails and the work item remains unfinished

#### Scenario: Policy version 2 reviewer is not verified
- **WHEN** policy version is 2 and the reviewer identifier is not a verified principal subject
- **THEN** completion fails and the work item remains unfinished
