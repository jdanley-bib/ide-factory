# Tasks

## 1. Pull-request guidance and the deliverable record

- [ ] 1.1 Add a failing test that a temporary init installs a Cursor factory rule and a factory-run skill which name `idefactory pr open`, `idefactory pr comment`, and `idefactory pr capture` as the only legal pull-request steps, say the agent never merges, and say `sync-tasks`, `run`, `approve`, `complete`, `verify`, `ci scaffold`, and archive or spec sync run only after the human asks. The installed text does not name the Cursor pull-request tool or `gh pr create` as a legal step. Verify the test fails with `node --test test/pr-guidance.test.mjs` before the template edit. Then add that text to `templates/skills/factory-coordinator/SKILL.md`, `templates/skills/factory-run/SKILL.md`, `templates/skills/factory-openspec/SKILL.md`, `templates/skills/factory-governance/SKILL.md`, `templates/cursor/rules/factory.mdc`, `templates/cline/rules/factory.md`, and `templates/copilot/factory.agent.md`. Verify the same test passes.
  - Installed factory guidance allows only the three pull-request commands, never merges, and waits for the human before the named commands.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic
    dependencies: []

- [ ] 1.2 Add a failing test that `isDeliverableChange` is false when `.factory/pull-requests/<change>.json` is missing, when the pull request number or URL is absent, and when the branch is not `factory/<change>`. It is true for a record with that branch, a positive pull request number, and a non-empty URL. The same test shows the stage 1 exit check fails a change when the predicate is false and accepts the record check when the predicate is true. Verify the test fails with `node --test test/pr-deliverable.test.mjs` before the predicate exists. Then add `isDeliverableChange` beside `readPullRequestRecord` in `src/lib/pull-request.mjs`, and state in the factory-openspec and factory-coordinator templates that archive runs this check first and does not move the change when it is false. Verify `node --test test/pr-deliverable.test.mjs` and `node --test test/pull-request-outer-loop.test.mjs` pass.
  - Archive and the stage 1 exit test use one predicate, and a change without a `pr open` record is not deliverable.
  factory:
    kind: general
    risk: medium
    roles: [engineer, reviewer, scribe]
    checks: [unit]
    verificationProfile: frontend-low
    securityProfile: dependency-basic
    dependencies: ["1.1"]

## Workflow follow-up

- Jason approves this change before it is executable. Do not sync tasks until then.
- Open the pull request for this change with `idefactory pr open` on `factory/require-pr-open-for-delivery`.
- Do not merge.
