# Ceremonies

These are prompts for the IDE session, not an unattended scheduler.

- **Status.** Read team, decisions, the active OpenSpec change, and `.factory/work/`.
- **Plan.** Read a human-authored change and sync its unchecked tasks into `.factory/work/`.
- **Build.** Implement one work item, test first, record attempt evidence, then ask the reviewer.
- **Run.** Human starts `/factory-run` or `idefactory run`. The skill loops on orchestration requests until a stop condition. The CLI never launches a model.
- **Review.** A different role accepts or rejects. Rejection writes a lockout note.
- **Complete.** `idefactory complete` finalizes only when checks and reviewer gates pass.
- **Approval.** The human records spend, publish, or deploy decisions with `idefactory approve`.
