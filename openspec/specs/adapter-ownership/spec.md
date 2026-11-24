# adapter-ownership Specification

## Purpose
Defines how init and upgrade decide whether a generated adapter file may be replaced, so project edits are preserved, reported, and recoverable while unmodified files still receive upstream updates.

## Requirements

### Requirement: Manifest records what the installer wrote
Init and upgrade SHALL write `.factory/adapters.json` listing each generated adapter path with the normalized digest of the rendering last written or accepted for it. The manifest SHALL be replaced atomically and SHALL be written after the files it describes.

#### Scenario: Fresh install
- **WHEN** init runs in a directory that has no `.factory/`
- **THEN** every generated adapter file exists
- **AND** `.factory/adapters.json` lists each of them with a digest

#### Scenario: Interrupted run
- **WHEN** a run stopped after writing some adapter files and before writing the manifest, and then runs again
- **THEN** those files count as already current
- **AND** the run finishes without a conflict

### Requirement: Unmodified files are replaced
For each generated adapter file, upgrade SHALL write the new rendering when the local file matches the recorded baseline, and SHALL write nothing when the local file already matches the new rendering. A missing file SHALL be created.

#### Scenario: Template changed upstream
- **WHEN** a local generated file matches its recorded digest and the factory template for it changed
- **THEN** upgrade replaces the file with the new rendering
- **AND** the manifest records the new digest

#### Scenario: Template unchanged
- **WHEN** a local generated file matches its recorded digest and the template did not change
- **THEN** upgrade leaves the file byte-for-byte unchanged

#### Scenario: File deleted locally
- **WHEN** a generated file is missing and it is not pinned
- **THEN** upgrade creates it from the current rendering

### Requirement: Edited files are preserved
When a local generated file matches neither its recorded baseline nor the new rendering, and the new rendering differs from that baseline or no baseline is recorded, init and upgrade SHALL leave it byte-for-byte unchanged and treat it as preserved. That includes an existing file at a generated path that the installer never wrote.

#### Scenario: Edited file with a recorded baseline
- **WHEN** a generated command was edited after it was written and the template changed upstream
- **THEN** the edited file is unchanged after upgrade
- **AND** the report lists it as preserved

#### Scenario: Existing file the installer did not write
- **WHEN** a project already has its own file at a generated path and init runs
- **THEN** that file is unchanged
- **AND** the report lists it as preserved

#### Scenario: Edit already matches upstream
- **WHEN** a preserved file is edited until it equals the new rendering and upgrade runs again
- **THEN** it is reported as current
- **AND** the manifest records its digest

### Requirement: Edits with no upstream change are only noted
When a local generated file was edited and the new rendering equals its recorded baseline, there is nothing new to apply. Init and upgrade SHALL leave the file unchanged, list it as modified, stage nothing, and not let it change the exit code.

#### Scenario: Edited file, template unchanged
- **WHEN** a generated file was edited after it was written and its template did not change
- **THEN** upgrade leaves it byte-for-byte unchanged
- **AND** the report lists it as modified
- **AND** no `.factory/upgrade/` run directory is created
- **AND** the exit code is 0

#### Scenario: Template changes later
- **WHEN** the template for that edited file changes and upgrade runs
- **THEN** the file is preserved and its incoming rendering and diff are saved

### Requirement: Installs without a manifest use past renderings
When no manifest entry exists for a file, the installer SHALL treat the file as unmodified if its digest matches a past rendering listed in a shipped history table, and as edited otherwise. A history table that lacks the current rendering of any generated path SHALL fail the test suite.

#### Scenario: Pristine legacy install
- **WHEN** a project holds files written by an earlier release, has no manifest, and upgrade runs
- **THEN** each file that matches a past rendering is replaced
- **AND** the manifest then lists every generated file

#### Scenario: Edited legacy file
- **WHEN** one such file was edited and matches no past rendering
- **THEN** that file is preserved and reported
- **AND** the other pristine files are still replaced

### Requirement: Comparison ignores line endings
Digests SHALL be computed after converting CRLF to LF and ending the text with a single newline. A file replaced by upgrade SHALL keep the line endings it had.

#### Scenario: CRLF checkout
- **WHEN** every generated file was converted to CRLF without other edits and upgrade runs
- **THEN** no file is reported as preserved

#### Scenario: Replaced CRLF file
- **WHEN** an unmodified CRLF file is replaced by upgrade
- **THEN** the new content is written with CRLF line endings

### Requirement: Conflicts are reported and recoverable
For each preserved file, init and upgrade SHALL save the incoming rendering and a unified diff under `.factory/upgrade/<run>/`, name the file and those two paths in the report, and exit with code 3. The run SHALL still apply every file that is not preserved, and SHALL finish the rest of init or upgrade.

#### Scenario: One conflict among many files
- **WHEN** one generated file is preserved and the others are unmodified
- **THEN** the others are replaced or left current
- **AND** the report names the preserved file, the saved incoming file, and the saved diff
- **AND** the exit code is 3

#### Scenario: No conflict
- **WHEN** no file is preserved
- **THEN** the exit code is 0
- **AND** no `.factory/upgrade/` run directory is created

### Requirement: No partial destructive update
Init and upgrade SHALL compute the full plan before writing, SHALL write each replaced file atomically, and SHALL NOT delete a file or overwrite local bytes except for a file classified as unmodified or an explicitly forced file.

#### Scenario: Plan before write
- **WHEN** the plan contains a malformed instruction-file marker pair
- **THEN** nothing is written for that file
- **AND** the other planned files are applied

#### Scenario: Unrelated files
- **WHEN** a project has its own skill, command, or rule next to the generated ones and upgrade runs
- **THEN** those files are byte-for-byte unchanged

### Requirement: Preview without writing
Init and upgrade SHALL accept `--dry-run`, which prints the plan per file as create, update, current, preserved, pinned, or orphan, and writes nothing, including the manifest, the ledger, and `.factory/upgrade/`. `--json` SHALL print the same plan as one JSON document. The exit code SHALL follow the same rule as a real run.

#### Scenario: Dry run
- **WHEN** upgrade runs with `--dry-run` and one file was edited while its template changed
- **THEN** the report marks that file preserved
- **AND** every file, the manifest, and the ledger are byte-for-byte unchanged
- **AND** the exit code is 3

#### Scenario: Dry run needs no writer lease
- **WHEN** another process holds the writer lease and upgrade runs with `--dry-run`
- **THEN** the dry run completes

#### Scenario: JSON report
- **WHEN** upgrade runs with `--json`
- **THEN** the output is one JSON document with a status and a digest for each generated path

### Requirement: Explicit forced replacement
`--force` SHALL replace every preserved file and `--replace <path>` SHALL replace one preserved or modified file. Each replaced file SHALL first be copied to `.factory/upgrade/<run>/backups/` and the manifest SHALL record the new digest. A pinned or malformed file SHALL NOT be replaced by either option.

#### Scenario: Replace one file
- **WHEN** two files are preserved and upgrade runs with `--replace` for one of them
- **THEN** that file matches the new rendering
- **AND** its previous content is in the backups directory
- **AND** the other file is still preserved

#### Scenario: Reset a modified file
- **WHEN** a file was edited with no upstream change and upgrade runs with `--replace` for it
- **THEN** the file matches the current rendering and its previous content is in the backups directory

#### Scenario: Path that is not generated
- **WHEN** `--replace` names a path that the factory does not generate
- **THEN** the command fails and nothing is written

#### Scenario: Force all
- **WHEN** upgrade runs with `--force`
- **THEN** every preserved file is replaced after a backup
- **AND** the exit code is 0

#### Scenario: Force given a value
- **WHEN** `--force` is followed by a path argument
- **THEN** the command fails with a message that names `--replace <path>` and `--path`
- **AND** nothing is written

### Requirement: Project-owned files can be pinned
`idefactory adapters pin <path>` SHALL mark a generated file as project-owned in the manifest and record the current upstream rendering digest. Upgrade SHALL NOT write a pinned file and SHALL report it as pinned, noting when the current rendering differs from the one recorded at pin time. `idefactory adapters unpin <path>` SHALL remove the pin.

#### Scenario: Pinned file skipped
- **WHEN** a file is pinned, edited, and the template changed
- **THEN** upgrade leaves it unchanged
- **AND** the report says upstream changed since the pin
- **AND** the exit code is 0

#### Scenario: Unknown path
- **WHEN** pin is given a path that is not a generated adapter file
- **THEN** the command fails and the manifest is unchanged

#### Scenario: Unpinned file is classified again
- **WHEN** a pinned file is unpinned and upgrade runs
- **THEN** the file is classified like any other generated file

### Requirement: Shared instruction sections get the same protection
For `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`, only the text between the `idefactory:start` and `idefactory:end` markers is generated. Init and upgrade SHALL classify that section as for any generated file and SHALL NOT change text outside it. A file with a missing, unpaired, reversed, or repeated marker SHALL be left unchanged and reported.

#### Scenario: Edited section
- **WHEN** text inside the markers was edited and the template changed
- **THEN** the file is unchanged
- **AND** the report lists it as preserved

#### Scenario: Project text outside the markers
- **WHEN** the section is unmodified and upgrade replaces it
- **THEN** all text before and after the markers is unchanged

#### Scenario: Malformed markers
- **WHEN** a file holds a start marker without an end marker
- **THEN** the file is unchanged and no second block is appended
- **AND** the report names the problem

#### Scenario: File without markers
- **WHEN** an existing file has no factory section
- **THEN** init appends the marked section and leaves the rest unchanged

### Requirement: Removed generated files are reported
Init and upgrade SHALL report each file that a past release generated and the current release does not, including one recorded in the manifest, and SHALL NOT delete it. A manifest entry for such a file that no longer exists on disk SHALL be dropped.

#### Scenario: Orphan present
- **WHEN** a recorded generated path is no longer rendered and the file still exists
- **THEN** the report lists it as an orphan
- **AND** the file is unchanged

#### Scenario: Orphan removed by the project
- **WHEN** the orphan file is deleted and upgrade runs
- **THEN** its manifest entry is gone

### Requirement: Init and upgrade share one planner
`idefactory init` in a directory that already has generated files SHALL classify them exactly as upgrade does, and both commands SHALL print the same per-file report. A repeated run with no template or extension change SHALL write nothing.

#### Scenario: Re-init after an edit
- **WHEN** a generated file was edited and init runs again
- **THEN** the file is unchanged and reported as preserved

#### Scenario: Idempotent run
- **WHEN** upgrade runs twice in a row with no changes in between
- **THEN** the second run changes no file and reports every file as current
- **AND** the manifest is byte-for-byte unchanged

#### Scenario: Same result for every adapter
- **WHEN** the same template changes and upgrade runs on a pristine install
- **THEN** the Cursor, Claude Code, GitHub Copilot, Cline, and agents copies all carry the new wording
