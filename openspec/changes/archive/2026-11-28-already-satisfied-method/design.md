# Design

## Context

`proposeMethod` accepts `no-red` for attempts in `planned`, `assigned`, or `implementing`. It refuses a stored failing red, an explicit `factory.taskType`, a prior method rejection, and, for `behavior-preserving`, test paths that are not tracked. The `vacuous-red` diagnostic is a `redFailures` entry holding kind, classification, exit code, log digest, executable, and time. It has no revision and no command digest. `startAttempt` writes `baseRev: null` and nothing captures where the attempt began.

## Decisions

### D1. The class is a claim the factory can check

`already-satisfied` says: "for each covered kind, the registered check already passes, and this attempt changed only tests." Two facts support it.

1. **Observed pass.** Each covered kind has at least one `redFailures` entry with classification `vacuous-red`, recorded by `verify run --red` (so the CLI ran the registered argv), whose `commandDigest` equals the digest of the check's current registered argv, and whose `sourceRevision` is not newer than the attempt's current HEAD. The proposal copies the latest such entry per kind into the method record as `observedPass`.
2. **Test-only diff.** The set of changed paths since the attempt's `startRevision` is a subset of the cited `--test-path` entries plus factory run state.

The agent supplies only the paths and the rationale. It cannot supply the pass.

### D2. Start revision

`startAttempt` records `startRevision` as `git rev-parse HEAD` when the project is a git repository with at least one commit, and null otherwise. The field is new, so earlier attempts have none, and the class is refused for them with a message saying so. `baseRev` keeps its meaning. A new name avoids changing what existing evidence readers expect.

### D3. Net diff computation

Changed paths are the union of `git diff --name-only <startRevision>` (tracked changes, staged or not), `git ls-files --others --exclude-standard` (new files), and deletions reported by the diff. Paths under the existing run-state prefixes (`.factory/work/`, `.factory/mcp/`, `.factory/methods/`, `.factory/blocked/`, `.factory/exceptions/`, and the attempt and orchestration directories) are ignored. A path is allowed when it equals a cited test path or lies under a cited directory. The refusal lists up to ten offending paths. Test paths need to exist but not be tracked, because the point is usually a test file the attempt just created.

### D4. Record contents

The method record gains, for this class only: `observedPass` (per kind: `logDigest`, `commandDigest`, `sourceRevision`, `recordedAt`), `testPaths`, `startRevision`, and `changedPaths` (bounded to 50, with a count). It is immutable like every method record. Raw output is never stored; only digests.

### D5. Completion rechecks

At the transition to `accepted` and at `complete`, an attempt whose method is `already-satisfied` has the D3 computation re-run against `startRevision` and the attempt's accepted source revision. If a path outside the cited tests changed, the transition is refused naming those paths. This closes the hole where the agent proposes, then edits production code. The agent's remedy is to start a new attempt, which defaults to red-first.

### D6. Explicit task type

Existing behavior refuses any `no-red` proposal when `factory.taskType` is explicit. For this class the refusal is lifted, because an explicit "code" classification says the work is code, not that a red must precede tests that already pass. All other refusals apply: a stored failing red for a covered kind, a prior method rejection, a kind the item does not require, and a lightweight item. The existing review still has to accept the method.

### D7. Vacuous diagnostics bind to evidence

`redFailureDiagnostics` gains `commandDigest` and `sourceRevision` (null when there is no git revision). Existing entries without them cannot support D1, so the agent reruns the red once. The retry counter treats the rerun like any other, so the cap still bounds the loop.

### D8. Report and hints

`BLOCKED_TABLE['vacuous-red']` lists `propose-already-satisfied` first, with `--reason already-satisfied --test-path <path>`. It is available when the attempt is in a proposal state and `redFailures` holds a vacuous entry. The hint in `orchestrate` appears whenever a proposal would be accepted, not only for inferred items. The table's `when` text for `propose-method` is corrected to the states the code accepts, which closes a mismatch between what the report advertises and what the command allows.

### D9. Review

The existing `method review` is unchanged. The reviewer packet adds: the observed passes, the diff check result, the cited paths, and one instruction: reject the method if the cited tests do not cover the task's acceptance criteria. The reviewer cannot be the proposer, as before.

## Risks and trade-offs

- An agent could add a trivially passing test and call the work satisfied. The class constrains what the diff may contain but not the quality of the test. The independent review and the fact that a passing attestation is still required are the controls, and they match how `behavior-preserving` already works.
- A path glob would be more convenient than exact paths and directories. It would also let `**` swallow production code. Exact paths and directories keep the rule easy to audit.
- Untracked-file detection depends on `.gitignore`. An ignored production file would not appear. That matches what the commit would contain, which is what the review sees.
