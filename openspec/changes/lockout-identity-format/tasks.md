# Tasks

## 1. Shared identity validator

- [ ] 1.1 Add `src/lib/identity.mjs` with the format and `assertIdentity`, and add `test/identity.test.mjs`; verify `node --test test/identity.test.mjs` passes for dotted, email-style, and 128-character ids and fails for whitespace, newline, leading hyphen, 129 characters, empty, and boolean `true`, each with the label in the message.
- [ ] 1.2 Verify error text truncates and JSON-quotes long and control-character values by adding cases to the same test file and running it.

## 2. Attempt evidence ids

- [ ] 2.1 Call `assertIdentity` for supplied `implementerId`, `reviewerId`, and `securityReviewerId` in `assertSuppliedEvidence`; add tests in the existing attempt evidence test file and verify a dotted implementer id transitions, a bad reviewer id names `reviewerId` and leaves the attempt file byte-for-byte unchanged, and a stored out-of-format implementer id survives a later valid reviewer transition.

## 3. Lockout validation

- [ ] 3.1 Replace the inline regexes in `createLockout`, `resolveLockout`, and `parseLegacyLockoutFields` with `assertIdentity`, require `--reviewer`, and remove the `reviewer` default; extend `test/govern.test.mjs` and verify a dotted agent, a principal-style resolver, a bare `--agent`, an invalid `--resolver`, an omitted `--reviewer`, a recorded `reviewer-2`, and an invalid legacy `Agent:` line each behave as the human-governance spec scenarios say, with no files written on failure.
- [ ] 3.2 Add the exact-match exception via `recordedAttemptIdentities`; verify with tests that an identity stored on a pre-existing attempt is accepted and the attempt file is unchanged, that `eng one` is refused when only `Eng One` is stored, and that a resolver equal to the locked agent is still refused.
- [ ] 3.3 Run the lockout flows through `node src/cli.mjs` in a scratch project and verify the `lockout --agent` alias and `lockout create` agree on the same inputs.

## 4. Usage text and help

- [ ] 4.1 Move the lockout usage strings into one leaf module used by `command-help.mjs`, `govern.mjs`, and `run.mjs`; verify `test/command-help.test.mjs` still passes with the global help digest unchanged.
- [ ] 4.2 Add a test that compares the usage in each lockout error (create failure, resolve failure, unknown subcommand) with `idefactory help lockout create|resolve`; verify it fails when one string is edited and passes when restored.
- [ ] 4.3 Add the allowed identity characters to the `lockout create`, `lockout resolve`, and `attempt transition` help notes; verify with `node src/cli.mjs help lockout create` and `help attempt transition`, and that the help drift tests pass.

## 5. Documentation and adapters

- [ ] 5.1 Update the identity sentence in `README.md` and the lockout line in `templates/skills/factory-governance/SKILL.md` to state the allowed characters and that `--reviewer` is required; verify the existing README and guidance tests pass.
- [ ] 5.2 Regenerate the adapter copies and `templates/adapter-history.json` with `node scripts/build-adapter-history.mjs`; verify the adapter history, ownership, and render tests pass.

## 6. Integration

- [ ] 6.1 Run the full suite with `npm test` and `openspec validate lockout-identity-format --strict`; verify both exit zero.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
