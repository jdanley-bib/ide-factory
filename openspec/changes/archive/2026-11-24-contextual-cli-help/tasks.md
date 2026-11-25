# Tasks

## 1. Help data and resolution

- [x] 1.1 Export `TRANSITIONS` from `src/lib/attempt.mjs`. Verify: a test imports it and asserts its keys are all in `ATTEMPT_STATES`; the existing attempt tests still pass.
- [x] 1.2 Create `src/lib/command-help.mjs` with the command table for every command in the global help (usage, arguments, flags, examples, effects) and the group derivation. Verify: a test asserts every table path has a summary, a usage line, and at least one example, and that `attempt`, `verify`, `red`, `pr`, `adapters`, `ci`, and `lockout` resolve as groups.
- [x] 1.3 Add topic resolution by longest matching prefix, returning a command, a group, or an unknown topic with the nearest known commands. Verify: tests cover `attempt transition`, `attempt transition <id>`, a group name, a misspelled subcommand, and a non-command topic.

## 2. Rendering and CLI wiring

- [x] 2.1 Change `parseArgs` so `--help` and `-h` set `flags.help` and consume no value. Verify: tests show `--help attempt transition` keeps `attempt transition`, `-h` works, and `--note -h` still stores `-h` as the note value; the existing CLI tests pass.
- [x] 2.2 Render text help for a command and for a group, including the effects line. Verify: tests check the `attempt transition` text names `--evidence` and `--evidence-file` and says to give only one, and that `attempt show` reports read-only while `verify run` reports it writes.
- [x] 2.3 Render the `attempt transition` lifecycle from `ATTEMPT_STATES`, `TRANSITIONS`, and `SUPPLIED_EVIDENCE_TYPES`, plus one authored precondition sentence per guarded target state. Verify: a test compares the listed states, edges, and evidence keys with the exported definitions, and checks no refused transition or rejected key appears.
- [x] 2.4 Render the JSON forms with `schemaVersion: 1` for a command, a group, the lifecycle, and `help --json`. Verify: tests parse stdout as one JSON document and assert the fields in the spec scenarios, including `--check` required and `--red` optional for `verify run`.
- [x] 2.5 Wire `help <topic...>`, `<command...> --help`, and `-h` into `run()` ahead of project resolution; an unknown `help` topic exits 1 on stderr; `<unknown> --help` and bare `help` print the existing global text. Verify: tests assert the global text and exit codes, and that `help attempt transitoin` exits non-zero with the `attempt` subcommands on stderr.
- [x] 2.6 Prove help is read-only. Verify: tests run help for every command outside a project (nothing created), under a HALT file, and in an initialized project with a before-and-after snapshot of the tree, and assert no writer lease file appears.

## 3. Drift guards

- [x] 3.1 Add a test that every top-level `case` label in `run.mjs` has a table entry and every usage line in `HELP` matches an entry's usage. Verify: the test passes, and temporarily removing one entry makes it fail.
- [x] 3.2 Add a test that every flag named in a table entry is accepted by its command, exposing a per-handler accepted-flag list if the handlers have none. Verify: the test passes for every entry, and adding a bogus flag to one entry makes it fail.
- [x] 3.3 Add a test that `effects` agrees with the writer-lease classification for each command key. Verify: the test passes, and it names the key that disagrees when one is changed.
- [x] 3.4 Add a table-driven test that drives a real attempt through each authored precondition and checks the command refuses with the phrase the help sentence uses, and that the guarded target states in `validateEvidence` equal the states with a sentence. Verify: the test passes, and removing a sentence or changing a rule makes it fail.

## 4. Skills, adapters, and docs

- [x] 4.1 Add the help guidance to `templates/skills/factory-build`, `factory-run`, `factory-verify`, `factory-tdd`, and `factory-governance`, telling the session to run `idefactory help <command>` for usage and evidence and not to read the CLI source. Verify: a test reads each template and asserts it names `idefactory help` and, for `factory-build`, `idefactory help attempt transition`.
- [x] 4.2 Refresh the shipped copies in `.agents/skills`, `.claude/skills`, `.cline/skills`, `.cursor/skills`, and `.github/skills`, and run `node scripts/build-adapter-history.mjs`. Verify: a test asserts every copy of each of the five skills matches its template wording, and `test/adapter-history.test.mjs` passes.
- [x] 4.3 Check the upgrade path with the legacy fixtures. Verify: an upgrade test shows an unmodified old skill copy is replaced with the help wording and a pinned or edited copy is left alone and reported.
- [x] 4.4 Add the help forms and `help --json` to the README command table and add a short section on contextual help. Verify: `test/readme-adapters.test.mjs` still passes and a new assertion checks the README names `idefactory help <command>` and `help --json`. Before this group is checked off, `npm test` and `openspec validate contextual-cli-help --strict` pass.
