# Proposal

## Why

`idefactory attempt transition` silently ignores evidence keys it does not read. A reviewer who writes the documented review shape wrong, for example nesting `notes` under `review`, gets a successful transition whose stored review has empty notes. The reviewer's reasoning is lost and nothing says so (issue #35). The same happens to a misspelled key, to a non-string `notes` value that is stored as an object, and to a `verdict` on a rejection that disagrees with the transition.

## What Changes

- **BREAKING**: `attempt transition` rejects evidence that has a key outside the supported set, names that key in the error, and leaves the attempt file unchanged. A key named `review` is refused with a hint to put review text in top-level `notes`.
- Each supported key is type-checked: `reviewerId`, `implementerId`, `securityReviewerId`, `notes`, `verdict`, and `baseRev` must be strings, and `changedFiles` must be an array of strings. A value of the wrong type fails before any write.
- A `verdict` that conflicts with the transition is rejected for a reviewer's accept or reject, matching the check that already exists for `accepted`.
- The check applies to evidence supplied on the command line (`--evidence` and `--evidence-file`). Internal transitions that the CLI makes itself are unaffected.
- Regression tests cover the nested `review` form (rejected, attempt unchanged) and the documented top-level `notes` form (accepted, notes stored).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `guided-build`: adds a requirement that transition evidence is validated against its supported keys and shapes before the attempt changes.

## Impact

- `src/lib/evidence-input.mjs` and the `attempt transition` branch of `src/lib/run.mjs`, where evidence enters the CLI.
- `src/lib/attempt.mjs`: no change to stored fields for valid evidence.
- Tests in `test/evidence-file.test.mjs` and `test/orchestration.test.mjs`.
- Callers that pass extra keys to `attempt transition` will fail with a clear message. The repository's own examples and the work packet already use only supported keys.
- The packet and skills, which tell the implementer to use `--evidence-file`, need no change.

## Out of Scope

- Repairing attempts already finalized or rejected with empty notes. Their stored evidence is unchanged.
- Changing the shape of stored attempt evidence, or adding fields to it.
- Validating `--evidence` for internal transitions such as `assigned` or `finalize-failed`, which the CLI never receives as user input.
- Warning-only behavior. Unsupported evidence fails; it is not accepted with a warning.
- Changing the verdict or review rules for security-stage transitions beyond what the existing checks already enforce.
