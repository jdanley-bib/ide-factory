## MODIFIED Requirements

### Requirement: Packet states the red requirement
The work packet SHALL state the work item's task class, every required check with its source (profile or item), and the check kinds that need red evidence, or that none do. The kinds needing red SHALL be derived from the full required set. A `lightweight` item and a `code` item with no test kind in that set SHALL show none.

#### Scenario: Code item with a test check
- **WHEN** a packet is rendered for a `code` item whose checks are `unit` and `build`
- **THEN** it states task class `code` and red required for `unit`

#### Scenario: Lightweight item
- **WHEN** a packet is rendered for a `lightweight` item whose checks include `unit`
- **THEN** it states task class `lightweight` and that no red is required

#### Scenario: No test kind
- **WHEN** a packet is rendered for a `code` item whose checks are `build` and whose profile adds no test kind
- **THEN** it states task class `code` and that no red is required

#### Scenario: Profile adds a test kind
- **WHEN** a packet is rendered for a `code` item that lists only `unit` and whose profile also requires `contract`
- **THEN** it lists `unit` as an item check and `contract` as a profile check
- **AND** it states red required for `unit` and `contract`

## ADDED Requirements

### Requirement: One resolved requirement set
Each work item SHALL have one resolved requirement set made of its required checks with their sources, the kinds that need red evidence, the human decisions it needs, and its dependencies. The packet, reviewer packet, status, run request, the gate into `verifying`, red exceptions, the review handoff, and completion SHALL all use that set.

#### Scenario: Consumers agree
- **WHEN** a profile adds `contract` to an item that lists only `unit`
- **THEN** the packet, the run request, the gate into `verifying`, and completion each require red evidence for `contract`

#### Scenario: Print the set
- **WHEN** the user runs `idefactory requirements <change> <task> --json`
- **THEN** stdout is one JSON document with `schemaVersion` 1
- **AND** it lists each required check with its source, each kind needing red, each human decision, and any problems
- **AND** nothing is written

### Requirement: Requirements are validated before an attempt starts
An attempt SHALL NOT start while its requirement set has a problem. A problem is an undefined verification profile, a required check kind with no registered argv, a human gate that the configured policy cannot satisfy, or a dependency that does not exist. Each problem SHALL name the unmet invariant and the file or setting that fixes it.

#### Scenario: Unmapped required kind
- **WHEN** a profile requires `contract` and the check registry has no `contract` argv
- **AND** a run reaches the point of starting an attempt for that item
- **THEN** no attempt is created
- **AND** the output names `contract` and the registry

#### Scenario: Unsatisfiable human gate
- **WHEN** an item's profile requires a human gate and the configured policy has no way to verify an approver
- **THEN** no attempt is created
- **AND** the output names the gate and the policy setting

#### Scenario: Valid set starts normally
- **WHEN** every required kind is registered and no problem exists
- **THEN** the attempt starts as before

### Requirement: Unmet requirements are reported together
The review handoff and completion SHALL name every unmet required check and every missing red in one message, not only the first.

#### Scenario: Two checks missing
- **WHEN** completion is requested and both `build` and `contract` have no passing record
- **THEN** the failure names both

#### Scenario: Check and red missing
- **WHEN** completion is requested and `unit` passes but `build` has no record and `contract` has no red
- **THEN** the failure names `build` and the missing red for `contract`
