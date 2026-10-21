---
name: factory-verify
description: >
  Run the verification profile checks before claiming a factory work item is done.
  Use when factory-build is finishing and no verification-before-completion skill is installed.
---

# Factory verify

<!-- idefactory:owned -->

1. Read the work item `verificationProfile` and `checks` from the packet or `.factory/work/items/`.
2. Map each required check to a project command (unit, build, playwright, docs, etc.).
3. Run each command in the project. Do not describe a run you did not start.
4. Read the exit code and the failing lines. A skipped check is not a pass.
5. Record results on the attempt:

```bash
idefactory attempt transition <attemptId> verifying --evidence '{"verification":[{"kind":"unit","command":"npm test","passed":true}]}'
```

6. Claim ready for review only when required checks passed.

Never call Ollama. Never invent a product from the web.
