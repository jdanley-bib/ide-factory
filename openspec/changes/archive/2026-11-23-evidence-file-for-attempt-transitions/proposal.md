# Proposal

## Why

`idefactory attempt transition <id> <state> --evidence '<json>'` fails on Windows PowerShell 5.1. Native argument handling strips the quotation marks from valid JSON, and the command reports `Expected property name or '}' in JSON at position 1` ([issue #29](https://github.com/jdanley-bib/ide-factory/issues/29)). Agents and people on Windows cannot record reviewer verdicts or implementer ids reliably, and the error does not say how to avoid it. Passing JSON through a file removes shell quoting from the path.

## What Changes

- Add `--evidence-file <path>` to `attempt transition`. It names a file whose content is a JSON object, and the CLI reads that file instead of parsing an inline argument.
- `--evidence-file` takes a path only. It never accepts inline JSON.
- `--evidence <json>` keeps its current meaning and behavior.
- Passing both flags is an error that tells the user to include only one.
- The CLI reads UTF-8 and also accepts the byte-order marks Windows PowerShell 5.1 writes: a UTF-8 BOM, and UTF-16LE with a BOM. It does not otherwise change the content.
- A missing, unreadable, or empty file, a directory path, or content that is not a JSON object fails with a message that names the file. Both flags fail with a usage error when given no value. Inline JSON that does not parse fails with an error that names `--evidence-file` as the alternative.
- Everything after the JSON is parsed is unchanged: attempt validation, rejection of caller-supplied check results, actor derivation, HALT, and the writer lease.
- The CLI does not delete the file. The factory skills and work packet tell the agent to write the file in the operating system temporary directory, outside the project, and remove it after the command whether it succeeds or fails.
- The help text, README, work packet, and factory skills document the new flag.

Out of scope:
- Reading evidence from standard input.
- Accepting inline JSON through `--evidence-file`.
- Deleting or otherwise managing the evidence file in the CLI.
- Changing which fields attempt evidence may carry, or any attempt transition rule.
- Other flags. Only `--evidence` carries JSON on the command line.
- Windows PowerShell quoting of free-text flags such as `--note`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-build`: adds a requirement for the sources of attempt transition evidence, covering the file flag, the single-source rule, encoding, and failure messages.
- `ide-adapters`: adds a requirement that the shipped factory skills tell the session to pass transition evidence through a temporary file outside the project and remove it afterward.

## Impact

- Code: `src/lib/run.mjs` (flag handling in `attempt transition`, help text), a small evidence-reading helper, and the work packet text in `src/lib/queue.mjs`.
- Docs and skills: `README.md`, and the factory skills in `templates/skills` and each shipped IDE copy that mention recording evidence on a transition.
- Tests: new CLI tests for the file flag, conflicting flags, encodings, and failures, plus skill-text and packet-text checks.
- No new dependencies, no change to `.factory/` state formats, and no change to existing `--evidence` callers.
