## MODIFIED Requirements

### Requirement: Approval record
`idefactory approve` SHALL write a scoped approval file under `.factory/approvals/` and an entry in `.factory/decisions.md`, and SHALL NOT publish, deploy, or spend. The file SHALL contain the note plus the change, task, source revision, action, approver, issuance, expiry, and policy version. For an external-effect action it SHALL also contain the target; a standing authorization replaces task and revision with the standing marker and target. When any scope field is missing, the command SHALL write no approval file and SHALL NOT append `decisions.md`.

#### Scenario: Approve
- **WHEN** approve runs with an id, a note, and every scope field
- **THEN** an approval file containing the note exists and `decisions.md` contains the id

#### Scenario: Incomplete approval
- **WHEN** approve runs with an id and a note and omits a scope field
- **THEN** no approval file is written
- **AND** `decisions.md` gains no entry for that id

#### Scenario: Deploy approval carries its target
- **WHEN** approve runs for `deploy` with a target
- **THEN** the approval file contains the target

#### Scenario: Deploy without a target
- **WHEN** approve runs for `deploy` without a target
- **THEN** no approval file is written

## ADDED Requirements

### Requirement: Action lists agree
The governance rule text, the README gates section, the governance skill, command help, and the approve error message SHALL each list exactly the actions in the action table, and a test SHALL fail when any of them differs.

#### Scenario: A new action is added to the table only
- **WHEN** an action is added to the table and one text is not updated
- **THEN** the consistency test fails naming that text

### Requirement: Approve help lists every action
The `idefactory approve` help SHALL list every action in the table with one line stating its binding, and SHALL state that `--target` is required for external-effect actions and that `--standing` records a standing authorization at policy version 2.

#### Scenario: Approve help
- **WHEN** the user runs `idefactory help approve`
- **THEN** each action in the table appears with its binding
- **AND** `--target` and `--standing` are explained
