## Purpose
Reports why factory work is stopped in one machine-readable shape: the unmet invariant, who can unblock it, which recovery commands exist, and whether retrying can help.

## ADDED Requirements

### Requirement: Blocked-state report
When a factory command stops without completing its step, it SHALL be able to report a blocked state containing the change, task, attempt and its state when they exist, the stop reason when one applies, an unmet invariant with a closed `code` and a message, the responsible actor, the recovery options, and a retry classification. A stop with no mapping SHALL use the code `unclassified`.

#### Scenario: Human gate
- **WHEN** run stops with `human-gate`
- **THEN** the report names the unmet invariant `approval-missing`
- **AND** the actor is the human

#### Scenario: Unmapped failure
- **WHEN** a command fails with an error that has no mapping
- **THEN** the report has code `unclassified` and the original message
- **AND** it states that no recovery is known

### Requirement: Responsible actor
The report SHALL name one actor from `human`, `independent-agent`, `implementing-agent`, or `tooling`. The actor SHALL be `human` whenever the next step needs authority only a human holds, and `independent-agent` whenever it needs an identity other than the implementer's.

#### Scenario: Reviewer lockout
- **WHEN** the stop is a reviewer lockout
- **THEN** the actor is `human`

#### Scenario: Review needed
- **WHEN** the attempt awaits review
- **THEN** the actor is `independent-agent`

### Requirement: Recovery options
Each recovery option SHALL state an id, whether it is supported, the command to run when it is, the actor that may run it, and what it requires. When no supported option exists the report SHALL say there is no supported recovery, SHALL list the unsupported options with `supported: false` and no command, and SHALL name the human as the actor.

#### Scenario: Supported option
- **WHEN** an attempt was rejected and a new attempt can be started
- **THEN** the report lists the command that starts a new attempt as supported

#### Scenario: No supported recovery
- **WHEN** the stop has no command that resolves it
- **THEN** the report says there is no supported recovery
- **AND** every option has `supported: false` and no command
- **AND** the actor is `human`

### Requirement: Retry classification
The report SHALL classify retrying the same command as `safe` when the condition can clear without a change, `only-after-change` when it repeats the same stop unless something recorded changes, or `never` when a repeat is known to be refused.

#### Scenario: Infrastructure failure
- **WHEN** the stop is `infrastructure-failure`
- **THEN** the retry class is `safe`

#### Scenario: Vacuous red
- **WHEN** the stop is `vacuous-red`
- **THEN** the retry class is `only-after-change`

#### Scenario: Retry cap
- **WHEN** the stop is `retry-cap`
- **THEN** the retry class is `never`

### Requirement: Machine-readable output
`run`, `next`, `complete`, `attempt transition`, and `sync-tasks` SHALL accept `--json` and print one JSON object that contains the report when the command stopped without completing its step. Without `--json`, text output, stop reasons, and exit codes SHALL be unchanged. With `--json`, exit codes SHALL be unchanged.

#### Scenario: Run with json
- **WHEN** run stops with `human-gate` and `--json` is passed
- **THEN** stdout is one JSON object with the report and the stop reason
- **AND** the exit code equals the one without `--json`

#### Scenario: Text unchanged
- **WHEN** run stops with `human-gate` and `--json` is not passed
- **THEN** the output equals the previous text output

#### Scenario: Failing command with json
- **WHEN** complete fails because a requirement is unmet and `--json` is passed
- **THEN** stdout is one JSON object with the report
- **AND** the exit code is non-zero

### Requirement: Durable blocked record
When a blocked state is reported for a work item, the factory SHALL write the latest report to `.factory/blocked/<change>--<task>.json` and append a control event. A later run that finds the condition gone SHALL mark the record resolved with what resolved it. The record SHALL NOT decide whether work may proceed; live state SHALL.

#### Scenario: Record written
- **WHEN** a stop is reported for a work item
- **THEN** the record exists with the report and a time
- **AND** a control event names the invariant code, the actor, the retry class, and whether a supported resolving option for an agent existed

#### Scenario: Resolved by approval
- **WHEN** a human approval is recorded and the next run proceeds
- **THEN** the record is marked resolved and names the approval
- **AND** a control event records the resolution and its kind

#### Scenario: Stale record
- **WHEN** a record is open but live state shows no block
- **THEN** run proceeds and marks the record resolved

### Requirement: Agent guidance
Every shipped factory skill that runs or builds work SHALL tell the agent to branch on the report: act on a supported option whose actor is an agent, ask the human only when the actor is `human` and the option needs authority, stop when the retry class is `never`, and not ask for any decision listed under standing decisions.

#### Scenario: Skill reads the report
- **WHEN** a shipped factory-run skill is read
- **THEN** it names the actor, the supported flag, and the retry classes

#### Scenario: Skill does not re-ask
- **WHEN** a shipped factory-build skill is read
- **THEN** it says not to ask for a decision listed under standing decisions
