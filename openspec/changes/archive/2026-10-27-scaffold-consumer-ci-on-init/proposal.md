# Proposal

## Why

`idefactory ci scaffold` already writes a consumer baseline workflow, but only when someone runs that command by itself. `idefactory init` does not run it, and the command has not been applied to a consumer checkout. Jason Danley approved this as the third of the five stage 1 exit-test improvements on 2026-10-27 and asked for the draft. He still approves the change before it is executable.

## What Changes

- **BREAKING:** `idefactory init` writes `.github/workflows/factory-consumer.yml` in the project being initialized when that file is absent, using the same workflow `idefactory ci scaffold` already writes.
- When that file already exists, init leaves the bytes unchanged and still exits 0. A later `idefactory ci scaffold` in that project still exits non-zero and leaves the bytes unchanged.
- `idefactory upgrade` does not write the workflow. A consumer checkout that already exists gets the file by running `idefactory ci scaffold` there.
- The written workflow stays the current consumer baseline: Node 24, `npm ci`, `npm test`, `npm audit --audit-level=high`, and `npx openspec validate --all`. It does not install Semgrep and does not use `pull_request_target`.
- Tests use a temporary project as the consumer checkout. This repository does not gain `factory-consumer.yml`, and its own `ci.yml` and `release.yml` stay unchanged.
- Assumption: "applied to a consumer checkout" means the command writes the workflow in a project other than this repository. This change does not open a pull request on an external consumer repository.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `consumer-ci-scaffold`: init writes the consumer workflow when it is absent; an existing consumer checkout still receives it from `ci scaffold`; upgrade does not write it

## Impact

- `idefactory init` in `src/lib/install.mjs` gains the existing write-once scaffold.
- `src/lib/ci-scaffold.mjs` stays the writer. The standalone `ci scaffold` command keeps its non-zero exit when the file exists.
- `test/consumer-ci-scaffold.test.mjs` today asserts that init leaves the workflow absent. That assertion changes.
- No change to this repository's `.github/workflows/ci.yml` or `release.yml`, and no new forge client.

## Out of scope

- Exit-test items 4 and 5.
- Writing `factory-consumer.yml` into this repository, or editing this repository's CI, Semgrep install, or release workflow.
- Opening a pull request on an external consumer repository, or calling the forge admin API.
- Making `idefactory upgrade` install the workflow.
- Zoho, Slack, a headless executor, a production identity provider, and merging.
