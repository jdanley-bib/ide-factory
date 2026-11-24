# Design

## Context

`attempt transition` in `src/lib/run.mjs` takes `parsed.flags.evidence`, runs `JSON.parse` on it, and hands the object to `transitionAttempt`. Validation, rejection of caller-supplied check results, and actor derivation all happen after that parse, so the source of the JSON does not affect them. `verify import --file <path>` already takes a file path and uses it as given, so relative paths resolve from the process working directory. `parseArgs` treats every `--name value` pair alike and turns a flag with no value into `true`. See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- Let a caller supply transition evidence without any shell quoting of JSON.
- Keep inline `--evidence` working exactly as it does now.
- Make every input failure name its cause and leave the attempt unchanged.

**Non-Goals:**
- No standard input source and no other flags. The scope is in proposal.md.
- No new evidence fields or transition rules.
- No cleanup of the file by the CLI.

## Decisions

**One reader for both sources.** A small module, `src/lib/evidence-input.mjs`, exports `readTransitionEvidence(flags)` and returns the evidence object. `run.mjs` calls it in place of its inline parse. The module owns the single-source rule, the file read, decoding, parsing, and the error messages, so the CLI wiring stays one call and the behavior can be tested without spawning the CLI.
- Alternative: parse in `run.mjs`. Rejected because the decoding and message rules would be buried in the dispatcher and hard to unit-test.

**Reading happens before the transition and before any write.** The helper runs before `transitionAttempt`, so a bad input never reaches attempt state. The writer lease is already held by then, which is harmless: nothing is written on the failure path.

**Check order.** Values first, then conflict, then read. A flag whose value is `true` (given with no value) fails with the usage. Both flags present fails with the single-source message. Then the file is read and decoded, then parsed, then checked to be a plain object. Checking the conflict before reading means a missing file never masks the conflict error.

**Decoding by byte-order mark.**
- `EF BB BF` is stripped and the rest is decoded as UTF-8.
- `FF FE` selects UTF-16LE for the rest.
- Anything else is decoded as UTF-8, and malformed UTF-8 surfaces as the JSON parse error.
- `FE FF` (UTF-16BE) is not supported and surfaces as a parse error. PowerShell 5.1 does not write it.

Windows PowerShell 5.1 writes UTF-16LE with `Out-File` and `>`, and a UTF-8 BOM with `Set-Content -Encoding UTF8`. Without this, the file option would fail on the shell it exists for. Content is otherwise parsed unchanged, so a note keeps its spaces, quotes, and non-ASCII characters.
- Alternative: UTF-8 only. Rejected because the common PowerShell 5.1 invocations would fail.
- Alternative: guess encodings with a library. Rejected as a new dependency for two byte patterns.

**The file value is always a path.** There is no "looks like JSON" fallback. If `--evidence-file` receives text such as `{"verdict":"ACCEPT"}`, the read fails with the missing-file message, which names that text as the path, and the message also says that `--evidence` takes inline JSON. The hint is the only concession.
- Alternative: detect a leading `{` and parse it. Rejected because it is the inline path the user asked not to accept, and it blurs the contract.

**Error messages.** Each names its cause and, for file failures, the path as the user gave it.
- Conflict: `attempt transition accepts only one of --evidence and --evidence-file; remove one.`
- Missing, unreadable, or directory: `evidence file not found: <path>`, `cannot read evidence file <path>: <reason>`, `evidence file is a directory: <path>`.
- Empty: `evidence file is empty: <path>`.
- Parse: `evidence file <path> is not valid JSON: <parser message>`.
- Not an object: `evidence file <path> must hold a JSON object`.
- Inline parse: the original parser message followed by `Pass the JSON with --evidence-file <path> to avoid shell quoting.`

**The CLI never touches the file.** It opens it read-only. The skills and packet carry the temporary-file guidance, because a caller that deletes its own temp file is safer than a tool that deletes a path it was handed.

**Guidance puts the file outside the project.** Verification and `complete` require a clean worktree. An untracked evidence file inside the project would dirty it and block the next `verify run` or `complete`. The skills say to create the file in the operating system temporary directory and remove it in a `finally`-style step. The CLI does not exempt evidence files from the dirty-worktree check.

**Help, README, packet, skills.** The help line becomes `[--evidence json | --evidence-file path]`. The README gets a short note with a PowerShell example that writes a file and removes it. The work packet line in `src/lib/queue.mjs` names the flag. The factory-build and factory-run skills in `templates/skills` carry the guidance and are copied unchanged into every shipped IDE directory, as earlier skill changes were.

## Risks / Trade-offs

- [A caller leaves temp files behind after a crash] → The files live in the OS temp directory outside the project, so they never affect the worktree, and the OS clears them eventually. Skill text says to remove them on failure too.
- [Another encoding appears, such as UTF-16BE or a legacy code page] → It fails as a parse error that names the file. Documented as UTF-8 and UTF-16LE with a byte-order mark.
- [A caller passes JSON text to `--evidence-file`] → The error names the value as a missing file and points to `--evidence`.
- [Windows paths with spaces] → Each path arrives as one argument, so no extra quoting is handled by the CLI. The README example quotes the path for PowerShell.

## Migration Plan

Additive. No state formats change, and existing `--evidence` callers are unaffected. Projects pick up the skill text with `idefactory upgrade`. Rolling back means removing the flag and the skill text, with no data to migrate.
