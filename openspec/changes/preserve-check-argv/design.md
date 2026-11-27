# Design

## Context

See proposal.md for motivation. Today:

- `parseArgs` in `src/lib/run.mjs` reads `--key` and then takes the next token as the value unless that token starts with `--`. In that case it stores `true`. A token such as `--argv=--filter` becomes the key `argv=--filter` with value `true`, which `mapsFromSequence` ignores.
- `mapsFromSequence` in `src/lib/setup.mjs` builds one argv per `--map` from the ordered `--argv` entries and converts each with `String(...)`, so `true` becomes `"true"`.
- Setup rejects an argv when any element matches `/\s/`, at two sites, as a guard against a shell string such as `--argv "npm test"`. That guard also rejects legitimate elements such as a filter expression.
- Checks run through `spawn(argv[0], argv.slice(1), { shell: false })`, so execution is already structural. The defects are in input handling and diagnostics only.
- The global help text is digest-pinned. The `setup` usage line cannot change, but the help entry's flags and notes can, as `--invalid-red` did for `red waive`.
- Baseline CI runs only on `ubuntu-latest`.

## Goals / Non-Goals

**Goals:**

- A human or an agent can register any argv, including elements that begin with `--` and elements that contain whitespace, pipes, and quotes, and read it back unchanged.
- A mistake in supplying argv fails loudly instead of storing a placeholder.
- The behavior is exercised on Windows in CI.

**Non-Goals:**

- Executing through a shell, or any command-line splitting by the factory.
- Resolving batch shims on behalf of the caller.

## Decisions

**1. Add `--argv-json` rather than make the repeated flag smarter.**
`--map unit --argv-json '["dotnet","test","--filter","A | B"]'` carries the exact array in one token that can never be mistaken for a flag. Alternative: a `--` terminator after which every token is an argv element. Rejected: `parseArgs` already uses `--` to end flag parsing for the whole command, so it cannot also scope to one `--map`. Alternative: a JSON file. Rejected as heavier than the problem; `--argv-json` also works with shells that quote differently if the caller passes the array through a variable.

**2. Support `--key=value` in `parseArgs`.**
Split on the first `=`, keep the rest as the value, including a leading `--`. This makes `--argv=--filter` work with the existing repeated-element form. The change is global, but it only affects tokens that previously produced an unusable key containing `=`. Alternative: handle the equals form only inside setup. Rejected: the parser is the only place that sees the raw token.

**3. A flag that needs a value fails instead of becoming `true`.**
`mapsFromSequence` already knows that `argv` and `map` need strings. It refuses a `true` value with a message naming the flag, the JSON form, and the equals form. Other commands keep their boolean-flag behavior. This is the **BREAKING** item in the proposal; the previous result was a stored `"true"` argument that no caller wanted.

**4. Narrow the shell-string rule to the shape that actually indicates one.**
An argv of one element that contains whitespace cannot be a real executable with arguments, so it is a shell string. An argv of several elements is taken as given. Alternative: keep rejecting whitespace anywhere unless `--argv-json` was used. Rejected: it makes the rule depend on how the value was typed, not on what it is. The interactive prompt keeps splitting a typed line into elements, as it does today.

**5. Print argv as JSON in preview and status.**
`JSON.stringify(argv)` is unambiguous for quotes, pipes, and leading dashes, and the digest the registry uses is over the same array. Alternative: a shell-quoted line. Rejected: quoting differs by platform, which is the problem being solved.

**6. Make spawn failures name the cause.**
A spawn error already becomes an infrastructure failure (never a red). The message gains the executable and the platform error code. For `EINVAL` or `ENOENT` on Windows where the target ends in `.cmd` or `.bat`, it says the shim cannot be started without a shell. No attempt is made to rewrite the command.

**7. Run the argv tests on Windows in CI.**
A new job on `windows-latest` runs only the parser, setup, and execution-fixture tests, which keeps cost low. The execution fixture is a Node script that prints `process.argv.slice(2)` as JSON, so no platform-specific tool is needed.

## Risks / Trade-offs

- [The equals form changes parsing for any command that was passed a token containing `=`] → Search shipped docs and tests for such tokens; limit the new behavior to tokens that start with `--` and contain `=`, and cover with a parser test that the other commands' documented usages still parse identically.
- [Windows quoting of an element with embedded quotes may differ between libuv versions] → The execution fixture asserts the exact elements received on Windows in CI, so a regression is caught on the platform that matters.
- [A one-element argv with a space is a legitimate path such as `C:\Program Files\tool.exe`] → It is refused as a shell string, as today. The human can register it with a second element or a wrapper script. Recorded as a limitation in the help notes.
- [The batch-shim diagnostic may misclassify a real missing file] → It fires only when the executable name ends in `.cmd` or `.bat`.

## Migration Plan

No data migration. Existing `.factory/checks.json` entries are unchanged and still run as stored. Rollback is a code revert: entries written with the new input forms are ordinary argv arrays that older builds read normally.
