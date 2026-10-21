# Design: Factory Orchestration

## Context

ide-factory installs `.factory/` team memory and IDE adapters. OpenSpec owns the human plan. The CLI currently shells out to Backlog.md and prints one-role packets; the IDE session assumes other roles. Feedback and the approved plan require an executable lifecycle without launching models.

## Goals / Non-Goals

**Goals:**

- Machine work queue keyed by OpenSpec change + checkbox id
- Attempt lifecycle with evidence and atomic completion
- Classification → roles, checks, model profiles
- Human-started bounded multi-task orchestration via CLI + `/factory-run` skill
- Lean governance baseline without `GOLDEN_RULES.md`

**Non-Goals:**

- CLI spawning Cursor/Copilot/Claude or any model process
- Unattended background factory daemon
- Writing `.squad/` or requiring `s4c`
- Replacing OpenSpec

## Decisions

### Work queue under `.factory/work/`

```text
.factory/work/index.json
.factory/work/items/<change>--<id>.json
```

Fields: id, change, title, status (`todo|in_progress|done|blocked`), dependencies, acceptanceCriteria, factory metadata, attemptId, updatedAt.

Ready = all same-change dependency items are `done`. No backlog.md child process on the happy path.

### Attempts

`.factory/attempts/<attemptId>.json` with states:
`planned → assigned → implementing → red-confirmed → verifying → security-checking → awaiting-review → accepted|rejected → finalized`

Transitions validate prerequisites and append ledger events.

### Atomic complete

`idefactory complete <change> <id> --attempt <attemptId>` validates checks, reviewer≠implementer, accept verdict, no HALT/lockout; then marks work item done, checks OpenSpec checkbox, finalizes attempt, appends scribe-oriented memory updates.

### Orchestration split

CLI advances file state and emits orchestration requests (exit 2 = needs agent). `/factory-run` skill loops: run → spawn one subagent per request → record evidence → until stop. Never an unattended daemon.

### Governance

Ship baseline in `templates/factory/governance.md`. Init does not create root `GOLDEN_RULES.md`. Existing consumer files left untouched.

### Squad coexistence

Init/upgrade never touch `.squad/`. Document not overlapping `/squad-*` and `/factory-run` on the same change.

## Risks

- Agents can ignore skills → CLI still gates `complete` and `run`
- Mid-finalize failure → attempt `finalize-failed` with repair notes
- Dual tools in one repo → coexistence docs only; no auto-merge of memory roots
