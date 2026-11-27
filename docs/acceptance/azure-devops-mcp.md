---
provider: azure-devops
transport: mcp
trigger: not-run
run: not-run
link: not-run
commit: not-run
pullRequest: not-run
time: not-run
producer: not-run
reviewer: not-run
behaviors:
  unattended-run-to-review-ready-pr: not-run
  recovered-transient-failure: not-run
  rejected-review-addressed-in-scope: not-run
  bounded-retry-and-loop-handling: not-run
  duplicate-claim-protection: not-run
  durable-decisions-across-handoffs: not-run
  clean-stop-for-unauthorized-effect: not-run
evidence:
---

# Azure DevOps over MCP acceptance record

Nothing here has run. Every behavior stays `not-run` until someone executes `docs/cloud-acceptance.md` against a real Cursor Automation and the Azure DevOps MCP transport, with a pull request reviewer other than the producing agent.

When a behavior passes, change its outcome to `passed` and add one line under `evidence:` with the identifier that proves it, for example `  unattended-run-to-review-ready-pr: https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>`. Fill in every top-level field from the real run.
