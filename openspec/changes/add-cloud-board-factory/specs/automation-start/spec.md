# Spec Delta

## Purpose

Lets a Cursor Automation begin or resume a cloud factory run only when a human moved the change's story to the ready state.

## ADDED Requirements

### Requirement: Claim validates the story
`idefactory board claim <change> --work-item <id>` (with `--snapshot <file>` holding the story read through the MCP when the transport is `mcp`) SHALL fail without a board write when `openspec/changes/<change>/` does not exist, when the story's change field names another change, or when the story lacks the factory tag.

#### Scenario: Change field mismatch
- **WHEN** the story's change field names a different change
- **THEN** claim exits non-zero
- **AND** no comment or state change is sent

### Requirement: Claim decision
Claim SHALL decide `not-ready` when the story is not in the ready state, `duplicate` when the revision was already claimed, `halted` when `HALT` exists, `resume` when the recorded state is `waiting` or `blocked`, `skip` when the recorded state is `in-progress`, `in-review`, or `ready-for-human-review`, and `start` otherwise. `not-ready` and `duplicate` SHALL NOT write to the board.

#### Scenario: First claim starts
- **WHEN** a published story in the ready state is claimed for the first time
- **THEN** the decision is `start`
- **AND** the story moves to the in-progress state with the branch `factory/<change>` and the run URL

#### Scenario: Duplicate revision
- **WHEN** the same revision is claimed twice
- **THEN** the second decision is `duplicate`
- **AND** the board client receives no update for it

#### Scenario: Resume after a human stop
- **WHEN** the recorded state is `waiting` and the story is back in the ready state with a new revision
- **THEN** the decision is `resume`
- **AND** the printed next step includes `--new-run`

#### Scenario: Running change is skipped
- **WHEN** the recorded state is `in-progress` and the story is in the ready state with a new revision
- **THEN** the decision is `skip`
- **AND** the story returns to the in-progress state with a comment

#### Scenario: HALT stops the claim
- **WHEN** `HALT` exists
- **THEN** the decision is `halted` and the story moves to the blocked state

### Requirement: Only resume adds a new run
The printed next step SHALL include `--new-run` only for `resume`. `start` SHALL print `idefactory run --change <change> --until human-gate`. `skip`, `duplicate`, `not-ready`, and `halted` SHALL print no run command.

#### Scenario: Start prints a bounded run
- **WHEN** the decision is `start`
- **THEN** the next step is `idefactory run --change <change> --until human-gate` without `--new-run`

### Requirement: Claim write is revision-guarded
With the `mcp` transport, the claim plan's state-changing update SHALL begin with a `Test` of `/rev` against the revision in the snapshot.

#### Scenario: Claim carries the revision test
- **WHEN** a claim decides `start` from a snapshot at revision 7
- **THEN** the first update operation in the plan tests `/rev` equal to 7 before it changes the state

### Requirement: Claim event
Every claim that writes to the board SHALL append one `board-claim` event with the change, work item id, revision, and decision to the control event log.

#### Scenario: Start event
- **WHEN** a claim decides `start`
- **THEN** the event log contains a `board-claim` event with that decision

### Requirement: Reference bridge filters events
The reference bridge SHALL forward to the Automation webhook only a `workitem.updated` event whose new state is the ready state, whose revision carries the factory tag, and whose change field is a valid change name, and only when the shared secret matches. It SHALL send the Automation token as a bearer header. `idefactory init` SHALL NOT install the bridge.

#### Scenario: Comment-only edit is dropped
- **WHEN** the bridge receives a `workitem.updated` event with no state change
- **THEN** it does not call the webhook

#### Scenario: Ready transition is forwarded
- **WHEN** the bridge receives a transition into the ready state with the tag and change field and the right secret
- **THEN** it posts the work item id, revision, and change with a bearer header
