## ADDED Requirements

### Requirement: Packets carry standing decisions
The work packet and the run request for a work item SHALL include a standing-decisions section listing each decision still valid for that item: approvals and standing authorizations with their action, expiry, and approver; red exceptions with kind and reason; and reconciliation decisions. A decision that has expired, been revoked, or no longer matches the current revision SHALL NOT be listed. The section SHALL be omitted when there are none. Listing a decision SHALL NOT authorize anything.

#### Scenario: Valid approval listed
- **WHEN** a valid approval exists for the item and a packet is printed
- **THEN** the packet lists its action, expiry, and approver

#### Scenario: Expired approval omitted
- **WHEN** the only approval for the item has expired
- **THEN** the packet has no standing-decisions section

#### Scenario: Handoff keeps the decision
- **WHEN** the implementer packet and the reviewer packet are printed for the same item
- **THEN** both list the same valid decisions

#### Scenario: Listing is not authority
- **WHEN** a decision is listed in a packet
- **THEN** authorization still depends on the approval check
