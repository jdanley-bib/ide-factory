# Proposal

## Why

Part of #51 (failure 4). `idefactory setup --map <kind> --argv <part>...` cannot register a test runner argument that begins with `--`. In a disposable fixture `--argv --filter` was stored as the string `true`, and `--argv=--filter` dropped the argument. Setup also refuses any argv part that contains whitespace, so a quoted expression such as `Category=Unit | Category=Integration` cannot be registered. The only workaround found was a platform-specific MSBuild property with its own quoting and an extra confirmation. A registry that cannot faithfully store the command a human intends makes every later red and green meaningless, and it forces a human back into the loop for something purely mechanical.

## What Changes

- Setup accepts one structured argv per check kind: `--map <kind> --argv-json '["dotnet","test","--filter","A|B"]'`. The array is stored element for element, with no splitting, trimming, or re-quoting.
- `--argv=<value>` is accepted as an equals form, so a value that begins with `--` is bound to `--argv` instead of being read as a new flag.
- A flag that needs a value and receives none (a bare `--argv`, or `--argv` followed by another flag) fails with a message that names the flag and the structured alternatives. It no longer stores `true`.
- **BREAKING**: a bare `--argv` followed by a token that starts with `--` is now an error instead of a silent `true` entry. No supported documented use depended on it.
- Setup keeps refusing a shell command string. A shell string is now defined narrowly: an argv with exactly one element that contains whitespace. Elements after the first may contain whitespace, pipes, quotes, and `--` prefixes when supplied through `--argv-json` or `--argv=`.
- `idefactory checks preview` and `idefactory status` print each registered argv as a JSON array so the stored value can be compared with the intended one.
- A registered argv is executed exactly as stored, with no shell. When the executable cannot be started, the failure names the executable and the platform cause, including the case where the target is a Windows batch shim that cannot be started without a shell.
- Help, the `factory-setup` skill, and the README document the structured form and give one example that contains `--filter` and a quoted `|` expression.
- Baseline CI runs the argv round-trip tests on Windows as well as Linux.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-setup`: the stored-argv requirement changes (shell-string definition, exact preservation), and new requirements cover structured input, equals form, and bare-flag errors.
- `verification-evidence`: a new requirement that a registered argv is run exactly as stored and that spawn failures are actionable.
- `cli-help`: help for `setup` documents the structured input.

## Impact

- `src/lib/run.mjs` (`parseArgs` handling of `--flag=value` and of a flag followed by another flag; `handleSetup`).
- `src/lib/setup.mjs` (`mapsFromSequence`, the whitespace check at two sites, the non-interactive message).
- `src/lib/verification-evidence.mjs` (spawn failure message).
- `src/lib/checks-preview.mjs` and the status renderer (argv printed as JSON).
- `src/lib/command-help.mjs`, `templates/skills/factory-setup/SKILL.md`, adapter copies, `README.md`.
- `.github/workflows/ci.yml` (a Windows job for the argv tests).
- `test/` additions: parser, setup, registry round-trip, execution fixture.
- No new dependencies. Existing `.factory/checks.json` files are read as before.

Out of scope:

- Running checks through a shell, or accepting a command line to be split by the factory.
- Resolving a Windows batch shim (`npm.cmd`) on the human's behalf. The diagnostic names the cause; choosing a different executable is the human's or the agent's call.
- A general `--flag=value` rule for every command. The equals form is added to the global parser, but only `setup` is documented and tested for it here.
- Changing the registry schema or the command digest.
