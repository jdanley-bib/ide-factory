# Design

## Context

`BLOCKED_TABLE` options each carry an `actor`. The actors are `human`, `independent-agent`, `implementing-agent`, and `tooling`. Commands enforce identity independently of the table: red waive, red reuse, lockout resolve, attempt reopen, and reconcile apply refuse an identity equal to the implementer's (or the locked agent's), and policy version 2 additionally requires the project's principal verifier to confirm the identity. So for those commands the real requirement is "a different identity", and `human` over-states it. Because skills and the autonomy report key off the actor, over-stating sends the agent to stop and counts the stop as a human intervention.

## Decisions

### D1. Levels, not actors

The level is what is required. The actor stays as the reported field, derived from the level, so existing readers keep working:

| Level | Reported actor | Meaning |
| --- | --- | --- |
| `agent` | `implementing-agent` or `tooling` | the agent doing the work may do it |
| `independent` | `independent-agent` | an identity other than the implementer's, agent or person |
| `human` | `human` | a person must decide |

### D2. One table

`src/lib/authority.mjs` exports `AUTHORITY`, a frozen map from gate id to `{ level, enforcement, why }`. `BLOCKED_TABLE` options reference a gate id instead of a literal actor, and the `option()` builder reads level and enforcement from the table. Other consumers (help, packets, status) read the same table. A test asserts every option id that exists in the blocked table has a gate entry and that no gate is missing.

Initial entries:

| Gate | Level | Enforcement |
| --- | --- | --- |
| approve a publish, deploy, spend, or account action | `human` | identity, principal under v2 |
| approve a human gate on a task | `human` | identity, principal under v2 |
| resume (remove HALT) | `human` | none |
| raise a configured cap or ceiling | `human` | none |
| `--new-run` after `max-tokens` or `max-cost` | `human` | none |
| `--new-run` after a budget stop within the cap | `agent` | cap in config |
| resolve lockout | `independent` | identity (not the locked agent) |
| red waive | `independent` | identity, principal under v2 |
| red reuse | `independent` | identity, principal under v2 |
| reconcile apply | `independent` | identity, principal under v2 |
| attempt reopen | `independent` | identity |
| attempt repoint over evidence | `independent` | identity |
| method review, attempt review | `independent` | identity |
| accept baseline | `agent` | reason recorded |
| method propose, red invalidate, attempt start, verify run, complete without a human gate | `agent` | none |

### D3. Honest enforcement labels

The `enforcement` label is shown in the report so nobody reads `independent` as stronger than it is. `identity` means the CLI checked the supplied string against the implementer's, which is a bookkeeping check. `principal` means a verifier confirmed it. Neither proves a person. `human` with enforcement `identity` means "the factory expects a person and cannot prove it", and the report says exactly that.

### D4. Raise-only override

`.factory/config.json` may contain `authority: { "<gate>": "human" }`. Only the value `human` is accepted, only for gates in the table, and only for gates whose level is lower. Anything else is ignored and reported by `doctor`. A raised gate appears in reports with level `human` and `source: "config"`. The CLI enforcement is unchanged, so this is steering and documentation, not a new check. Lowering is not possible by design: the table is the floor.

### D5. Accept baseline needs a reason

`run --accept-baseline` now needs `--reason "<text>"`. The acceptance is stored with the HEAD, the reason, and the time where the baseline result is already stored (the run session's baseline record), and appears in the reviewer packet. An accepted baseline remains scoped to that HEAD. Without a reason the run stops with an error that names the flag. This is the only new requirement on an agent in this change, and it exists because the action moved from human to agent.

### D6. Messages say what is needed

Refusals in `red-exceptions`, `lockout`, `reconcile`, and the run stop for `new-run` say "an identity other than the implementer's" or "an identity other than the locked agent's" for independent gates, and say "a person" only for human gates. Help for each command states its level in one line, read from the table.

### D7. Autonomy accounting

The autonomy report already counts stops by actor. With the new actors, a stop whose first usable option is independent or agent counts as an agent-resolvable stop and not as a human-actor stop. No change to the report's code is expected, and a test pins it.

## Risks and trade-offs

- Moving waiver and reuse to `independent` lets an agent with a different identity string grant them. That was already true: the CLI checked only that the strings differ. The change makes the guidance match the code, and policy version 2 still lets a project require a verified principal. The raise-only override lets a project restore a human stop in guidance.
- The table is a new source of truth. A consistency test keeps it aligned with the blocked table, and `single-source-agent-guidance` consumes it for guidance.
