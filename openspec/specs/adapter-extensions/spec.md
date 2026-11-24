# adapter-extensions Specification

## Purpose
Lets a project add its own guidance to generated skills, commands, and rules without editing generated files, so upstream updates and project customizations can coexist across every IDE adapter.

## Requirements

### Requirement: Extension files are project-owned
A project MAY add `.factory/extensions/skills/<name>.md`, `.factory/extensions/commands/<name>.md`, and `.factory/extensions/rules/factory.md`. Init and upgrade SHALL read them and SHALL NOT create, modify, or delete them.

#### Scenario: Extension survives upgrade
- **WHEN** an extension file exists and upgrade runs
- **THEN** the extension file is byte-for-byte unchanged

#### Scenario: No directory created
- **WHEN** init runs in a project with no extensions
- **THEN** `.factory/extensions/` is not created

### Requirement: Extensions load into every adapter copy
Init and upgrade SHALL inline the extension for a name into every generated file of that kind and name: the five skill directories for a skill extension, the four command locations for a command extension, and the Cursor rule, the Cline rule, and the Copilot agent for the rules extension. The text SHALL be placed in a marked section after the factory text and before the owned marker.

#### Scenario: Skill extension
- **WHEN** `.factory/extensions/skills/factory-build.md` holds project review rules and upgrade runs
- **THEN** each of the five `factory-build/SKILL.md` copies holds those rules in the marked section

#### Scenario: Command extension
- **WHEN** `.factory/extensions/commands/factory-review.md` exists and upgrade runs
- **THEN** each of the four `factory-review` command files holds the text
- **AND** its front matter and trailing owned marker are unchanged

#### Scenario: Same text everywhere
- **WHEN** an extension is loaded
- **THEN** the section text is identical in every copy it appears in

### Requirement: Project text takes precedence
The marked section SHALL state that where the project text conflicts with the factory text above it, the project text applies. The section SHALL name its source file.

#### Scenario: Precedence statement
- **WHEN** a generated file holds an extension section
- **THEN** the section names `.factory/extensions/` as its source
- **AND** it says the project text wins on conflict

### Requirement: Output is unchanged without an extension
A generated file for which no extension file exists, or whose extension file is empty, SHALL be byte-for-byte identical to the rendering of earlier releases.

#### Scenario: No extension
- **WHEN** init runs in a project with no extension files
- **THEN** every generated file equals its template rendering

#### Scenario: Empty extension
- **WHEN** an extension file contains only whitespace
- **THEN** the generated file has no extension section

### Requirement: Extension changes flow through upgrade
Editing, adding, or removing an extension file SHALL change the rendering for that name, so the next init or upgrade replaces the unmodified generated files, as for a template change. A generated file that was edited by hand is preserved as usual.

#### Scenario: Extension edited
- **WHEN** an extension file changes and upgrade runs
- **THEN** each unmodified generated file for that name is replaced
- **AND** the manifest records the new digests

#### Scenario: Extension removed
- **WHEN** an extension file is deleted and upgrade runs
- **THEN** the section is removed from each unmodified generated file

#### Scenario: Hand edit beside an extension
- **WHEN** a generated file with an extension section was also edited by hand
- **THEN** it is preserved and reported
