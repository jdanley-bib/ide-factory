# Cloud acceptance

This runbook says what a cloud integration must show before anyone calls it proven. It is the only way to judge a provider. The local run in `test/autonomy-acceptance.test.mjs` proves the factory's mechanics with a scripted agent. It cannot prove a real model, a real trigger, or a real provider.

## Rules

- A behavior is `passed` only with identifiers from a real run, started by a real trigger, against a real provider. A local fixture, a mock, or a recorded replay does not count. A record that cites one for `passed` fails the format test.
- The pull request is not approved by its producer. The record names the pull request reviewer and the agent identity that produced the pull request, and they must differ.
- Each provider and transport has its own record under `docs/acceptance/`. Acceptance for one does not count for another.
- A new record starts with every behavior `not-run`. A provider with no supported transport in this repository is `not-available` and is never counted as passed.

## The record

A record is `docs/acceptance/<provider>-<transport>.md` with a front matter block. Top-level fields: `provider`, `transport`, `trigger`, `run` (automation or run identifier), `link`, `commit`, `pullRequest`, `time`, `producer` (the agent identity), and `reviewer`. The `behaviors:` block gives one outcome for each behavior below: `passed`, `failed`, `not-run`, or `not-available`. The `evidence:` block gives, for each `passed` behavior, the identifier that proves it. `test/cloud-acceptance-records.test.mjs` checks every record.

## The seven required behaviors

Run each through the real trigger. Keep the identifier it produces.

1. `unattended-run-to-review-ready-pr`: start a run from the trigger with no human at the keyboard and let it reach a pull request opened with `idefactory pr open`. Identifier: the pull request URL and the run link.
2. `recovered-transient-failure`: cause one transient failure, such as a provider call that fails once, and let the agent decide to retry. Identifier: the run link and the control event for the stop and its recovery (`idefactory autonomy report --json` shows one autonomous recovery and no intervention).
3. `rejected-review-addressed-in-scope`: have a reviewer reject the pull request, and let the agent address it within the delegated scope. Identifier: the review comment link and the commit that addresses it.
4. `bounded-retry-and-loop-handling`: give the run a task that cannot pass. It must stop inside `max-failures` and `max-agent-steps` with a blocked-state report. Identifier: the run link and the blocked-state report.
5. `duplicate-claim-protection`: start two runs on the same change at once. Exactly one holds the writer lease and the other stops. Identifier: both run links and the lease conflict message.
6. `durable-decisions-across-handoffs`: record a human decision before the run and show each role's packet listing it. Identifier: the run link and the approval record id.
7. `clean-stop-for-unauthorized-effect`: give a task that needs an external-effect action with no authorization. The run must pause, perform no effect, and resume after `idefactory approve` records the authorization. Identifier: the run link and the approval record id.

## Run it

1. Copy the provider's record, set every behavior to `not-run`, and fill in `provider`, `transport`, and `trigger`.
2. Run each behavior through the real trigger.
3. Fill the top-level fields and each `evidence:` line from the real run. Set the outcome.
4. Have a reviewer other than the producing agent review the pull request, and write their identity in `reviewer`.
5. Run `node --test test/cloud-acceptance-records.test.mjs`.
