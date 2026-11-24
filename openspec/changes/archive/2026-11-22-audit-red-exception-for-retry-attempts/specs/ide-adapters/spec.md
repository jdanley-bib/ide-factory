# Spec Delta

## MODIFIED Requirements

### Requirement: Verify skills name the verification command
The installed factory-build, factory-tdd, and factory-verify skills SHALL name `idefactory verify run`, including `--red` for a failing test on a `code` item. They SHALL tell the session to stop when the result is `vacuous-red` or `infrastructure-failure`. They SHALL NOT instruct the session to send a pass boolean, a red object, or a verification object on an attempt transition. They SHALL name `idefactory red reuse` and `idefactory red waive` as human-authorized options after a stop, SHALL tell the session to warn the human to prefer reuse and to wait until the system is stuck before a waiver, and SHALL tell the session to run waive with `--acknowledge-not-stuck` only after the human acknowledges that warning.

#### Scenario: Verify skill does not invent a payload
- **WHEN** the installed factory-verify skill is read
- **THEN** it names `idefactory verify run`
- **AND** it does not instruct the session to attach a pass boolean to an attempt transition

#### Scenario: Build skill stops on vacuous red
- **WHEN** the installed factory-build skill is read
- **THEN** it tells the session to stop on `vacuous-red` and on `infrastructure-failure`

#### Scenario: Build skill names the exceptions
- **WHEN** the installed factory-build skill is read
- **THEN** it names `idefactory red reuse` and `idefactory red waive`
- **AND** it tells the session to ask the human before running either

#### Scenario: Skill warns before an unstuck waiver
- **WHEN** the installed factory-build skill is read
- **THEN** it tells the session to warn that a waiver before the system is stuck is discouraged
- **AND** it tells the session to pass `--acknowledge-not-stuck` only after the human acknowledges the warning
