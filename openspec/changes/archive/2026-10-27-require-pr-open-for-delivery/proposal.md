# Proposal

## Why

The five stage 1 changes reached merged pull requests, and none of them was opened by `idefactory pr open`. The bodies were written by the agent, so the stage 1 exit test failed for missing factory traceability. Jason Danley approved this follow-up on 2026-10-27. He still approves the change before it is executable.

## What Changes

- Factory guidance names `idefactory pr open`, `idefactory pr comment`, and `idefactory pr capture` as the only legal pull-request steps. The agent never merges.
- The same guidance says `sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks for that action.
- A change is not deliverable unless `.factory/pull-requests/<change>.json` from `idefactory pr open` names the open pull request. Archive stops, and the stage 1 exit test fails, when that record is missing or incomplete.
- A cloud agent runs `idefactory pr open`, `idefactory pr comment`, and `idefactory pr capture` with a Cursor environment runtime secret named `GH_TOKEN`. That secret is a fine-grained personal access token for this repository only: contents read and write, pull requests read and write, and metadata read. The Cursor GitHub App token is not sufficient. The token value is never written into the repository. Later Azure DevOps and Zoho credentials use the same pattern: runtime secrets, not committed files.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ide-adapters`: installed factory guidance states the only legal pull-request commands, the human-gated commands, and that the agent never merges.
- `pull-request-outer-loop`: a change is deliverable only when the `pr open` record names the open pull request. Archive and the stage 1 exit test fail without that record.

## Impact

- Factory skill templates under `templates/skills/`, and the Cursor, Cline, and Copilot rule templates that install copies.
- `readPullRequestRecord` in `src/lib/pull-request.mjs` is the record `pr open` already writes. A deliverable check reads that record.
- Tests for the guidance text and for a missing or incomplete record.
- No new forge command, and no merge path.
- No committed credential. `GH_TOKEN` is a Cursor environment runtime secret. The change documents the secret name and the permission scope, and it does not contain a token value.

## Out of scope

- Backfilling pull-request records for the five already merged changes.
- Declaring the stage 1 exit test passed.
- Editing the evolution plan document.
- Implementing Stage 2, Zoho, Slack, a headless executor, or a production identity provider. When Azure DevOps and Zoho credentials are needed later, they follow the same runtime-secret pattern as `GH_TOKEN` and are not committed files.
- Opening a pull request with the Cursor agent or with a hand-written `gh pr create`.
- Merging.
