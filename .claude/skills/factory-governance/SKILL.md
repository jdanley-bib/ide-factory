---
name: factory-governance
description: >
  Enforce factory approvals, halt, and reviewer lockout. Use when work needs
  spend, publishing, deployment, a human decision, or a rejected review.
---

# Factory governance

<!-- idefactory:owned -->

## Protected actions

Publishing, deploying, creating accounts, and spending money are human actions. Stop and ask the human to run:

```bash
idefactory approve <id> --note "what they are allowing"
```

A rejection is:

```bash
idefactory reject <id> --note "why"
```

Do not run those commands yourself in order to approve your own request.

## Files you do not rewrite

- `GOLDEN_RULES.md`
- Earlier entries in `.factory/decisions.md`
- Agent histories, except to append a new note

## Lockout

When the reviewer rejects an implementation, run:

```bash
idefactory lockout --agent <implementer-id> --reviewer reviewer --reason "what failed"
```

The note records the rejection. It does not delete product files. The lead assigns a later attempt; the same session does not quietly continue as if the review passed.

## Halt

If `HALT` exists at the project root, stop. The human clears it with `idefactory resume`.

The IDE session model does the work. Never call Ollama. Never invent a product from the web.
