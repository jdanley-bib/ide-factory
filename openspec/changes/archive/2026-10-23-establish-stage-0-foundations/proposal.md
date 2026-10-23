# Proposal

## Why

The factory can govern a local IDE session, but operators cannot read one stable status document, see derived run metrics, or trace a gate approval to a verified person. Stage 0 of the factory evolution adds that foundation before ticket intake, pull requests, Slack, or a headless executor.

## What Changes

- Add a read-only `idefactory status --json` document with queue counts and metrics derived from existing factory records. Plain `idefactory status` stays text.
- Add an append-only local event log for successful control-plane actions. Events are not verification evidence and are not a queue.
- **BREAKING** for a new install, and for any project whose governance policy version is 2: `idefactory approve` requires a verified principal, and a schema-1 approval no longer authorizes accept or complete. Existing policy version 1 installs keep today's approval behavior. Doctor warns when version 1 is still in use.
- When policy version is 2, the completion reviewer and the lockout resolver must be verified principals. Implementer identifiers stay local agent ids.
- Doctor names profile check kinds that have no `checks.json` entry. A preview command proposes missing registry entries from `package.json` scripts and does not overwrite an existing entry.
- Assumption: this change does not integrate Zoho, GitHub, or Slack as an identity provider. The only verifier shipped here is a project-configured local command verifier, disabled until configured. Choosing a production identity provider is a later decision.

## Capabilities

### New Capabilities

- `factory-read-model`: read-only JSON status and derived metrics
- `factory-event-log`: append-only local control-plane events

### Modified Capabilities

- `human-governance`: approval records cite a verified principal at policy version 2, and doctor reports that version plus unmapped check kinds
- `risk-gates`: policy version 2 authorizes accept and complete only from a schema-2 approval whose approver is a verified principal
- `guided-build`: at policy version 2, completion requires the reviewer identifier to be a verified principal distinct from the implementer
- `verification-evidence`: a preview command proposes missing registry entries without writing over existing ones or running checks
- `project-install`: a new init sets governance policy version 2 and still leaves an existing `checks.json` unchanged

## Impact

- CLI commands `status`, `approve`, `doctor`, `complete`, and lockout resolution, plus a new read-only checks preview command.
- Approval JSON under `.factory/approvals/`, new-install `config.json`, and a new `.factory/observability/events.jsonl` file.
- No new runtime dependency. No Zoho, Slack, pull request, cloud executor, MCP, or remote telemetry client.
- `.factory/work/` remains the only execution queue. This change does not staff or run that queue.

## Out of scope

- Zoho Sprints, Azure DevOps, GitHub Issues, story boards, and Slack.
- Opening pull requests, consumer CI scaffolds, and choosing the product forge.
- Headless or cloud executors.
- A production identity-provider SDK, interactive login, or automatic merge.
- Acceptance criteria, Definition of Done, archive and search, adapter breadth, plugins, and skill replay.
- A graphical dashboard. The JSON status document is the metrics surface.
- Changing who may draft an OpenSpec proposal.
