# Tasks

## 1. Read-only status JSON

- [x] 1.1 Add a failing test that `idefactory status --json` prints schema version 1, includes work counts and stop-reason metrics, excludes an approval note, and leaves `.factory/` unchanged. Verify the test fails with `node --test test/status-read-model.test.mjs` before implementation.
- [x] 1.2 Implement the JSON status path in the existing status command without changing text status. Verify with `node --test test/status-read-model.test.mjs`.

## 2. Local event log

- [x] 2.1 Add a failing test that successful completion, approval, and verification append redacted events, that status does not append one, and that a failed append after completion leaves the work item done and warns. Verify the test fails with `node --test test/event-log.test.mjs` before implementation.
- [x] 2.2 Append those events from the existing commands after their successful writes. Verify with `node --test test/event-log.test.mjs`.

## 3. Verified principal at policy version 2

- [x] 3.1 Add a failing test that policy version 1 still authorizes a schema version 1 approval, and policy version 2 writes nothing and authorizes nothing until a configured verifier confirms the principal. Verify the test fails with `node --test test/verified-principal.test.mjs` before implementation.
- [x] 3.2 Implement schema version 2 approvals and the shell-free verifier argv. Verify with `node --test test/verified-principal.test.mjs`.
- [x] 3.3 Add a failing test that policy version 2 completion rejects an unverified reviewer and lockout resolution rejects an unverified resolver, while the implementer id stays a local agent id. Verify the test fails with `node --test test/verified-principal.test.mjs` before implementation.
- [x] 3.4 Enforce those reviewer and resolver checks. Verify with `node --test test/verified-principal.test.mjs`.

## 4. Doctor warnings and check preview

- [x] 4.1 Add a failing test that doctor on a healthy policy version 1 install exits 0, warns about unverified approvals, and names an unmapped profile check kind. Verify the test fails with `node --test test/doctor-foundations.test.mjs` before implementation.
- [x] 4.2 Implement those doctor warnings without failing an otherwise healthy install. Verify with `node --test test/doctor-foundations.test.mjs`.
- [x] 4.3 Add a failing test that `idefactory checks preview` prints a `unit` entry from `package.json` when `unit` is missing, does not change an existing `checks.json`, and starts no check process. Verify the test fails with `node --test test/checks-preview.test.mjs` before implementation.
- [x] 4.4 Implement the preview command. Verify with `node --test test/checks-preview.test.mjs`.

## 5. Install policy

- [x] 5.1 Add a failing test that a new init sets governance policy version 2, a second init keeps policy version 1 when that value already exists, and a second init leaves `checks.json` byte-for-byte unchanged. Verify the test fails with `node --test test/install.test.mjs` before implementation.
- [x] 5.2 Implement that init behavior. Verify with `node --test test/install.test.mjs`.

## 6. Validation

- [x] 6.1 Run `node --test` and `npx openspec validate --all --strict`. Verify both exit 0.
