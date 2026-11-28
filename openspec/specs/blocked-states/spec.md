# blocked-states Specification

## Purpose
Reports why factory work is stopped in one machine-readable shape: the unmet invariant, who can unblock it, which recovery commands exist, and whether retrying can help.

## Requirements

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
The report SHALL name one actor from `human`, `independent-agent`, `implementing-agent`, or `tooling`, derived from the authority level of its first usable option. The actor SHALL be `human` whenever the next step is a human-level gate, and `independent-agent` whenever it needs an identity other than the implementer's. Each option SHALL also carry its authority level and enforcement label.

#### Scenario: Reviewer lockout
- **WHEN** the stop is a reviewer lockout
- **THEN** the actor is `independent-agent`
- **AND** the resolve option's level is `independent`

#### Scenario: Review needed
- **WHEN** the attempt awaits review
- **THEN** the actor is `independent-agent`

#### Scenario: Human gate
- **WHEN** the stop needs approval of a publish action
- **THEN** the actor is `human`

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

### Requirement: Red-run stops are classified
A `verify run --red` that stops for `vacuous-red` or `retry-cap` SHALL fail with a blocked-state error carrying the matching invariant and the same message text as before, so that its stop is reportable and recordable.

#### Scenario: Vacuous red is a blocked error
- **WHEN** a red run exits zero
- **THEN** the command fails with invariant `vacuous-red`
- **AND** the message text is unchanged

#### Scenario: Retry cap is a blocked error
- **WHEN** the fourth identical red failure occurs
- **THEN** the command fails with invariant `retry-cap` and the message begins with `retry-cap:`

### Requirement: Vacuous red offers its matching method
The `vacuous-red` blocked report SHALL list a method proposal with reason class `already-satisfied` as its first recovery option, with the flags `--test-path` and `--kind`, available when the attempt is in a state that accepts proposals and holds a vacuous entry. The report's `propose-method` option SHALL state the attempt states the command accepts, matching the command's own refusal rules.

#### Scenario: Option order
- **WHEN** a `vacuous-red` report is built for an attempt in `implementing` with a vacuous entry
- **THEN** its first option is the `already-satisfied` proposal with the exact command and flags

#### Scenario: State text matches the command
- **WHEN** the report lists the `propose-method` option
- **THEN** its availability text names `planned`, `assigned`, and `implementing`

### Requirement: Advertised options are accepted
A recovery option that names an attempt state SHALL be accepted by its command in every state it names, and a test SHALL drive each such option in an allowed and a disallowed state to check it. An option SHALL NOT name a state its command refuses for a state reason.

#### Scenario: Method proposal states
- **WHEN** a `vacuous-red` report lists the method option for an attempt in `implementing`
- **THEN** running the listed command does not refuse for the attempt state

#### Scenario: Disallowed state
- **WHEN** the attempt is in `verifying`
- **THEN** the report does not list the method option and the command refuses for the state

#### Scenario: Table change without a command change
- **WHEN** an option names a state its command refuses
- **THEN** the conformance test fails naming the option and the state

### Requirement: Setup-incomplete stop
The `setup-incomplete` report SHALL have retry class `only-after-change`, SHALL list recording the setup decision first with authority `human`, and SHALL list `idefactory setup --detect` second with authority `agent`. Its actor SHALL be `human`.

#### Scenario: Option order
- **WHEN** a `setup-incomplete` report is built
- **THEN** its first option is recording the setup decision and its second is `idefactory setup --detect`

#### Scenario: Actor
- **WHEN** the report is printed
- **THEN** the actor is `human`

### Requirement: Text stops name the next step
When `run` or `next` stops with a blocked report, the text output SHALL print a `Next:` line naming the first supported option's command and who may run it: an agent, an identity other than the implementer, or a person. When no option is supported it SHALL say so and name a person. The JSON output SHALL be unchanged.

#### Scenario: Rejected attempt
- **WHEN** run stops with `rejected` and the first supported option starts a new attempt
- **THEN** the text output contains `Next: idefactory attempt start` with the change and task
- **AND** it says an agent may run it

#### Scenario: No supported option
- **WHEN** a stop has no supported option
- **THEN** the text says there is no supported recovery and names a person

#### Scenario: Text and JSON agree
- **WHEN** the same stop is printed in text and JSON
- **THEN** both name the same first option
