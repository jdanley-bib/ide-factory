# Design

## Context

`scaffoldConsumerCi` in `src/lib/ci-scaffold.mjs` writes `.github/workflows/factory-consumer.yml` only when that path is absent. If the file exists it throws, and the `ci scaffold` command exits non-zero. The file content is the constant `CONSUMER_WORKFLOW` (Node 24, the four baseline commands, read-only contents, no Semgrep, no `pull_request_target`). `initProject` in `src/lib/install.mjs` does not call it. `upgradeProject` does not either. The source comment says the workflow is not installed by init or upgrade. See proposal.md for why that changes.

`idefactory init` does not consult `.factory/HALT`. `scaffoldConsumerCi` and the `ci scaffold` command both stop when HALT is present.

## Goals / Non-Goals

**Goals:**

- Init writes the same workflow bytes when the file is absent, and still exits 0 when the file is already present.
- `ci scaffold` remains the way an existing consumer checkout gets the file, including a checkout that already has `.factory/` state and no workflow.
- Upgrade does not write the file.
- Tests run in a temporary project. This repository does not gain `factory-consumer.yml`.

**Non-Goals:**

- A second copy of the workflow YAML.
- A HALT check on init.
- Help-text edits. Help already names `ci scaffold`.
- Exit-test items 4 and 5.

## Decisions

### Init calls a write-if-absent helper, not `scaffoldConsumerCi`

`scaffoldConsumerCi` throws when the file exists and when HALT is present. Init must exit 0 in the exists case, and init must not start failing on HALT. Extract the path check and the write into a helper that returns whether it created the file. `scaffoldConsumerCi` keeps the HALT check, calls the helper, and throws the existing "already exists" error when the helper did not create the file. `initProject` calls the helper after the other init writes and ignores the "already present" result.

Alternative considered: catch the already-exists error inside init. Rejected, because that also catches the HALT error unless the messages are matched, and a future error from the writer would be swallowed.

### Upgrade stays a no-op for this file

The user asked for init, then `ci scaffold` on a consumer checkout. `upgradeProject` keeps refreshing adapters and instructions only. A checkout created before this change runs `idefactory ci scaffold` itself.

### One workflow, temporary projects

The helper writes only `CONSUMER_WORKFLOW` at `CONSUMER_WORKFLOW_RELATIVE`. It does not write `ci.yml` or `release.yml`. Tests keep using `tempProject()` as the consumer checkout and compare this repository's `ci.yml` and `release.yml` bytes before and after. The consumer-checkout test builds a temporary directory that already has `.factory/team.md` and no workflow, then runs `ci scaffold`. It does not use init to produce that absence, because init will create the file.

### Init names a workflow it actually creates

`initProject` returns the relative paths it created, and the CLI prints those paths. The workflow write currently happens after that list is built, so a fresh init omits `.github/workflows/factory-consumer.yml`, and a later init that only creates the missing workflow says team state is already present. Append `CONSUMER_WORKFLOW_RELATIVE` to that list only when `writeConsumerWorkflowIfAbsent` returns `created: true`. An existing file stays off the list and its bytes stay unchanged.

### A scaffold path argument selects the checkout

`idefactory init <dir>` uses the positional directory. `idefactory ci scaffold <checkout>` currently ignores that argument and writes into the process working directory, so a command aimed at a consumer checkout can write the workflow somewhere else. `projectDir` must resolve a positional path after `scaffold` the same way `--path` is already resolved, and `--path` still wins when both are present. The workflow bytes and the no-overwrite rule stay on the existing helper.

### Tests stay local

The existing test already stubs `gh` and the forge and asserts no forge argv. Keep that. `npm test` does not call GitHub. Each task sets `checks: [unit]`, `verificationProfile: frontend-low`, and `securityProfile: dependency-basic`. The task text mentions `release.yml`; the explicit `risk: medium` keeps the classifier from treating the word "release" as high risk.

## Risks / Trade-offs

- [Init on a project that already has `.factory/HALT` now writes the workflow] → Init already ignores HALT and rewrites adapters. The workflow write follows that. `ci scaffold` still stops on HALT.
- [A project that relied on init leaving `.github/workflows/` untouched gains `factory-consumer.yml`] → The file is written only when absent. An existing file is left byte-for-byte unchanged. Upgrade does not backfill.
- [Calling the helper from init while the CLI holds the `init` writer lease] → Init already holds that lease. The helper is an in-process write, not a nested `ci scaffold` command, so it does not take a second lease.

## Migration Plan

No change to this repository's workflows. After the change ships, a new `idefactory init` creates the consumer workflow. An existing checkout runs `idefactory ci scaffold` once. Removing the file and running init again recreates it; removing the init call is the rollback.

## Open Questions

None.
