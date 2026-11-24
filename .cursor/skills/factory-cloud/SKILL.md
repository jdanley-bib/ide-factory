---
name: factory-cloud
description: >
  Carry one OpenSpec change through the factory from a cloud agent that a
  Cursor Automation began after a human moved its Azure DevOps story to the
  ready state. Use when the Automation prompt names a work item and a change,
  or asks for a board claim. The IDE session model does the work.
---

# Factory cloud run

A human moved the change's story to the ready state. That move is the human's request for this change only. The IDE session model does the work: in a cloud run, the cloud agent's own session is that model. `idefactory` does not run a model, does not contact Azure DevOps, and does not wait for board events.

<!-- idefactory:owned -->

## How Azure DevOps is reached

Azure DevOps is reached only through Cursor's Azure DevOps MCP connection. No Azure DevOps token is on this machine, and none is needed.

- A reading step is yours: call the MCP read, save the result to a file, and pass the file to `idefactory`.
- A writing step is the CLI's. `idefactory` prints a **plan**: numbered MCP operations, each a tool name and a full argument object, and a plan id. You call each operation exactly as printed, in order, with the arguments unchanged. Then you run `idefactory mcp ack <planId>`. The CLI records the result only at ack.
- If an operation fails, stop. Do not ack, do not retry with other arguments, and do not call a different tool to get the same effect. Say which operation failed and why.
- A failed first operation of a claim with a 409 or "revision" error means another run claimed the story first. Stop and do nothing else.
- Ids that a create operation returns go into the ack: `--result '{"workItemId": <id>}'` for a story, `--result '{"pullRequestId": <id>}'` for a pull request.

Write every file you hand the CLI (story snapshot, thread list, result file) in the operating system temporary directory, not inside the project, and remove it afterward. An untracked file inside the project makes the worktree dirty and blocks verification and completion.

Allowed writes are exactly the operations a plan prints: `wit_work_item_write`, `wit_work_item_comment_write`, `wit_work_item_link_write`, `repo_pull_request_write` (create, or update of the description), and `repo_pull_request_thread_write` (create). Never call these with `autoComplete`, `mergeStrategy`, `bypassReason`, `deleteSourceBranch`, `vote`, `status`, `reviewerIds`, or `isDraft`. Never use `update_status`, `update_reviewers`, `vote`, or an abandon on a pull request or thread. Never call `unlink`.

## Before anything else

- Read `.factory/team.md`, `.factory/routing.md`, `.factory/governance.md`, and the latest entries in `.factory/decisions.md`.
- The Automation payload names `workItemId`, `revision`, and `change`. Work on that change only.
- If `HALT` exists, run the claim anyway. It reports `halted` and plans a move to blocked. Apply that plan, then stop.

## 1. Claim

Read the story with `wit_work_item`, action `get`, the work item id, and the organization name. Save the result unchanged to a temporary file. Then run:

```bash
idefactory board claim <change> --work-item <id> --snapshot <file> --revision <revision> --run-url <this run's URL> --json
```

Read `decision`, `next`, and `plan`:

- If `plan` is present, apply its operations and ack it before anything else, including when the decision is `skip` or `halted`.
- `start` or `resume`: continue with step 2 using exactly the `next` command.
- `skip`, `duplicate`, `not-ready`, or `halted`: stop after the plan, if any. Do not run the factory.

Pass `--new-run` only when the claim decision is `resume`. Never add it on your own after a budget stop, `vacuous-red`, or `retry-cap`.

## 2. Branch

```bash
git fetch origin
git checkout -B factory/<change> origin/factory/<change> || git checkout -B factory/<change>
```

All commits for this change go on `factory/<change>`. The MCP cannot push. Push with this run's own git access.

## 3. Run

Follow the `factory-run` loop with the `next` command from the claim. For each exit `2`, use one subagent for the request role with only that role's charter, history, request, and named OpenSpec files. The reviewer differs from the implementer.

After each `idefactory complete`, commit, push `factory/<change>`, and run:

```bash
idefactory board report <change>
```

Apply the plan it prints, if any, and ack it.

When a reviewer or security-reviewer verdict is recorded and a pull request already exists, run `idefactory pr comment <attemptId>`, apply the plan, and ack it. An attempt transition does not post the verdict by itself.

## 4. Stop or deliver

When the run exits `0` or `1`:

1. Commit and push `factory/<change>`.
2. If every work item for the change is done, run `idefactory pr open <change>`. Apply the plan, then ack it with the pull request id the create operation returned.
3. Run `idefactory board report <change>`, apply its plan, and ack it so the story shows the stop reason or the pull request.
4. Summarize what happened in this run and stop.

A human gate, lockout, rejected review, or budget stop leaves the story waiting on a human or blocked. The human decides, then moves the story back to the ready state. That new claim decides `resume`.

To bring human review comments into the factory, read the threads with `repo_pull_request_thread`, action `list`, save the result to a temporary file, and run `idefactory pr capture <change> --threads-file <file>`.

## Board

Write to the story only through plans from `idefactory board claim`, `idefactory board report`, `idefactory board comment <change> --message "text" --key <key>`, and `idefactory board transition <change> --to <state>`. Use the MCP reads freely. Never move the story to the ready state or to a done state. Never paste check logs, environment values, or tokens into a comment.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create`, `gh pr edit`, `az repos pr create`, or an MCP call that is not in a plan.

## Never

- Do not run `idefactory approve`. Approvals come from a verified human.
- Do not run `idefactory lockout resolve`. A different human resolves a lockout.
- Do not run `idefactory resume`. Only a human clears `HALT`.
- Do not run `idefactory red waive` or `idefactory red reuse`. A human approver records a red exception.
- Do not edit a plan, a plan file under `.factory/mcp/`, or the arguments of its operations.
- Do not edit the OpenSpec proposal, design, specs, or task text. Only `idefactory complete` checks a box.
- Do not work on any change other than the one the claim named.
- Do not publish, deploy, spend, or create accounts.
