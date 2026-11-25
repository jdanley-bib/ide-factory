# Design

## Context

The CLI has one help string, `HELP`, in `src/lib/run.mjs`. `run()` prints it before it resolves a project or takes the writer lease whenever the command is missing, is `help`, or `parsed.flags.help` is set. Usage errors are inline `Usage:` strings in each handler. The lifecycle rules live in `src/lib/attempt.mjs`: `ATTEMPT_STATES`, a private `TRANSITIONS` map, the exported `SUPPLIED_EVIDENCE_TYPES`, and `validateEvidence`. Read-only versus writing commands are classified in `src/lib/writer-lease.mjs`.

Agents lack a way to ask the CLI for a command's arguments, evidence keys, or lifecycle, so they read the source. Several tests assert text in the global help, so that text cannot change.

## Goals / Non-Goals

**Goals:**
- Targeted help for every command, including the evidence schema and lifecycle for `attempt transition`.
- A stable JSON form of the same data.
- Help that cannot silently drift from the commands.
- Skills that point to help.

**Non-Goals:**
- Changing usage errors, command behavior, flags, or exit codes.
- Rewriting the global help text.
- Packets or status views for review (issue #42).

## Decisions

### One command table in `src/lib/command-help.mjs`

Each entry has `path` (for example `['attempt', 'transition']`), `summary`, `usage`, `arguments`, `flags` (name, whether it takes a value, whether it is required, description), `examples`, and `effects` (`read-only` or `writes`). Groups are derived: an entry whose path is a prefix of other entries is a group, listing those entries.

The text and JSON renderers read the table, so they cannot disagree.

Alternative: generate the global `HELP` from the table. Rejected because tests assert the current text and the global output must stay byte-identical. The table is checked against `HELP` instead (see Drift guards).

### Topic resolution by longest matching prefix

The topic tokens are the leading non-flag tokens: for `help` they are the rest tokens, for `<command...> --help` they are the command followed by the rest tokens. The resolver takes the longest prefix that matches a table path and ignores trailing tokens, which are values such as an attempt id.

- `help <topic>` with no match exits 1, writes to stderr, and lists the commands. It lists the subcommands when the first token matched a group.
- `<unknown> --help` keeps today's behavior: global text, exit 0.
- `help` with no topic prints the global text, or with `--json` the command list.

Flags before the command, as in `idefactory --path dir attempt transition --help`, are not resolved because the parser cannot tell a flag value from a command token. That input prints global help as it does today.

### `--help` and `-h` take no value

`parseArgs` currently lets `--help` consume the next token as its value, so `idefactory --help attempt transition` loses `attempt`. `parseArgs` will set `flags.help = true` for `--help` and `-h` and move on without consuming a value. `-h` after a value flag, as in `--note -h`, is still consumed by that flag because the parser reads left to right, so no existing invocation changes.

### Lifecycle comes from the enforcing code

`attempt.mjs` exports `TRANSITIONS`. The lifecycle section lists `ATTEMPT_STATES`, each state's allowed targets from `TRANSITIONS`, and evidence keys with types from `SUPPLIED_EVIDENCE_TYPES`. Adding a state, edge, or evidence key changes help with no table edit.

Preconditions are the exception. They are enforced inside `validateEvidence` as code, not data. The help table holds one authored sentence per guarded target state. The drift guard below exercises each sentence against the real command so a changed rule fails a test instead of leaving help wrong. Moving the checks into data would be a refactor of `validateEvidence`, which this change does not touch.

### JSON shape

All help JSON has `schemaVersion: 1`.

- Command: `command`, `summary`, `usage`, `effects`, `arguments`, `flags`, `examples`.
- Group: the same fields plus `subcommands` as `{ command, summary, usage }` entries.
- `attempt transition` adds `lifecycle`: `{ states, transitions, evidence, preconditions }`.
- `help --json` with no topic: `{ schemaVersion, commands: [{ command, summary, usage }] }`.

Output is one `JSON.stringify(doc, null, 2)` followed by a newline on stdout. New fields may be added later without bumping the version. Removing or retyping a field bumps it.

### Read-only by construction

The help branch stays where it is, ahead of project resolution and the lease. It reads only the table and exported constants and calls `io` output. It never calls the project resolver, so it works outside a project and under HALT. A test snapshots a project tree before and after help for every command.

### Drift guards

Tests keep the help honest:

1. Every top-level command that `dispatchCommand` handles has a table entry. The test reads the `case '<name>'` labels from `run.mjs` and checks each against the table.
2. Every `idefactory ...` usage line in `HELP` matches a table entry's usage.
3. Every flag in a table entry is read by the CLI. Handlers read flags by name and do not reject unknown flags, so the test scans the CLI source (excluding the help table) for each documented flag name. It also checks that every `--flag` in an entry's usage line is documented in that entry.
4. `effects` agrees with the writer-lease classification for each command key.
5. Each authored precondition sentence is paired with a real transition attempt that fails for exactly that reason, and the failure message contains the phrase the sentence is built on.

Guard 3 checks that a flag is read somewhere in the CLI, not that a particular command reads it. A flag moved to a different command would not be caught. A per-handler accepted-flag list would close that gap but means changing every handler, which this change does not do.

## Risks / Trade-offs

- Guard 3 is a source scan and can miss a flag that is read by a different command than the one that documents it.
- Authored preconditions can still go stale if a new rule is added without a sentence. Guard 5 covers only the listed rules. The test also fails if `validateEvidence` gains a new guarded target state that has no sentence, by comparing the guarded states against the table keys.
- Skill wording lands in six places. The existing identical-copy tests and the adapter history table catch a missed copy.

## Migration Plan

1. Land the command table, resolver, renderers, `parseArgs` change, and `TRANSITIONS` export with tests.
2. Update skill templates, refresh the shipped copies in the five adapter folders, regenerate `templates/adapter-history.json` with `node scripts/build-adapter-history.mjs`, and update the README.
3. Existing projects pick up the skill wording through `idefactory upgrade`. Pinned or modified copies are left alone.

Nothing is stored, so there is no data migration. Rollback is reverting the change.

## Open Questions

None. Error messages that link to help stay out of scope, so usage errors are not part of this design.
