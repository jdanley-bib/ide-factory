# cli-help Specification

## Purpose
Lets an agent or a person learn how to use each factory command, its evidence schema, and its lifecycle rules from the CLI itself, in text or as structured data, without reading the CLI source.

## Requirements

### Requirement: Command help is targeted
`idefactory help <command...>`, `idefactory <command...> --help`, and `idefactory <command...> -h` SHALL print help for that command: its usage line, arguments, flags, whether it writes project state, and at least one example. The help SHALL name only arguments and flags the command accepts.

#### Scenario: Subcommand help by topic
- **WHEN** the user runs `idefactory help attempt transition`
- **THEN** the output shows the usage line for `attempt transition`
- **AND** it names `--evidence` and `--evidence-file` and says to give only one
- **AND** it does not print the global usage list

#### Scenario: Subcommand help by flag
- **WHEN** the user runs `idefactory attempt transition --help`
- **THEN** the output matches `idefactory help attempt transition`

#### Scenario: Short flag
- **WHEN** the user runs `idefactory verify run -h`
- **THEN** the output matches `idefactory help verify run`

#### Scenario: A token after the help flag is kept
- **WHEN** the user runs `idefactory --help attempt transition`
- **THEN** the output matches `idefactory help attempt transition`

#### Scenario: Effects are stated
- **WHEN** the user reads help for `verify run` and for `attempt show`
- **THEN** the `verify run` help says the command writes project state
- **AND** the `attempt show` help says the command is read-only

### Requirement: Command groups list their subcommands
Help for a command group SHALL list each subcommand with a one-line summary. The groups are `attempt`, `verify`, `red`, `pr`, `adapters`, `ci`, and `lockout`.

#### Scenario: Group help
- **WHEN** the user runs `idefactory help attempt`
- **THEN** the output lists `start`, `transition`, and `show` with a summary for each

### Requirement: Global help is unchanged
`idefactory help`, `idefactory --help`, and `idefactory` with no command SHALL keep printing the existing global usage text. A `--help` flag on a command the CLI does not know SHALL keep printing that text and exit zero.

#### Scenario: Global help text
- **WHEN** the user runs `idefactory help` or `idefactory --help`
- **THEN** the output is the global usage text, including every command line it lists today

#### Scenario: Unknown command with the help flag
- **WHEN** the user runs `idefactory frobnicate --help`
- **THEN** the output is the global usage text
- **AND** the exit code is zero

### Requirement: Unknown help topic fails
`idefactory help <topic>` for a topic that is not a command SHALL exit non-zero, write to stderr, and list the known commands.

#### Scenario: Misspelled topic
- **WHEN** the user runs `idefactory help attempt transitoin`
- **THEN** the exit code is non-zero
- **AND** stderr names the unknown topic and lists the commands under `attempt`

### Requirement: Help is read-only
Help SHALL NOT write any file, SHALL NOT take the writer lease, SHALL NOT require a project directory or an initialized project, and SHALL work while a HALT file exists.

#### Scenario: No project
- **WHEN** the user runs `idefactory help attempt transition` in a directory that is not a factory project
- **THEN** the help prints and the exit code is zero
- **AND** no file or directory is created

#### Scenario: HALT present
- **WHEN** a HALT file exists and the user runs `idefactory help verify run`
- **THEN** the help prints and the exit code is zero

#### Scenario: Project state is untouched
- **WHEN** the user runs help for every command in an initialized project
- **THEN** no file under the project changes

### Requirement: Attempt lifecycle help
Help for `attempt transition` SHALL list every attempt state, the states each one may move to, the evidence keys the command accepts with their types, and what must hold to enter each state that has a precondition. The states, transitions, and evidence keys SHALL come from the definitions the command enforces.

#### Scenario: States and transitions
- **WHEN** the user reads help for `attempt transition`
- **THEN** every state and every allowed transition the command enforces is listed
- **AND** a transition the command refuses is not listed

#### Scenario: Evidence keys and types
- **WHEN** the user reads help for `attempt transition`
- **THEN** each accepted evidence key is listed with its type
- **AND** an evidence key the command rejects is not listed

#### Scenario: Preconditions
- **WHEN** the user reads help for `attempt transition`
- **THEN** it states that entering `awaiting-review` requires passing check evidence for every required check
- **AND** it states that entering `accepted` requires a reviewer id

### Requirement: Machine-readable help
With `--json`, help SHALL print one JSON document to stdout with `schemaVersion` set to 1. For a command it SHALL carry the command name, summary, usage, effects, arguments, flags, and examples. For a group it SHALL carry the subcommands. For `attempt transition` it SHALL also carry the lifecycle.

#### Scenario: Command document
- **WHEN** the user runs `idefactory help verify run --json`
- **THEN** stdout parses as one JSON object with `schemaVersion` 1
- **AND** it lists `--check` as a required flag and `--red` as an optional flag

#### Scenario: Command list
- **WHEN** the user runs `idefactory help --json`
- **THEN** stdout parses as one JSON object listing every command with its summary and usage

#### Scenario: Lifecycle document
- **WHEN** the user runs `idefactory help attempt transition --json`
- **THEN** the document lists the states, the allowed transitions, the evidence keys with types, and the preconditions

### Requirement: Help matches the CLI
Every command the CLI dispatches SHALL have help. Every flag named in a command's help SHALL be a flag the command accepts, and every usage line in the global help SHALL match a command's help.

#### Scenario: Every command has help
- **WHEN** the list of dispatched commands is compared with the commands that have help
- **THEN** no dispatched command lacks help

#### Scenario: Documented flags are accepted
- **WHEN** a flag named in any command's help is checked against what that command accepts
- **THEN** the command accepts it

### Requirement: Lockout errors match help
The usage text in every lockout error SHALL match the usage of the corresponding lockout help entry, including every required flag.

#### Scenario: Usage names every required flag
- **WHEN** lockout create fails because a required flag is missing or malformed
- **THEN** the usage text in the error equals the usage in `idefactory help lockout create`
- **AND** it names `--reviewer`

#### Scenario: Unknown lockout subcommand
- **WHEN** `idefactory lockout bogus` runs
- **THEN** the error lists the usage of both `lockout create` and `lockout resolve` as shown in their help entries

### Requirement: Setup help documents structured argv
The help for `setup` SHALL name the JSON array form and the equals form of the argv input, and SHALL show one example whose argv contains a flag that begins with `--` and a quoted expression containing `|`.

#### Scenario: Setup help names the structured form
- **WHEN** the user runs `idefactory help setup`
- **THEN** the output names the JSON array form and the equals form
- **AND** it shows an example with `--filter` and a quoted expression containing `|`

#### Scenario: Machine-readable setup help
- **WHEN** the user runs `idefactory help setup --json`
- **THEN** the document lists the JSON array flag alongside the repeated element flag

### Requirement: Requirements help
Help SHALL document `idefactory requirements`, its `--json` form, its read-only effect, and the meaning of each field. The attempt lifecycle help SHALL state that the gate into `verifying` requires red for every test kind in the resolved requirement set.

#### Scenario: Requirements help
- **WHEN** the user runs `idefactory help requirements`
- **THEN** the output says the command is read-only and names the check sources, the red kinds, the human decisions, and the problems

#### Scenario: Lifecycle names the full set
- **WHEN** the user runs `idefactory help attempt transition`
- **THEN** the precondition for `verifying` refers to the resolved requirement set

### Requirement: Authorization help
Help SHALL document `idefactory authorize` and `idefactory revoke`, state that `authorize` is read-only and never performs the action, and list the closed set of `reason` values. The global usage text SHALL stay unchanged, and both commands SHALL be reachable through `help <command>` and `help --json`.

#### Scenario: Authorize help
- **WHEN** the user runs `idefactory help authorize`
- **THEN** the output says the command is read-only and lists every reason value

#### Scenario: Revoke help
- **WHEN** the user runs `idefactory help revoke`
- **THEN** the output says the original record is left unchanged

#### Scenario: Global help unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text

### Requirement: Blocked-state help
Help for `run`, `next`, `complete`, `attempt transition`, and `sync-tasks` SHALL document `--json`. The `run` help SHALL also describe each report field, the actors, the retry classes, and the durable record path. The global usage text SHALL stay unchanged.

#### Scenario: Run help names json
- **WHEN** the user runs `idefactory help run`
- **THEN** the output documents `--json` and says exit codes do not change

#### Scenario: Run help describes the report
- **WHEN** the user runs `idefactory help run`
- **THEN** the output lists the actors, the retry classes, and the record path

#### Scenario: Global help unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
