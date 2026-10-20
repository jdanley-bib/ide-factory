---
name: factory-verify
description: >
  Run the verification command before claiming a factory task is done. Use when
  factory-build is finishing and no verification-before-completion skill is installed.
---

# Factory verify

<!-- idefactory:owned -->

1. Use the command the task or the repo documents (test, lint, or typecheck).
2. Run it in the project. Do not describe a run you did not start.
3. Read the exit code and the failing lines. A skipped check is not a pass.
4. Claim done only when the command exits successfully.
5. Record the command and the result in the backlog task with the `backlog` CLI.

Never call Ollama. Never invent a product from the web.
