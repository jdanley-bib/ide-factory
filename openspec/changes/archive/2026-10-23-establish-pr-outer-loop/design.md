# Design

## Context

The CLI already governs local attempts, evidence, approvals, and status. It has no pull-request command. This repository's baseline workflow, branch-review declaration, and the rule against the forge admin API stay in force. The check registry maps only `unit` to `npm test`.

See proposal.md for why this change exists.

## Goals / Non-Goals

**Goals:**

- One stable branch and one pull request for each OpenSpec change.
- A pull request body that links evidence already recorded by the factory.
- A way to post a verdict that is already stored, and to store human comments once.
- A consumer workflow file an operator can add without changing `idefactory init` or this repository's CI.

**Non-Goals:**

- Merging, auto-merge, or forge branch protection.
- A second forge, ticket intake, Slack, a headless executor, or a production identity provider.
- Launching a model. The IDE session still produces the verdict. The command only posts it.
- Running the five stage-exit changes inside this change.

## Decisions

### Forge port with a stub in tests

Pull-request commands call a forge port. The default GitHub port is an argv array, shell disabled, using `gh` from the operator's PATH. The factory does not put tokens on argv. Unit tests pass a stub executable and assert the recorded argv. `npm test` does not run `gh` and does not open a socket.

The local record is `.factory/pull-requests/<change>.json`. It stores the change, branch, pull request identity, body digest, posted verdicts, and captured comments. It is factory state. It is not verification evidence and not an approval.

### One branch name per change

The branch name is `factory/<change>`. `pr open` creates it from the current HEAD when the record is missing, then opens the pull request. A later open updates the body of the recorded pull request. It does not open a second one and does not merge.

### Body links, not logs

The body includes the change name, source revision, attempt identifiers, and paths of the approval files and check records that already exist. It omits check logs, environment variables, and secret values. Links point at factory files. They do not copy log text.

### Post only a stored verdict

`pr comment` reads the attempt review record. The reviewer id on that record stays the verified subject when policy version is 2. The command posts that verdict and role. If the attempt has no verdict, the command exits non-zero and writes nothing. The word used for the sensitive-review role in the product stays `security-reviewer`. Tasks below set `securityProfile` to `dependency-basic` and `checks` to `unit` so staffing does not invent a threat-review command. That matches the registry and the earlier decisions that refused forged scanner evidence.

### Comments are not gates

`pr capture` stores forge comment id, author, url, time, and body. The same id is stored once. `humanGateAllows` does not read this file. Accept and complete still require a scoped approval.

### Scaffold is an explicit command

`ci scaffold` writes `.github/workflows/factory-consumer.yml` only when that path is absent. The file runs `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all` on Node 24, with read-only contents permission. It does not install Semgrep and does not use `pull_request_target`. `init` and `upgrade` do not copy it. The command never writes `.github/workflows/ci.yml` or `release.yml`. Tests run it in a temporary project so this repository does not gain the consumer file.

### Completion checks stay unit

Every implementation task sets `checks: [unit]` and `verificationProfile: frontend-low`. `frontend-low` has `humanGate: false`. The human merge of the resulting pull request is still required. This change does not add a registry mapping.

## Risks / Trade-offs

- [A stub can hide a live `gh` flag mistake] → The GitHub argv is built by one function covered by the unit test, and the test fails if the argv contains `merge` or an admin route.
- [Updating a pull request needs the recorded id] → The first successful open writes the id. A failed open writes no record.
- [Comment bodies may contain sensitive text] → The capture file is local factory state. Status output does not print comment bodies.

## Migration Plan

None. Operators run `idefactory ci scaffold` in a consumer project when they want the workflow. Existing projects are unchanged until they do.

## Open Questions

None. GitHub first, humans merge, and the five proof changes wait until this change is implemented.
