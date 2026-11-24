# Implementation notes

## Verification results

- `openspec validate audit-red-exception-for-retry-attempts --strict`: valid.
- `npm test`: 345 tests, 345 pass, 0 fail (baseline before this change: 290).
- `node src/cli.mjs doctor`: exit 0. The unmapped-check warnings predate this change.
- `node --test test/red-exceptions.test.mjs`: covers the resolver, gates, `complete`, reuse eligibility and refusals, waiver and stuck warning, authorization, immutability, events, status, reviewer packet and request, verdict comment, skill text, README and governance text, and the issue 27 end-to-end flows.

## Issue 27 end-to-end coverage

1. A rejected attempt with a genuine CLI red, a green replacement that hits `vacuous-red`, `red reuse`, then `verifying`, independent review and `complete`, with no `evidence.reds` on the replacement.
2. A stuck attempt (`vacuous-red` recorded), `red waive` without the acknowledgment flag, then review and `complete`.
3. An early `red waive` is refused with the discouragement warning, then accepted with `--acknowledge-not-stuck`, and the record marks the acknowledgment.

## Notes

- Exceptions live in `.factory/exceptions/red/` and are run-state, so they do not dirty the worktree. They are bound to the attempt by digest and never written to `evidence.reds`.
- Status JSON gains a top-level `redExceptions` array. The schema version stays at 1 because the key is additive.
- The verdict comment omits the free-text reason and points to the exception id only when the reason would trip the forge argv safety check.
- No pull request was opened. Per the workspace rule, `idefactory pr open <change>` is the human-started path.
