# Design

## Context

`src/lib/forge.mjs` builds only `gh` argv, and `parseCreatedPullRequestUrl` in `src/lib/pull-request.mjs` accepts only `https://github.com/<owner>/<repo>/pull/<n>`. Tests swap the binary with `IDEFACTORY_FORGE`. The event log in `src/lib/event-log.mjs` keeps an allowlist of keys. `latestRunSession` in `src/lib/run-session.mjs` exposes the last stop reason for a change, and `hasActiveLockout` in `src/lib/govern.mjs` reports a lockout. Cursor Automations can start a cloud agent from a webhook. Azure DevOps service hooks can post on `workitem.updated`, and Cursor has no native Azure DevOps work-item trigger.

## Goals / Non-Goals

**Goals:**

- One Azure DevOps story per OpenSpec change, written only through tested CLI commands.
- A board claim that is idempotent and decides whether a cloud run may begin.
- An Azure Repos forge with the same one-pull-request-per-change record, and GitHub left as the default.
- Local IDE use unchanged when no board or forge config exists.

**Non-Goals:**

- A second execution queue. `.factory/work/` stays the only one.
- A model launcher, or a CLI loop that waits for board events.
- Separate Automations per SDLC role.

## Decisions

### Transport: MCP plans by default, Azure CLI optional

`board.transport` and `forge.transport` are `mcp` (default) or `az`. With `mcp` the CLI makes no Azure DevOps call. A command that would write builds one plan: ordered operations, each `{ tool, arguments }` with every argument filled in, plus the record the CLI will store. The plan is saved as `.factory/mcp/<planId>.json`, where `planId` is a digest of the plan content, so planning twice yields the same id. The command prints the plan. The agent calls each operation exactly as printed, in order, and then runs `idefactory mcp ack <planId> --result '<json>'`. Ack writes the stored record, merges ids returned by the create operations (`workItemId`, `pullRequestId`), appends a control event, and removes the plan. A failed operation means no ack, so the record never claims a write that did not happen.

Plans only name these tools and actions: `wit_work_item_write` (`create`, `update`), `wit_work_item_comment_write` (`add`), `wit_work_item_link_write` (`link`), `repo_pull_request_write` (`create`, and `update` of the description only), and `repo_pull_request_thread_write` (`create`). The plan builder asserts that and refuses the argument names `autoComplete`, `mergeStrategy`, `mergeCommitMessage`, `bypassReason`, `deleteSourceBranch`, `vote`, `status`, `reviewerIds`, and `isDraft` for pull requests. Reads (`wit_work_item get`, `repo_pull_request_thread list`) are saved by the agent to a file and passed to `board claim --snapshot` and `pr capture --threads-file`.

Concurrency: the state-changing update in a claim plan starts with `{ op: Test, path: /rev, value: <revision read> }`. Azure DevOps rejects the whole update with 409 if the story changed, so two cloud runs for one story cannot both claim it even though each has its own clone. The agent stops on a 409.

Trade-off: a plan and a snapshot are inputs the agent hands the CLI, so the CLI cannot prove the agent applied the operations or read the story honestly. Azure DevOps permissions are the enforcement layer: the MCP identity should not hold "Bypass policies when completing pull requests" or "Bypass policies when pushing", and `main` should require a reviewer and block self-approval.

### Azure CLI transport

With `transport: az`, board and Azure forge calls go through `az` with the shell disabled, the same port pattern `gh` uses. `IDEFACTORY_BOARD` and `IDEFACTORY_FORGE` swap the binary for `support/fake-az.mjs` in tests. When `ADO_TOKEN` is set and `AZURE_DEVOPS_EXT_PAT` is not, the child environment receives `AZURE_DEVOPS_EXT_PAT`, which the Azure DevOps extension reads. A token never appears on argv.

Alternative considered: `fetch` against the REST API. Rejected because every forge function is synchronous today and is called from `transitionAttempt`. Making them async would ripple through attempts and completion.

### Config lives in `.factory/config.json`

`forge` holds `provider` (`github` or `azure-devops`) and, for Azure, `organization`, `project`, `repository`, `targetBranch` (default `main`, the MCP create call needs it), and `transport`. `board` holds `provider` (`azure-devops`), `transport`, `organization`, `project`, `workItemType`, `tag`, `changeField`, `branchField`, `runUrlField`, and `states` (`new`, `ready`, `inProgress`, `waiting`, `blocked`, `inReview`, `readyForHumanReview`). `forge configure` and `board configure` write those keys, so humans do not hand-edit config. Defaults: `User Story`, tag `factory`, `Custom.OpenSpecChange`, `Custom.FactoryBranch`, `Custom.FactoryRunUrl`, and states `New`, `Ready for Factory`, `In Progress`, `Waiting on Human`, `Blocked`, `In Review`, `Ready for Human Review`.

### Board record

`.factory/boards/<change>.json` stores `schemaVersion`, `change`, `workItem` (`id`, `url`), `state` (a state key), `descriptionDigest`, `comments` (posted keys), `claims` (revision, decision, time), and `linkedPullRequests`. Publish creates the story once and later updates only the description and change field. Tags are written on create so a later publish does not drop tags a human added.

### Transitions the agent may request

`board transition --to` accepts `in-progress`, `waiting`, `blocked`, `in-review`, and `ready-for-human-review`. It never accepts `ready`, `new`, or a done state. The agent cannot retrigger itself or close a story.

### Claim decision

Claim reads the story with `az boards work-item show`. A missing on-disk change or a change field that names another change fails with no board write. Then, in order: a story that is not in the ready state is `not-ready` with no write; a revision already in `claims` is `duplicate` with no write; `HALT` gives `halted`, a comment, and `blocked`; a recorded state of `waiting` or `blocked` gives `resume`; `in-progress`, `in-review`, or `ready-for-human-review` gives `skip`, a comment, and a transition back to that state; anything else gives `start`. `start` and `resume` move the story to `inProgress`, set the branch and run URL fields, and comment. The printed next step is `idefactory run --change <name> --until human-gate`, with `--new-run` only for `resume`.

Alternative considered: resume from any state. Rejected because a delivered story moved back to ready usually needs new OpenSpec tasks first.

### Report

`board report` posts one comment per newly done work item, keyed by task and attempt, without check logs. It mirrors `HALT` or an active lockout to `blocked`; a pull request record with every item done to `readyForHumanReview`; a pull request record otherwise to `inReview`; a closed run session stopped by `rejected`, `blocked`, or `lockout` to `blocked`; any other closed stop except `all-done` and `needs-agent` to `waiting`; and everything else to `inProgress`. It links the pull request once.

### HALT

`publish`, `configure`, and `claim` respect `HALT` (claim reports `halted`). `comment`, `transition`, and `report` still run under `HALT` so the board can show the stop. None of them clears `HALT`.

### Azure forge

Create: `az repos pr create --source-branch factory/<change> --title --description --output json`. Update: `az repos pr update --id --description`. Comment and list: `az devops invoke --area git --resource pullRequestThreads`, with the comment body in a temporary file. The record URL is `<organization>/<project>/_git/<repository>/pullrequest/<id>`. Captured comment ids are `<threadId>:<commentId>`, and system comments are skipped. Argv containing `merge`, `--auto-complete`, `--bypass-policy`, `--status`, or a policy or ref command is refused.

### Reference bridge

`tools/ado-bridge/index.mjs` exports `decide(payload, settings)` and `handle(request, env, fetchImpl)`. It checks a shared secret header, accepts only `workitem.updated` whose new state is the ready state and whose revision has the tag and a valid change name, and forwards `{ source, workItemId, revision, change, project, url }` to the Cursor Automation webhook with `Authorization: Bearer`. It has no dependency and is not installed by `init`.

## Risks / Trade-offs

- [The Azure CLI is not installed on a cloud image] → the default `mcp` transport does not need it. Only `transport: az` does, and it fails with the CLI error and writes nothing.
- [An agent skips a plan operation or edits its arguments] → the record changes only at ack, the skill forbids edits, and a claim write carries a revision `Test`.
- [A pull request description over 4000 characters] → the MCP rejects it, so Azure plans truncate the body to 4000 characters.
- [A human renames a state] → `board configure --state-<key>` updates it, and doctor rejects a ready state equal to another state.
- [Two triggers race] → the writer lease serializes claims in one clone, the second claim of an acknowledged revision is `duplicate`, and across clones the revision `Test` makes the second write fail.
- [The bridge is skipped and ADO posts every edit] → claim still returns `not-ready` or `duplicate` without writes, but each post costs a cloud run. The bridge is the documented path.
