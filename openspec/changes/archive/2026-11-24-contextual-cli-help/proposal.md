# Proposal

## Why

Agents read the CLI source to learn command usage and workflow rules because the CLI does not tell them. `idefactory attempt transition --help` prints the one global usage list, with no evidence keys, no state lifecycle, and no prerequisites, so an agent opens `run.mjs` and `attempt.mjs` to find them. That costs time and ties agents to implementation details that can change. Issue #43 asks for contextual help that is accurate, read-only, and available in a machine-readable form, with the generated skills pointing to it.

## What Changes

- `idefactory help <command...>`, `idefactory <command...> --help`, and `-h` print targeted help for one command: usage, arguments, flags, whether the command writes, and examples.
- A command group such as `attempt`, `verify`, `red`, `pr`, `adapters`, `ci`, or `lockout` lists its subcommands.
- `idefactory help attempt transition` also prints the attempt lifecycle: every state, the transitions each state allows, the evidence keys with their types, and what must be true to enter each state.
- `--json` on any help request prints stable structured help with a schema version. `idefactory help --json` lists every command.
- Argument parsing treats `--help` and `-h` as flags that take no value, so a token after `--help` is no longer swallowed.
- The global `help` and `--help` output keeps its current text.
- The installed factory skills tell the session to run `idefactory help <command>` for usage and evidence schema before reading CLI source.
- The README command table gains the help forms.

## Capabilities

### New Capabilities

- `cli-help`: contextual and machine-readable command help, its accuracy guarantees, and its read-only behavior.

### Modified Capabilities

- `ide-adapters`: the installed skills point to CLI help instead of CLI source for command usage and evidence schema.

## Out of Scope

- Usage errors that link to a help topic. Existing error messages keep their current text.
- A reviewer packet or a `verify status` command. Those belong to issue #42.
- JSON output for commands other than help. `status --json` and `init --json` keep their current behavior.
- Changing any command's flags, behavior, or exit codes.
- Changing the text of the global `help` and `--help` output.
- Shell completion, man pages, and translated help.
- Lifecycle help for commands other than `attempt transition`.

## Impact

- `src/lib/run.mjs`: `parseArgs` handles `--help` and `-h` as flags without a value. The help branch resolves a topic and prints text or JSON.
- New `src/lib/command-help.mjs`: one command table for usage, arguments, flags, examples, and effects, plus topic resolution and the text and JSON renderers.
- `src/lib/attempt.mjs`: export the `TRANSITIONS` map so help derives the lifecycle from it. `SUPPLIED_EVIDENCE_TYPES` is already exported.
- `templates/skills/*`, the shipped skill copies in `.agents`, `.claude`, `.cline`, `.cursor`, and `.github`, and `templates/adapter-history.json` for the changed renderings.
- `README.md` command table.
- Tests: a new help test file, plus checks that the global help text is unchanged and that every shipped skill copy carries the same guidance.
- No new dependencies and no change to stored data.
