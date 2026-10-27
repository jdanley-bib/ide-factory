# Proposal

## Why

Stage 1 asked for agentic review comments on the pull request. PR #16 added `idefactory pr comment`, which posts a verdict only when a role is already stored, and the factory never stores that role or posts during review. Jason Danley approved this as the first of the five stage 1 exit-test improvements on 2026-10-27 and asked for the draft. He still approves the change before it is executable.

## What Changes

- When the reviewer stores an accept or reject verdict, the attempt stores the role `reviewer` with that verdict.
- When the security-reviewer stores a verdict, the attempt stores the role `security-reviewer` with that verdict. A missing verdict is not invented.
- If the change already has a pull request record, storing the verdict posts one comment through the existing forge port. The comment carries the role, verdict, and attempt id. The same attempt and role are not posted twice.
- If the change has no pull request record, storing the verdict still succeeds and nothing is posted.
- Assumption: unit tests use the existing stub forge. `npm test` does not call GitHub.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pull-request-outer-loop`: a stored reviewer or security-reviewer verdict is posted once to the change's pull request when a pull request record exists

## Impact

- Attempt transition for accept, reject, and the security-reviewer handoff.
- `pr comment` and the pull request record's posted-verdict list.
- No new forge client, no forge admin API, and no change to merge behavior.
- The check registry stays unit to `npm test`. This change does not add scanner commands.

## Out of scope

- Exit-test items 2 through 5.
- Opening the pull request, capturing human comments, the consumer CI scaffold, and merging.
- Launching a model. The IDE session stores the verdict. The factory only posts it.
- Zoho, Slack, a headless executor, and a production identity provider.
- Making a pull request comment into an approval or a queue item.
