# Tasks

## 1. The table

- [x] 1.1 Add `src/lib/authority.mjs` with the frozen gate map (level, enforcement, reason) and a lookup that returns the actor for a level; verify with `test/authority.test.mjs` asserting each gate in design D2 has the stated level and enforcement and that the map is frozen.
- [x] 1.2 Make `option()` in `src/lib/blocked-states.mjs` read the actor, level, and enforcement from the table by gate id, and move waive red, reuse red, resolve lockout, and apply reconciliation to `independent-agent`, and `--new-run` within cap and accept baseline to `implementing-agent`; verify with `test/blocked-states.test.mjs` for each option's actor and `authority` field.
- [x] 1.3 Assert every blocked-table option has a table entry and every table entry is used or listed as reserved; verify with a consistency test that fails when one is added without the other.

## 2. Raise-only override

- [x] 2.1 Read `authority.<gate>: "human"` from config, accepting only raises for known gates, reporting it with `source: "config"`, and ignoring anything else; verify with tests for a raise, an attempt to lower, an unknown gate, and a non-`human` value.
- [x] 2.2 Report ignored entries from `doctor`; verify with a doctor test naming the ignored key.

## 3. Baseline acceptance

- [x] 3.1 Require `--reason` with `--accept-baseline` and record the HEAD, reason, and time with the baseline result; verify with `test/orchestrate.test.mjs` for acceptance with a reason, a refusal without one, and the record in the session.
- [x] 3.2 Show an accepted baseline and its reason in the reviewer packet; verify with a packet test.

## 4. Wording

- [x] 4.1 Change the refusal messages in red waive, red reuse, lockout resolve, and reconcile apply to name the identity that is needed and reserve "a person" for human gates; verify with tests asserting the exact phrases and that each refusal still triggers on the same conditions as before.
- [x] 4.2 State the level and enforcement in the help for each gated command from the table, and add an authority section to the `run` help; verify with `test/command-help.test.mjs` and a check that help text and the table agree.
- [x] 4.3 Pin the autonomy classification of the moved options; verify with `test/autonomy.test.mjs` asserting a stop whose first usable option is independent does not count as a human-actor stop.
