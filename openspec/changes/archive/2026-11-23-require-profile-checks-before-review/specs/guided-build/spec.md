# Spec Delta

## ADDED Requirements

### Requirement: Required checks are the profile and item checks together
The required checks for a work item's attempt SHALL be the checks of its `verificationProfile` together with its own `checks`, with duplicates removed. The review handoff and completion SHALL use that same set. A `verificationProfile` that is not defined in `.factory/profiles.json` SHALL refuse the handoff and completion with an error that names it.

#### Scenario: Profile check missing from the item
- **WHEN** a `code` item lists only `unit` and its `verificationProfile` also requires `build`, and the attempt has a passing `unit` record but no `build` record
- **THEN** the attempt is not handed to the reviewer
- **AND** the request names `build` as missing and tells the engineer to record it with `idefactory verify run`

#### Scenario: Completion uses the profile too
- **WHEN** complete receives an accepted attempt whose item lists only `unit` and whose profile also requires `build`, and no passing `build` record exists at the current clean HEAD
- **THEN** completion fails naming `build`
- **AND** the work item remains unfinished

#### Scenario: Review entry is refused while a check is missing
- **WHEN** a transition from `verifying` or `security-checking` to `awaiting-review` is requested and a required check has no passing record at the current clean HEAD
- **THEN** the transition is refused
- **AND** the attempt state is unchanged

#### Scenario: Unknown profile
- **WHEN** an item's `verificationProfile` is not defined in `.factory/profiles.json`
- **THEN** the handoff and completion are refused with an error that names the profile
- **AND** the factory does not fall back to `unit`

#### Scenario: Unit-only profile
- **WHEN** an item's `verificationProfile` is `cli` with checks `["unit"]` and its only check has a passing record at the current clean HEAD
- **THEN** the attempt may be handed to review and completed
