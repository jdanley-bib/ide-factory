# factory-read-model Specification

## Purpose
Gives operators one read-only JSON view of factory status and metrics derived from records the factory already stores.

## ADDED Requirements

### Requirement: JSON status is read-only
`idefactory status --json` SHALL print one JSON object to stdout and SHALL NOT create or modify any file.

#### Scenario: Status document
- **WHEN** status runs with `--json` on an installed factory
- **THEN** stdout is a JSON object whose `schemaVersion` is 1
- **AND** no file under `.factory/` is created or modified

#### Scenario: Text status remains
- **WHEN** status runs without `--json`
- **THEN** stdout is the existing text report

### Requirement: Status metrics
The JSON object SHALL include `halt`, `activeChange`, work counts for todo, in progress, done, and blocked, and metrics for attempt counts by state, open runs, stop-reason counts, and approval counts by schema version. It SHALL NOT include approval notes, check logs, environment values, or secrets.

#### Scenario: Counts match stored records
- **WHEN** the factory has one todo work item and one stopped run
- **THEN** the JSON work count for todo is 1
- **AND** that stop reason is present in the metrics

#### Scenario: Secrets stay out of status
- **WHEN** an approval note or check log contains a secret-like string
- **THEN** the JSON status document does not contain that string
