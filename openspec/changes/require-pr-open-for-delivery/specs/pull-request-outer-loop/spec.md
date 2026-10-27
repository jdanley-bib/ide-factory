# pull-request-outer-loop

## ADDED Requirements

### Requirement: Deliverable change names its pull request
A change SHALL NOT be deliverable unless the `.factory/pull-requests/<change>.json` record written by `idefactory pr open` names that change's open pull request number and URL on the `factory/<change>` branch. Archive SHALL stop without moving the change when that record is missing or incomplete. The stage 1 exit test SHALL fail when a change under test lacks that record.

#### Scenario: Missing record blocks archive
- **WHEN** archive is requested for a change with no pull-request record
- **THEN** the deliverable check fails
- **AND** the change directory stays where it is

#### Scenario: Incomplete record blocks archive
- **WHEN** the record omits the pull request number or URL, or names a branch other than `factory/<change>`
- **THEN** the deliverable check fails
- **AND** the change directory stays where it is

#### Scenario: Exit test fails without the record
- **WHEN** the stage 1 exit test evaluates a change with no pull-request record
- **THEN** the exit test result for that change is fail

#### Scenario: Named pull request passes the record check
- **WHEN** the record from `pr open` includes a pull request number, a URL, and branch `factory/<change>`
- **THEN** the deliverable check passes
