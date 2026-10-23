# Proposal

## Why

Stage 0 can show attempt counts, stop reasons, and a schema version 2 approval from a real factory run. The factory still stops inside the IDE session. Jason Danley asked on 2026-10-23 to draft stage 1: one pull request per change, evidence in that pull request, a consumer CI scaffold, role verdicts on the pull request, and stored human comments. He approved this scope in the evolution plan and asked for the draft.

## What Changes

- Add `idefactory pr open` so one OpenSpec change maps to one branch and one pull request. The body links factory evidence. The command does not merge.
- Add `idefactory pr comment` so a verdict already stored on an attempt can be posted. A missing verdict fails and the command does not invent one.
- Add `idefactory pr capture` so human pull request comments are stored once. A stored comment does not authorize accept or complete.
- Add `idefactory ci scaffold` so a consumer project can gain a baseline workflow when that file is absent. `idefactory init` does not write it.
- Assumption: GitHub is the first forge adapter, through an explicit argv list with the shell disabled. Azure DevOps stays a later adapter. Unit tests use a stub forge. `npm test` does not call the network.
- Assumption: the stage exit test, five real changes from an approved OpenSpec change to a merged pull request, is proof after this command exists. This change does not invent those five changes.

## Capabilities

### New Capabilities

- `pull-request-outer-loop`: one pull request per change, evidence links, posted verdicts, and stored human comments
- `consumer-ci-scaffold`: a consumer baseline workflow written only when absent

### Modified Capabilities

None. Existing baseline CI, branch-review declaration, gates, and install behavior stay as they are. The new commands must not call the forge admin API.

## Impact

- New CLI commands under `pr` and `ci scaffold`.
- A local record under `.factory/pull-requests/`.
- A consumer workflow template. This repository's `.github/workflows/ci.yml` and release workflow stay unchanged.
- No new runtime dependency. The GitHub path uses the `gh` CLI already installed by the operator. Tests do not require it.

## Out of scope

- Merging a pull request, auto-merge, or calling the forge admin API to change branch protection.
- Zoho Sprints, Slack, a headless executor, MCP, and a production identity provider.
- Azure DevOps and any second forge adapter.
- Rewriting this repository's baseline, secret-scan, or Semgrep jobs, and copying those jobs into `idefactory init`.
- Inventing build, dependency-audit, or threat-review commands in the factory check registry.
- Treating a human pull request comment as an approval, a queue item, or verification evidence.
- The five proof changes that demonstrate the stage exit test. Those come after this change is implemented and approved.
