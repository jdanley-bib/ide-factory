# Proposal

## Why

`idefactory init` and `idefactory upgrade` both call `writeAdapters`, which copies the skill templates and writes every generated command, rule, and Copilot agent file over whatever is on disk. A project that edits a generated file, for example to add task-type-aware review guidance, loses the edit on the next run with no warning and no backup. The overwrite also hides which run caused it, because both commands behave the same way ([issue #31](https://github.com/jdanley-bib/ide-factory/issues/31)). The marked sections in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` have the same flaw: text edited inside the markers is replaced.

The installer keeps no record of what it last wrote, so it cannot tell a pristine generated file from an edited one. The existing `ide-adapters` requirement "Upgrade refreshes adapters only" currently says an edited owned file must match the factory template again after upgrade, which is the behavior to be replaced. The `idefactory:owned` marker does not protect anything: it only labels a file as generated.

## What Changes

- Record what the installer wrote in a committed manifest, `.factory/adapters.json`, with a normalized digest per generated file. Compare digests ignoring line endings and trailing newlines.
- Plan every generated file before writing any of them, and classify each one:
  - the file matches the recorded baseline, so it is replaced with the new rendering;
  - the file already matches the new rendering, so nothing is written;
  - the file matches neither, so it is preserved byte for byte and reported;
  - the file is absent, so it is created.
- For installs with no manifest, ship a table of digests for past renderings. A file that matches a past rendering is treated as pristine, and a file that matches none is treated as modified.
- On a conflict, keep the local file, save the incoming rendering and a unified diff under `.factory/upgrade/<run>/`, print an actionable report, and exit with a distinct non-zero code. Apply the safe files of the same run, each written atomically, so one conflict does not block unrelated updates.
- Add `--dry-run` and `--json` to `init` and `upgrade`. A dry run writes nothing, including the manifest, the ledger, and `.factory/upgrade/`.
- Add `--force` (all preserved files) and `--replace <path>` (one file). Both save the replaced file under `.factory/upgrade/<run>/backups/` first.
- Add a project extension layer: `.factory/extensions/{skills,commands,rules}/<name>.md` is inlined by `init` and `upgrade` into a marked section of every generated file with that name, with a stated precedence. One extension file serves all adapters. With no extension file, the generated output is byte-identical to today's.
- Add `idefactory adapters pin <path>` and `idefactory adapters unpin <path>`. A pinned file is project-owned: upgrade skips it and reports when the upstream rendering differs from the rendering recorded at pin time.
- Apply the same edit detection to the marked section in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`. A malformed marker pair is reported and left alone instead of appending a second block.
- Report orphans: generated files that a past release wrote and the current release no longer renders. Nothing is deleted.
- Route `init` on an existing install through the same planner as `upgrade`.
- Document the manifest, the extension layer, the report, the migration path, and the force and pin options in the README and CLI help.

Out of scope:
- Three-way merge of local and upstream edits. Conflicts are preserved and reported; a merge can be added later because the incoming rendering and diff are already saved.
- Deleting orphaned or renamed generated files.
- Changing which `.factory/` state files are written only when missing (charters, decisions, histories, registries). Those already survive reinstall.
- Managing `.gitignore`. A project decides whether to commit or ignore `.factory/upgrade/`.
- Files that `openspec init` generates, and per-adapter extension variants.
- Changing the meaning of the `idefactory:owned` marker, which stays informational.
- Surfacing unresolved conflicts in `doctor` or `status`.

## Capabilities

### New Capabilities

- `adapter-ownership`: how the installer records, classifies, preserves, reports, forces, pins, and previews changes to generated adapter files and the marked sections in the shared instruction files.
- `adapter-extensions`: how project-owned extension files are loaded into every generated adapter file and how they take precedence.

### Modified Capabilities

- `ide-adapters`: the requirement "Upgrade refreshes adapters only" no longer says an edited owned file is always replaced. It says upgrade replaces only files that are unmodified relative to a known baseline.

## Impact

- Code: a new adapter module for rendering, digests, the manifest, classification, planning, and apply; `src/lib/install.mjs` calls it from `initProject` and `upgradeProject`; `src/lib/run.mjs` gains flags, the `adapters` command, and exit code 3; `src/lib/writer-lease.mjs` treats a dry run as read-only and `adapters pin` and `adapters unpin` as mutating.
- Templates and data: `templates/adapter-history.json` with past digests, and a script that rebuilds it from git history.
- Tests: new adapter tests and an integration test over a legacy install, plus updates to the install and review-guidance tests that overwrite a generated file and expect upgrade to replace it.
- No new runtime dependencies. A project that has never edited its adapters sees no change except a new `.factory/adapters.json`.
