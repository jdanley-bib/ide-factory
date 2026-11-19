# Tasks

## 1. Forge adapters

- [x] 1.1 Add a failing test in `test/forge-adapter.test.mjs` that `forge configure --provider azure-devops` without a repository writes nothing, that with an organization, project, and repository `pr open` through `support/fake-az.mjs` creates one Azure pull request, a second open updates it, `pr comment` adds one thread, `pr capture` stores one human comment and skips a system comment, and a forge argv with `--auto-complete` is refused. Then add the Azure adapter and forge config. Verify with `node --test test/forge-adapter.test.mjs test/pull-request-outer-loop.test.mjs`.

## 2. Board projection

- [x] 2.1 Add a failing test in `test/board.test.mjs` that an unconfigured board fails without a client call, `board configure` fills defaults, `board publish` creates once and updates on the second run, `ADO_TOKEN` reaches the client only as `AZURE_DEVOPS_EXT_PAT`, `board transition --to ready` fails, a repeated comment key posts once, and `board report` posts one comment per done task and mirrors human-gate, HALT, and pull-request states. Then add `src/lib/board.mjs` and the CLI commands. Verify with `node --test test/board.test.mjs`.
- [x] 2.2 Add a failing test that doctor stays green with no forge or board config and no `ADO_TOKEN`, and fails for a ready state equal to another state or an Azure forge without a repository. Then extend doctor. Verify with `node --test test/board.test.mjs test/govern.test.mjs`.

## 3. Automation start

- [x] 3.1 Add a failing test in `test/board-claim.test.mjs` for claim decisions `start`, `duplicate`, `not-ready`, `resume`, `skip`, and `halted`, for a change-field mismatch and a missing change failing without a board write, for `--new-run` printed only on `resume`, and for a `board-claim` event. Then add `board claim`. Verify with `node --test test/board-claim.test.mjs`.

## 4. Cloud skill and bridge

- [x] 4.1 Add a failing test that init installs `factory-cloud` naming `idefactory board claim`, keeps the never-merge and resume-only `--new-run` text, the coordinator names `factory-cloud`, and init does not create `tools/ado-bridge`. Then add the skill and coordinator text. Verify with `node --test test/install.test.mjs test/pr-guidance.test.mjs`.
- [x] 4.2 Add a failing test in `test/ado-bridge.test.mjs` that the bridge drops a comment-only edit, a wrong secret, and a missing tag, and forwards a ready transition with a bearer header. Then add `tools/ado-bridge/index.mjs` and its README. Verify with `node --test test/ado-bridge.test.mjs`.

## 5. Validation

- [x] 5.1 Run `npx openspec validate add-cloud-board-factory --strict`, `npx openspec validate --all`, and `npm test`. Confirm the CLI still does not launch a model and `.factory/work/` is the only queue.
