# Tasks

## 1. Parser and structured input

- [ ] 1.1 Add `--key=value` handling to `parseArgs` in `src/lib/run.mjs`, keeping a leading `--` in the value; verify with parser tests that `--argv=--filter` yields the value `--filter`, that `--note=a=b` keeps `a=b`, and that every documented usage line in `src/lib/command-help.mjs` still parses to the same flags and rest as before.
- [ ] 1.2 Make `mapsFromSequence` in `src/lib/setup.mjs` refuse a `true` value for `--argv` and `--map`, naming the flag, the JSON form, and the equals form; verify with a CLI test that `--map unit --argv --filter` exits non-zero, writes no `.factory/checks.json` entry, and names the flag.
- [ ] 1.3 Add `--argv-json` to `handleSetup` and `mapsFromSequence`, storing a valid array of non-empty strings verbatim and refusing anything else; verify with tests that `["dotnet","test","--filter","A|B"]` round-trips byte for byte through `.factory/checks.json`, and that invalid JSON, a non-array, an empty element, and a number element each exit non-zero and write nothing.

## 2. Shell-string rule

- [ ] 2.1 Replace the two whitespace checks in `src/lib/setup.mjs` with the single rule "one element that contains whitespace"; verify with tests that `["npm test"]` is refused with the existing shell-string message, that `["dotnet","test","--filter","A | B"]` is accepted, and that the existing setup tests in `test/` still pass.

## 3. Visibility and execution

- [ ] 3.1 Print registered argv as JSON arrays in `checks preview` and the status report (`src/lib/checks-preview.mjs`, the status renderer); verify with tests that an argv containing `|`, quotes, and `--filter` is printed as the exact JSON array and that the registry is unchanged.
- [ ] 3.2 Add an execution fixture, a Node script that prints `process.argv.slice(2)` as JSON, and a test that registers it with `--filter` and `Category=Unit | Category=Integration "x"`, runs `verify run`, and asserts the program received those two elements unchanged; verify with `node --test` on the new test.
- [ ] 3.3 Improve the spawn-failure message in `src/lib/verification-evidence.mjs` to name the executable and platform code, and to name a Windows batch shim; verify with tests for a missing executable (infrastructure failure naming it, no red stored) and for a `.cmd` target using an injected spawn error.

## 4. Help, guidance, and CI

- [ ] 4.1 Document the JSON and equals forms in the `setup` help entry's flags, notes, and examples without changing the `setup` usage line or the global help; verify with `node src/cli.mjs help setup` and `help setup --json` showing the flags and an example containing `--filter` and a quoted `|`, and with the drift tests in `test/command-help.test.mjs` passing.
- [ ] 4.2 Update `templates/skills/factory-setup/SKILL.md`, the `README.md` setup section, and the adapter copies, then run `node scripts/build-adapter-history.mjs`; verify with `node --test test/adapter-history.test.mjs test/adapter-ownership.test.mjs test/adapters-render.test.mjs test/help-guidance.test.mjs test/readme-adapters.test.mjs` all passing.
- [ ] 4.3 Add a `windows-latest` job to `.github/workflows/ci.yml` that runs the parser, setup, and execution-fixture tests; verify with an assertion in `test/ci-provenance.test.mjs` that the workflow contains a `windows-latest` job running those tests, and, after push, by the job passing on the pull request.

## 5. Integration

- [ ] 5.1 Run `npm test` and `npx openspec validate preserve-check-argv --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
