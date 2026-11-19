---
name: factory-cloud
description: >
  Carry one OpenSpec change through the factory from a cloud agent that a
  Cursor Automation began after a human moved its Azure DevOps story to the
  ready state. Use when the Automation prompt names a work item and a change,
  or asks for a board claim. The IDE session model does the work.
---

# Factory cloud run

A human moved the change's story to the ready state. That move is the human's request for this change only. The IDE session model does the work: in a cloud run, the cloud agent's own session is that model. `idefactory` does not run a model and does not wait for board events.

<!-- idefactory:owned -->

## Before anything else

- Read `.factory/team.md`, `.factory/routing.md`, `.factory/governance.md`, and the latest entries in `.factory/decisions.md`.
- The Azure CLI with the `azure-devops` extension must be on the image, and the runtime secret `ADO_TOKEN` must be set. Never print, echo, or commit it.
- If `HALT` exists, run the claim anyway. It reports `halted` and moves the story to blocked. Then stop.

## 1. Claim

The Automation payload names `workItemId`, `revision`, and `change`. Run:

```bash
idefactory board claim <change> --work-item <id> --revision <revision> --run-url <this run's URL> --json
```

Read `decision` and `next`:

- `start` or `resume`: continue with step 2 using exactly the `next` command.
- `skip`, `duplicate`, `not-ready`, or `halted`: stop. Do not run the factory. The claim already wrote any board comment.

Pass `--new-run` only when the claim decision is `resume`. Never add it on your own after a budget stop, `vacuous-red`, or `retry-cap`.

## 2. Branch

```bash
git fetch origin
git checkout -B factory/<change> origin/factory/<change> || git checkout -B factory/<change>
```

All commits for this change go on `factory/<change>`.

## 3. Run

Follow the `factory-run` loop with the `next` command from the claim. For each exit `2`, use one subagent for the request role with only that role's charter, history, request, and named OpenSpec files. The reviewer differs from the implementer.

After each `idefactory complete`, commit, push `factory/<change>`, and run:

```bash
idefactory board report <change>
```

## 4. Stop or deliver

When the run exits `0` or `1`:

1. Commit and push `factory/<change>`.
2. If every work item for the change is done, run `idefactory pr open <change>`.
3. Run `idefactory board report <change>` so the story shows the stop reason or the pull request.
4. Summarize what happened in this run and stop.

A human gate, lockout, rejected review, or budget stop leaves the story waiting on a human or blocked. The human decides, then moves the story back to the ready state. That new claim decides `resume`.

## Board

Write to the story only through `idefactory board claim`, `idefactory board report`, `idefactory board comment <change> --message "text" --key <key>`, and `idefactory board transition <change> --to <state>`. Use the Azure DevOps MCP for reading only. Never move the story to the ready state or to a done state. Never paste check logs, environment values, or tokens into a comment.

## Pull requests

The only legal pull-request steps are `idefactory pr open <change>`, `idefactory pr comment <attemptId>`, and `idefactory pr capture <change>`.
The agent never merges. It does not open or edit a pull request through the Cursor pull-request tool or a hand-written `gh pr create`, `gh pr edit`, or `az repos pr create`.

## Never

- Do not run `idefactory approve`. Approvals come from a verified human.
- Do not run `idefactory lockout resolve`. A different human resolves a lockout.
- Do not run `idefactory resume`. Only a human clears `HALT`.
- Do not edit the OpenSpec proposal, design, specs, or task text. Only `idefactory complete` checks a box.
- Do not work on any change other than the one the claim named.
- Do not publish, deploy, spend, or create accounts.
