## ADDED Requirements

### Requirement: Vacuous red offers its matching method
The `vacuous-red` blocked report SHALL list a method proposal with reason class `already-satisfied` as its first recovery option, with the flags `--test-path` and `--kind`, available when the attempt is in a state that accepts proposals and holds a vacuous entry. The report's `propose-method` option SHALL state the attempt states the command accepts, matching the command's own refusal rules.

#### Scenario: Option order
- **WHEN** a `vacuous-red` report is built for an attempt in `implementing` with a vacuous entry
- **THEN** its first option is the `already-satisfied` proposal with the exact command and flags

#### Scenario: State text matches the command
- **WHEN** the report lists the `propose-method` option
- **THEN** its availability text names `planned`, `assigned`, and `implementing`
