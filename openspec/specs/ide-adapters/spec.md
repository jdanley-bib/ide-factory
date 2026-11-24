# ide-adapters Specification

## Purpose
Installs the same factory skills, slash commands, and rules for Cursor, GitHub Copilot, and Claude Code.

## Requirements

### Requirement: Shared command set
The system SHALL install status, plan, build, run, full, review, and setup commands for Cursor, GitHub Copilot, Claude Code, and Cline.

#### Scenario: Command files
- **WHEN** init finishes
- **THEN** each supported IDE has adapter files for status, plan, build, run, full, review, and setup
- **AND** each command directs the IDE to its corresponding factory skill

#### Scenario: Cline workflow files
- **WHEN** init finishes
- **THEN** `.cline/workflows/` contains `factory-status.md`, `factory-plan.md`, `factory-build.md`, `factory-run.md`, `factory-full.md`, `factory-review.md`, and `factory-setup.md`
- **AND** each workflow directs Cline to the same factory skill as the matching Cursor command

### Requirement: No model launcher
Installed factory skills SHALL tell the IDE session to do the work. Installed factory skills and commands SHALL NOT direct the CLI to launch a model process.

#### Scenario: Adapter instructions
- **WHEN** installed factory skills are inspected
- **THEN** they state that the IDE session model does the work
- **AND** installed factory skills and commands contain no instruction for the factory CLI to launch a model

#### Scenario: Cline adapter instructions
- **WHEN** installed Cline skills and Cline workflow commands are inspected
- **THEN** `.cline/skills/factory-coordinator/SKILL.md` states that the IDE session model does the work
- **AND** those Cline files contain no instruction for the factory CLI to launch a model

### Requirement: Narrow activation
The Cursor rule SHALL tell the agent to follow factory skills when the human asks the factory to plan, build, review, or report status, and SHALL tell the agent to stay out of unrelated work.

#### Scenario: Rule file
- **WHEN** `.cursor/rules/factory.mdc` is read
- **THEN** it states that unrelated requests are left alone

### Requirement: Upgrade refreshes adapters only
`idefactory upgrade` SHALL refresh factory-owned adapter files, including the Cline rule, Cline skills, and Cline workflow commands, only when they are unmodified relative to a known baseline, and SHALL preserve and report an edited file instead of replacing it. Upgrade SHALL NOT replace an existing decisions log.

#### Scenario: Upgrade keeps decisions
- **WHEN** `decisions.md` has a custom entry and upgrade runs
- **THEN** the custom entry remains

#### Scenario: Upgrade refreshes a Cline skill
- **WHEN** a factory-owned file under `.cline/skills/` matches an earlier factory rendering and upgrade runs
- **THEN** that file matches the current factory skill again
- **AND** the custom decisions entry remains

#### Scenario: Upgrade preserves an edited Cline skill
- **WHEN** a factory-owned file under `.cline/skills/` holds project edits, its template changed, and upgrade runs
- **THEN** that file is byte-for-byte unchanged
- **AND** the upgrade report lists it as preserved

### Requirement: Cline skill copies
The system SHALL install the same factory skill directories under `.cline/skills/` that it installs for the other IDEs.

#### Scenario: Skill directories
- **WHEN** init finishes
- **THEN** `.cline/skills/` contains `factory-coordinator`, `factory-openspec`, `factory-build`, `factory-run`, `factory-full`, `factory-governance`, `factory-tdd`, `factory-verify`, `factory-debug`, and `factory-setup`
- **AND** each of those directories contains `SKILL.md`

### Requirement: Cline narrow activation
The Cline rule SHALL tell the agent to follow factory skills for factory plan, build, review, or status requests, and SHALL tell the agent to leave unrelated work alone.

#### Scenario: Cline rule file
- **WHEN** `.cline/rules/factory.md` is read
- **THEN** it states that unrelated requests are left alone

### Requirement: Single Cline rule tree
The system SHALL install the factory Cline rule, skills, and workflows only under `.cline/` and SHALL NOT create `.clinerules/`.

#### Scenario: Legacy tree absent
- **WHEN** init finishes in a project that had no `.clinerules/` directory
- **THEN** `.clinerules/` does not exist

### Requirement: No Cline queue
Installing the Cline adapter SHALL NOT create a work queue other than `.factory/work/` and SHALL NOT add a Cline orchestration command.

#### Scenario: Queue stays shared
- **WHEN** init finishes
- **THEN** `.factory/work/index.json` exists
- **AND** `.cline/` does not contain a `work/` directory

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

### Requirement: Setup skill confirms before writing
The installed factory-setup skill SHALL tell the human which test command it proposes, and SHALL NOT run `idefactory setup` until the human confirms or corrects that command and the governance mode. The skill SHALL NOT instruct the session to hand-edit the check registry.

#### Scenario: Unconfirmed command
- **WHEN** the skill has proposed a test command and the human has not confirmed or corrected it
- **THEN** the skill does not run `idefactory setup`

#### Scenario: Confirmed command
- **WHEN** the human confirms or corrects the test command and names the governance mode
- **THEN** the skill runs `idefactory setup` with those values as flags

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

### Requirement: Skills pass transition evidence by file
The installed factory-build and factory-run skills SHALL tell the session to record attempt transition evidence with `--evidence-file`, naming a file in the operating system temporary directory and not inside the project, and to remove that file after the command whether it succeeds or fails. They SHALL say that `--evidence` accepts inline JSON, that `--evidence-file` accepts only a path, and that only one may be given.

#### Scenario: Skills name the file option
- **WHEN** the installed factory-build or factory-run skill is read
- **THEN** it names `--evidence-file`
- **AND** it names `--evidence` as the inline alternative and says to give only one

#### Scenario: Skills keep the file out of the project
- **WHEN** the installed factory-build or factory-run skill is read
- **THEN** it tells the session to create the evidence file in the operating system temporary directory
- **AND** it tells the session to remove the file after the command whether it succeeds or fails

#### Scenario: Every shipped copy
- **WHEN** the factory skills in `templates/skills` and each shipped IDE skill directory are read
- **THEN** each copy carries the same evidence-file guidance

### Requirement: Adapters carry the conditional review wording
Every generated factory-review command, in the Cursor, Claude Code, GitHub Copilot, and Cline adapters, and every shipped copy of the factory-build skill SHALL carry the same conditional review and red wording as the source templates. None SHALL tell the reviewer to accept only if a failing test was written first, or say acceptance requires red evidence without conditions.

#### Scenario: Generated review commands
- **WHEN** init finishes in a new project
- **THEN** the review command in each of the four adapters names the lightweight and no-test-check cases and the red exception
- **AND** none contains the unconditional failing-test wording

#### Scenario: Shipped build skill copies
- **WHEN** the factory-build skill in `templates/skills` and in each shipped IDE skill directory is read
- **THEN** each carries the same conditional review wording

#### Scenario: Upgrade restores the conditional wording
- **WHEN** a generated review command holds the old unconditional wording and upgrade runs
- **THEN** it holds the conditional wording again
