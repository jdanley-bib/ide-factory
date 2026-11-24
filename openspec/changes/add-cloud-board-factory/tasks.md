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

## 6. MCP transport

- [ ] 6.1 Add a failing test in `test/mcp-plan.test.mjs` that plans are deterministic and saved once, a tool or action outside the allowlist and each refused pull request argument throw with nothing saved, `mcp ack` deletes the plan and appends an `mcp-ack` event, `mcp ack` fails for an unknown plan, a tampered plan, and a create plan without its id, and `mcp pending` lists plans. Then add `src/lib/mcp-plan.mjs` and the `mcp` command. Verify with `node --test test/mcp-plan.test.mjs`.
- [ ] 6.2 Add a failing test in `test/board-mcp.test.mjs` that with the default transport `board publish`, `comment`, `transition`, `report`, and `claim` start no child process and read no `ADO_TOKEN`, print plans, and change the record only at ack, that a claim needs `--snapshot`, that its first update operation tests `/rev`, and that `not-ready`, `duplicate`, and a change-field mismatch produce no plan. Then route the board commands through plans. Verify with `node --test test/board-mcp.test.mjs test/board.test.mjs test/board-claim.test.mjs`.
- [ ] 6.3 Add a failing test in `test/forge-mcp.test.mjs` that with the Azure provider and the default transport `pr open` prints a create plan with the target branch and linked work item and ack stores the Azure Repos URL, a second open prints a description update, `pr comment` prints one thread plan and ack records the verdict once, an attempt transition does not post a verdict by itself, `pr capture --threads-file` stores one human comment and skips a system comment, and a description over 4000 characters is truncated. Then add the MCP port. Verify with `node --test test/forge-mcp.test.mjs test/forge-adapter.test.mjs`.
- [ ] 6.4 Update the `factory-cloud` skill, the bridge README, and the main README for the MCP transport, rebuild `templates/adapter-history.json`, and extend `test/cloud-skill.test.mjs` for the plan, ack, `Test /rev`, and forbidden-argument text. Verify with `node --test test/cloud-skill.test.mjs test/adapter-history.test.mjs test/readme-adapters.test.mjs`.
- [ ] 6.5 After merging `main`, run `npx openspec validate add-cloud-board-factory --strict`, `npx openspec validate --all`, and `npm test`.
