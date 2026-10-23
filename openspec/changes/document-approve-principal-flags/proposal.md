# Proposal

## Why

The README approve example omits `--principal-provider` and `--principal-subject`. At governance policy version 2 those flags are required, so an operator who copies the example cannot record an approval. Jason Danley asked for this small change on 2026-10-23 so one real factory run can record a schema version 2 approval.

## What Changes

- The README approve example names `--principal-provider` and `--principal-subject`.
- The change is one gated task. Accept and complete each wait for Jason Danley's approval.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `human-governance`: the documented approve example names the principal flags.

## Impact

- `README.md` gates section.
- One new test that reads that example.
- No verifier, policy, or profile changes.

## Out of scope

- A production identity provider, pull-request automation, or a new ticket adapter.
- Changing which profiles set `humanGate`.
- Implementing stage 1.
