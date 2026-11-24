# Design

## Context

`writeAdapters` in `src/lib/install.mjs` writes more than 80 files on every `init` and `upgrade`: ten skills copied into five skill directories with `fs.cpSync`, seven commands written to four locations, the Cursor rule, the Copilot agent, and the Cline rule. It overwrites all of them. `mergeInstructions` replaces the whole region between `idefactory:start` and `idefactory:end` in `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`, and appends a second block when the markers are not a clean pair. Nothing records what was last written, so the installer cannot tell a pristine file from an edited one. The `idefactory:owned` marker only labels a generated file.

Facts that shape the design:

- The package has no runtime dependencies, so no diff or merge library is available.
- Each skill is one `SKILL.md`. The templates changed in only 26 commits, and no template has more than seven versions, so a table of past renderings is small.
- Every one of those 26 commits can be checked out and run (`git archive <sha> | tar -x`, then `node src/cli.mjs init --path <tmp>`), so past renderings can be rebuilt exactly instead of reconstructed by hand.
- `parseArgs` in `src/lib/run.mjs` gives a flag the next token as its value unless that token starts with `--`. A bare `--force` followed by a path argument would swallow the path.
- Existing tests overwrite a generated file with an invented body and expect `upgrade` to replace it: `test/install.test.mjs` ("upgrade refreshes an owned skill" and the Cline skill test) and `test/review-guidance.test.mjs` ("upgrade replaces an old unconditional command"). Those expectations are the behavior being changed.

## Goals / Non-Goals

**Goals:**
- Never overwrite local bytes without an explicit request.
- Still propagate upstream changes to every unmodified file, including when other files conflict.
- Give a project a place for its own guidance that every adapter loads the same way.
- Make every outcome visible before and after a run and recoverable after it.

**Non-Goals:**
- No three-way merge. The incoming rendering and diff are saved so one can be added later.
- No deletion of orphaned files, no `.gitignore` management, no `doctor` or `status` integration.
- No change to state files that are already written only when missing.

## Decisions

### One module owns rendering, digests, planning, and apply

A new `src/lib/adapters.mjs` has these parts, and `install.mjs` only calls it:

- `renderAdapters(project)` returns the full desired set as `{ path, content, kind, name, scope }` entries, where `path` is a project-relative POSIX path. `kind` is `skill`, `command`, `rule`, or `agent`, and `scope` is `file` or `section` for the three instruction files. It walks the template skill directories file by file instead of copying them, so a second file in a skill directory is picked up. With no extension files its output is byte-identical to what `writeAdapters` writes today. A test compares it to the adapter files this repository checks in.
- `digest(text)` converts CRLF to LF, ends the text with exactly one newline, and returns the SHA-256 in hex. Every comparison uses it.
- `planAdapters(project, options)` is pure with respect to the project: it reads files, the manifest, the history table, and the extensions, and returns a plan. It performs no write.
- `applyPlan(project, plan, options)` performs the writes.

### Manifest

`.factory/adapters.json`:

```json
{
  "version": 1,
  "tool": "0.2.0",
  "files": {
    ".cursor/commands/factory-review.md": { "digest": "<sha256>" },
    ".cline/skills/factory-build/SKILL.md": { "digest": "<sha256>", "pinned": true },
    "AGENTS.md#section": { "digest": "<sha256>" }
  }
}
```

`digest` is the normalized digest of the rendering the installer last wrote or accepted. For a pinned file it is the upstream rendering at pin time. Keys are sorted, so a run that changes nothing leaves the file byte-identical. The manifest is committed with the project, so a clone shares the baseline. It is written to a temporary file in `.factory/` and renamed, after every adapter file has been written. If a run stops in between, the next run finds the files already equal to the new rendering, which classifies as current, so the run finishes cleanly.

### Classification

Let `L` be the local digest, `R` the digest of the new rendering, `B` the manifest digest, and `H` the set of past rendering digests for the path.

| Condition, tested in order | Status | Action |
|---|---|---|
| entry is pinned | `pinned` | skip; note `upstream changed` when `R != B` |
| file absent | `create` | write; record `R` |
| `L == R` | `current` | no write; record `R` |
| `L == B` or `L` in `H` | `update` | write; record `R` |
| `B` exists and `B == R` | `modified` | no write; keep `B`; informational only |
| otherwise | `preserved` | no write; keep `B`; stage incoming and diff |

A `modified` file is a local edit with nothing new upstream to apply, so it is listed without staging and does not change the exit code. It becomes `preserved` when its template next changes. A preserved file keeps its old baseline, so the conflict stays visible until the project resolves it. The project resolves it by making the file equal to the new rendering, by `--replace` or `--force`, or by `pin`. `L` in `H` also covers a file written by an older release when the manifest is missing or older than the file.

An existing project file at a generated path that is not in `H` is `preserved`. That is the "no known baseline" case from the issue.

### Instruction sections

The unit for `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` is the text between the markers, keyed `<path>#section` in the manifest. The section is located by exactly one start marker followed by exactly one end marker. The classification table applies to the section digest. An `update` replaces only that block and keeps the file's own line endings, so all text outside the markers is unchanged. A missing file is created. A file with no markers gets the block appended, as today. Anything else, namely a start without an end, an end before a start, or a repeated marker, is `malformed`: unchanged, reported, and not replaceable by `--force`, because the project has to repair its own markers first.

### History table

`templates/adapter-history.json` maps each generated path, and each `<path>#section`, to the list of normalized digests of every rendering a past release wrote. `scripts/build-adapter-history.mjs` rebuilds it:

1. List the commits that touched `templates/` or `src/lib/install.mjs`, oldest first.
2. For each, `git archive` it to a temporary directory and run that commit's `init` into a second temporary directory.
3. Digest every adapter file and instruction section it produced, and take the union per path.
4. Write the table with sorted keys and sorted digests.

The script only appends: a digest already in the committed table is never dropped. A test fails when the current rendering of any path, with no extensions, is missing from the table, so a template change that is not followed by a rebuild cannot merge. Maintainers rerun the script as part of any template change.

### Report and staging

A run that has anything to report prints one line per non-current file, then a summary:

```
upgrade: 76 current, 4 update, 1 create, 0 modified, 1 preserved, 0 pinned, 0 malformed, 0 orphan
preserved .cursor/commands/factory-review.md
  incoming: .factory/upgrade/20261123T170000Z/incoming/.cursor/commands/factory-review.md
  diff:     .factory/upgrade/20261123T170000Z/diffs/.cursor/commands/factory-review.md.diff
Resolve with: idefactory adapters pin <path> | idefactory upgrade --replace <path> | edit the file, then run upgrade again.
```

`--json` prints `{ "version": 1, "dryRun": false, "summary": {...}, "files": [{ "path", "status", "incoming", "diff", "reason" }] }`. The staging directory exists only when a file is preserved or replaced by force. It holds `incoming/`, `diffs/`, and `backups/` mirrors of the project paths. The diff is a unified diff produced by a small longest-common-subsequence routine over lines, which is enough for files of a few hundred lines. The run id is the UTC timestamp, with a numeric suffix if the directory exists.

### Exit codes and apply order

A run that completes with at least one preserved or malformed file exits 3, a new code that is distinct from 1 (error) and 2 (an orchestration request). Modified, pinned, and orphan entries are informational and exit 0. `--dry-run` follows the same rule.

Apply order:

1. Plan everything. A failure in planning, such as an unreadable file, aborts before any write.
2. Stage incoming files, diffs, and the backups that `--replace` and `--force` need. Backups are copies of the current bytes, so they exist before anything is overwritten.
3. Write each `create` and `update` file by writing a temporary file in the same directory and renaming it. A replaced file keeps the line endings it had: CRLF when the old file used CRLF throughout, LF otherwise.
4. Write the manifest.
5. Append one `upgrade` or `init` ledger entry with the summary counts.

### Flags

- `--dry-run` and `--json` on `init` and `upgrade`. A dry run on `init` also lists the `.factory/` state files it would create, by the same existence checks `writeState` uses, and writes nothing.
- `--force` replaces every preserved file. `--replace <path>` replaces one and may be repeated. A string value after `--force` is rejected with a message that points to `--replace <path>` and `--path`, because `parseArgs` would otherwise take a project path as the value.
- `idefactory adapters pin <path>...` and `idefactory adapters unpin <path>...`. A path that the planner does not generate fails the command. Pinning writes only the manifest. If no manifest exists, pin creates one holding just the pin entries, and the next run classifies the other files from the history table. A pinned file is skipped by `--force` and `--replace`, which say so.
- The writer lease treats `init --dry-run` and `upgrade --dry-run` as read-only, and `adapters pin` and `adapters unpin` as mutating, in `cliCommandKey`.

### Extension layer

An extension file is plain Markdown at one of:

- `.factory/extensions/skills/<name>.md`, inlined into `<ide>/skills/<name>/SKILL.md` for the five skill directories;
- `.factory/extensions/commands/<name>.md`, inlined into the four command locations;
- `.factory/extensions/rules/factory.md`, inlined into `.cursor/rules/factory.mdc`, `.github/agents/factory.agent.md`, and `.cline/rules/factory.md`.

The text is trimmed and its line endings normalized, then added after the factory text and before the owned marker as:

```
<!-- idefactory:extension:start -->
## Project extensions

The text below comes from `.factory/extensions/skills/factory-build.md`. Where it conflicts with the factory text above, follow the text below.

<extension text>
<!-- idefactory:extension:end -->
```

The extension is part of the rendering, so everything above applies unchanged: editing an extension makes the unmodified generated files `update`, and a hand edit stays `preserved`. A skill extension and a command extension with the same name are separate files, because a skill and its command can need different text.

Why inline instead of a pointer to the file: skills and commands are loaded as one file, and a model does not reliably follow "also read this other file". Why a separate file instead of a protected region inside the generated file: projects edit in place, and a protected region still needs the same detection for everything outside it. Why one extension per name instead of per adapter: it makes multi-adapter consistency true by construction.

An extension can add to the factory text and say that part of it does not apply, and the precedence line makes the later text win. It cannot remove upstream text. Projects that need to change generated text itself pin the file.

### Orphans

An orphan is a path in the manifest, or in the history table, that the current rendering does not produce and whose file exists. It is listed and never removed. When the file is gone and a manifest entry remains, the entry is dropped on the next run. Orphans are informational.

### Tests that change

The two install tests and the review-guidance upgrade test write an invented body at a generated path. They change to one of: write a body taken from the history table and expect replacement, or write an invented body and expect it to be preserved, with `--replace` for the replace case. Each of these cases is a test here.

## Risks / Trade-offs

- A legacy file edited before it was ever overwritten shows up as preserved with no recorded base. The project sees the diff against the new rendering and decides. Mitigation: the diff and incoming files are saved, and `--replace` and `pin` are one command each.
- The history table is data that can fall out of date. Mitigation: the guard test, and the append-only script.
- Partial application leaves a mixed set of file versions until conflicts are resolved. A preserved skill can still describe old commands that a newer command file no longer matches. Mitigation: the report names every preserved file, the exit code is non-zero, and the apply of one run is still a consistent set of upstream files.
- A reader of an extension section sees more text than before. The section is small and delimited, and a project that dislikes it can pin the file instead.
- A project that pinned a file can miss upstream fixes. Mitigation: every run reports `upstream changed since pin` for pinned files.

## Migration Plan

1. A project updates the factory and runs `idefactory upgrade --dry-run`.
2. Files that match a past rendering are listed as updates and the first real run replaces them. Edited files are listed as preserved with the saved diff.
3. For each preserved file the project picks one of: move the edit into `.factory/extensions/`, `pin` the file, or `--replace` it. Re-running `upgrade` is safe at any point.
4. The project commits `.factory/adapters.json`.

A project whose edits were already lost to an earlier upgrade can recover them only from its own git history. Nothing in the installer can restore them.

## Open Questions

None. Three-way merge, orphan removal, and `doctor` integration are deferred, and each builds on the manifest and the saved incoming files.
