# Tasks

## 1. Record every stop

- [ ] 1.1 Throw `BlockedError` with invariants `vacuous-red` and `retry-cap` from `verify run --red` with the existing messages; verify with `test/verification-evidence.test.mjs` asserting the invariant, the unchanged message text, and the unchanged exit code.
- [ ] 1.2 Add `noteStop` and call it from the end of `closeLatestRunSession` when a stop reason is set and from the CLI error handler for `BlockedError`; verify with tests that a vacuous red run records one `blocked.recorded` event and that a stop reached through two paths records once.
- [ ] 1.3 Append `command.error` with the command name and `code: unclassified` for a plain error, without the message text; verify with `test/event-log.test.mjs` that no error text appears in the event and the allowlist drops unknown fields.
- [ ] 1.4 Append `halt.resumed` from `idefactory resume`; verify with a test that the event is present after resume and absent after halt.

## 2. Count decisions

- [ ] 2.1 Add `EVENT_GATES` to `src/lib/authority.mjs` (or to `autonomy.mjs` with the approval and halt types until `truthful-authority-levels` lands) and derive `HUMAN_DECISION_EVENTS` from it; verify with a test asserting both sets agree.
- [ ] 2.2 Count `human`-level decision events as `policy-decision` interventions and list other levels under `decisions` without counting them; verify with `test/autonomy.test.mjs` for an approval, a halt resume, a lockout resolution, and a waiver.
- [ ] 2.3 Update the intervention categories so a lockout resolution is not a human policy decision and classification reads the option's level; verify with a test pinning each category.

## 3. Completeness

- [ ] 3.1 List `unrecordedStops` from closed run session files that have no matching `blocked.recorded` event, treating an unreadable session as listed-unreadable; verify with fixtures for a recorded stop, an unrecorded stop, a stop recorded under a different code, an `all-done` session, and a corrupt file.
- [ ] 3.2 Add `measurementComplete`, make `routineClean` depend on it, replace `noEvents` with `noStopEvents` and `eventsRead` while keeping `noEvents` as an alias, and raise the schema version to 2; verify with the report fixture from #54 (486 events, no stops, sessions with stops) producing `measurementComplete: false` and `routineClean: false`, and an empty project producing both true.
- [ ] 3.3 Update the text output to say when events were read but none were stops and to list unrecorded stops; verify with a text-output test for each case.

## 4. Help

- [ ] 4.1 Document the new fields, the alias, and the completeness rule in `autonomy report` help, leaving global usage unchanged; verify with `test/command-help.test.mjs`.
