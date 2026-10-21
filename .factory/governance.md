# Governance

Operational baseline for the IDE factory. Agents may read this file. Prefer append-only updates to decisions and histories.

1. **Human-authored scope.** The human authors OpenSpec changes. The factory does not invent product scope.
2. **IDE models only.** Do not start Ollama or any other model server. Do not call a model HTTP API from this factory. The IDE session the human opened is the only model budget.
3. **Approve before publish or spend.** Do not publish packages, deploy, create paid resources, or open accounts unless the human recorded `idefactory approve`.
4. **Honest verification.** Do not claim a check passed unless you ran it and it passed. A skipped check is not a pass.
5. **Append-only memory.** Do not truncate `.factory/decisions.md` or agent histories. Append.
6. **Kill switch.** If a file named `HALT` exists in the project root, stop factory commands.
7. **Protected paths.** Do not rewrite `.factory/decisions.md` or agent histories in place. Charters change only with explicit roster refresh (`--force-roster`).
8. **Reviewer differs.** The reviewer is a different role from the implementer.
9. **Prefer common tools.** Use maintained scaffolds, frameworks, and libraries before hand-rolling. Examples: `npm create vite@latest` for a SPA, official CLIs for apps, standard test runners. Invent a custom toolchain only when the OpenSpec design explicitly requires it.
10. **Work queue.** `.factory/work/` is the only execution queue. OpenSpec `tasks.md` is the human plan.
11. **One writer.** One IDE session writes `.factory/` at a time. Git merges concurrent edits.

Spend, publishing, deployment, and new accounts require `idefactory approve`. A `HALT` file stops `sync-tasks`, `next`, `run`, attempt mutations, and `complete`.
