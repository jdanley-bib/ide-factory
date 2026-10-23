# Design

## Context

See proposal.md. The command help already names the principal flags. The README example at the gates section does not. This repository's policy version is 2, so completion's reviewer id must be the verified subject `jason-danley`, and a gated task also needs Jason's `approve` for accept and for complete.

## Goals / Non-Goals

**Goals:**

- Make the README example copyable at policy version 2.
- Keep the task gated so the factory run stops for a real approval.

**Non-Goals:**

- Rewriting the gates section beyond that example.
- Teaching the CLI a new flag.

## Decisions

### One documentation edit, checked by a file read

A unit test reads `README.md` and asserts the approve example contains both flags. The implementation is the example itself. The task uses verification profile `release` and checks limited to `unit`, so the human gate is required and `npm test` is the only check.

The reviewer records `reviewerId` `jason-danley`. That subject is the only one this repository's verifier confirms. The implementer id stays the engineer agent id.

## Risks / Trade-offs

- [The run stops until Jason approves] → That stop is the point of the exercise. Do not invent an approval file.

## Migration Plan

None. Rollback is restoring the previous README example.

## Open Questions

None.
