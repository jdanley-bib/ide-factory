# Design

## Context

See `proposal.md` for motivation. Today `profiles.json` stores a boolean `humanGate` on each verification profile. In the template and in this repo, only `release` is true. `security-sensitive` is false.

`run` defaults `--until` to `human-gate`, then returns at the first agent stage. The release check sits after that return, and it compares `verificationProfile` to the string `release` rather than reading `humanGate`. A true gate on any other profile never stops the run.

`verifying` may transition to `security-checking` or directly to `awaiting-review`. The direct edge is always legal, so security-sensitive work can skip the security stage. `verificationProfile` alone does not select the security reviewer, and that routing rule stays.

`idefactory approve` writes a markdown note under `.factory/approvals/` and appends `.factory/decisions.md`. The file has an id and a note. It does not record change, task, revision, action, approver, issuance, expiry, or policy version. `complete` does not read it.

The check registry maps `unit` only. Security-patterned kinds have no argv. Caller-supplied `security` payloads are already rejected. `complete` write order is unchanged by this change.

`human-gate` is already a named run result and is not a sticky session stop. A later process may continue the same session when the blocking condition has cleared.

## Goals / Non-Goals

**Goals:**

- Stop accept and complete on the profile boolean `humanGate`, including a true gate that is not named `release`.
- Authorize those actions only with a scoped approval bound to this attempt and the current clean source revision.
- Reject the `verifying` to `awaiting-review` bypass for security-sensitive work, and require passing CLI security evidence before review.
- Keep a false `humanGate` on non-sensitive work able to reach review without an approval.
- Leave an existing `profiles.json` byte-for-byte unchanged on re-init.

**Non-Goals:**

- Making `complete` transactional, adding a crash journal, or changing finalization write order.
- Resolving lockout, adding a lease, or enforcing one writer.
- Choosing SAST, secret-scan, dependency-audit, CI, SBOM, provenance, or telemetry tools, and adding registry argv for them.
- Binding approver strings to host identity, or adding a policy engine.
- Editing this repo's `.factory/profiles.json`, `.factory/config.json`, or other execution state.

## Decisions

### The profile boolean is the gate

`run` and `complete` read `profiles[verificationProfile].humanGate`. The string `release` is not special. `--until human-gate` remains the skill loop's stop name; it does not turn the gate on. A true boolean blocks the accept request and the complete command. A false boolean does not.

A missing profile, or a `humanGate` that is not a boolean, is treated as true. That fails closed without adding a stop reason outside the existing run vocabulary.

The accept block is the orchestration request that would move `awaiting-review` to `accepted`. The complete block is `idefactory complete`. Each needs its own approval action. `human-gate` does not close the session and is not sticky, so a later valid approval continues the same session.

Alternative considered: keep the gate behind `verificationProfile === 'release'`. Rejected because a true `humanGate` on any other profile would stay advisory.

### Approvals are scoped tokens

`approve` writes schema version 1 JSON under `.factory/approvals/` and still appends the id to `decisions.md`. The JSON contains the note. Required scope is change, task, source revision, action (`accept` or `complete`), approver, issuance, expiry, and policy version. Omitting any scope field writes nothing, including no `decisions.md` line.

The command binds source revision to the current clean HEAD, using the same factory-run-state cleanliness rule as `complete`. A dirty non-run-state tree or an unresolved HEAD refuses issuance. Issuance time is the command clock. The caller supplies expiry. Policy version is the built-in value 1, or `config.governance.policyVersion` when that value is a positive integer. The caller cannot choose the version. This change does not write that key into an existing config file.

At use time the token matches the attempt's change and task, the action being taken, and the current clean HEAD. The approver is a non-empty string and differs from the implementer id. It is not a host identity. Expiry is later than issuance, no more than 24 hours later, and the clock must be at or after issuance and before expiry.

An `accept` token does not authorize `complete`, and the reverse is also true. Existing markdown approval files are not tokens.

Alternative considered: treat any approval file whose note mentions the task as sufficient. Rejected because a note is not bound to revision, action, expiry, or policy version.

### Security review cannot be skipped

The trigger stays `securityProfile: security-sensitive` or a security-patterned check. `verificationProfile` alone does not trigger it. For triggered work, `verifying` to `awaiting-review` is rejected and the attempt file stays in `verifying`. Untriggered work keeps that edge.

`security-checking` to `awaiting-review` requires a passing CLI record for each required kind. Required kinds are the item's security-patterned checks. When the profile is `security-sensitive` and no check matches, the required kind is `threat-review`. A record counts only when the verification command stored it, the exit code is zero, it did not time out, it is not a red result, its command digest matches the registry, and its attempt id and source revision match the current clean HEAD. Caller-supplied security JSON stays rejected.

This change adds no registry argv. An unregistered kind fails closed through the existing registry rules. Tests register a temporary argv. `complete` also refuses security-required work that lacks that evidence, so a state skip cannot finalize the item.

Alternative considered: ship a local command that always exits zero for `threat-review`. Rejected because that would record a pass without a real check.

### Install defaults

The profile template sets `security-sensitive.humanGate` to true and leaves `release.humanGate` true. Other template profiles stay false. `writeIfMissing` keeps an existing `profiles.json` unchanged, including this repo's file. The five factory-run skill copies stop describing `human-gate` as the release profile alone.

## Risks / Trade-offs

- [Approver string is not a host identity] → The token still binds change, task, revision, action, expiry, and a different implementer id. Host binding stays out of scope.
- [A clock moved inside the 24-hour window stays valid] → Issuance in the future and expiry beyond 24 hours are rejected. Detecting a clock step inside the window is out of scope.
- [An existing `profiles.json` can leave `security-sensitive.humanGate` false] → Re-init does not rewrite it. The executable value is the file's boolean. New installs get true. This repo's installed file is left unchanged.
- [Security-sensitive work with only a `unit` check cannot reach review until `threat-review` has argv] → That is fail-closed. This change does not invent a scanner or a default pass.
- [A copied token is reused on another task or revision] → Scope match and clean HEAD equality reject it.
- [A note-only markdown file is treated as approval] → Missing scope fields do not authorize, and old files are not converted.
- [A red or caller-supplied security payload skips the stage] → Red does not count, and the transition API still rejects caller-supplied security results.
- [`human-gate` closes the session and requires `--new-run` after a valid approval appears] → The stop leaves the session open and is not sticky.

## Migration Plan

Existing `.factory/approvals/*.md` files are not tokens. A human re-issues a scoped approval for the change, task, action, and current revision. Do not convert old files and do not rewrite `decisions.md`.

Open attempts in `verifying` for security-sensitive work stay where they are. The next transition into review has to go through `security-checking` and a passing CLI security record. Do not rewrite attempt JSON.

Do not edit this repo's `.factory/profiles.json` or `.factory/config.json`. New projects receive the template booleans. An existing project keeps its booleans until a human edits that file. Policy version 1 applies when config omits `governance.policyVersion`.

Rollback is a revert of this change. Scoped files become ordinary records and are no longer required. The direct `verifying` to `awaiting-review` edge returns for security-sensitive work. No approval file and no `decisions.md` entry is deleted.

## Open Questions

None. The 24-hour maximum, the fail-closed missing boolean, and the `threat-review` kind for a sensitive item with no security-patterned check are specified above.
