# ide-adapters

## ADDED Requirements

### Requirement: Factory pull-request guidance
Installed factory guidance SHALL name `idefactory pr open`, `idefactory pr comment`, and `idefactory pr capture` as the only legal pull-request steps. It SHALL say the agent never merges. It SHALL say `sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks for that action.

#### Scenario: Rule names the legal pull-request steps
- **WHEN** the installed Cursor factory rule is read
- **THEN** it names `pr open`, `pr comment`, and `pr capture` as the only legal pull-request steps
- **AND** it says the agent never merges

#### Scenario: Run guidance waits for the human
- **WHEN** the installed factory-run skill is read
- **THEN** it names `sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync as actions that wait for the human
- **AND** it does not name another pull-request command as legal
