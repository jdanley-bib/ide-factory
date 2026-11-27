# Tasks

## 1. Record and satisfaction

- [ ] 1.1 Add `src/lib/red-invalidation.mjs` with the record schema, the immutable file under `.factory/exceptions/red-invalid/`, digest binding, and the checks in D2; verify with `test/red-invalidation.test.mjs` asserting a stored record, refusal without a failing CLI red, refusal when the digest is already invalidated, refusal over a waiver or reuse, and an unchanged attempt file.
- [ ] 1.2 Make the red-satisfaction function treat an invalidated current red as no red and honor a later failing red that started after the invalidation; verify with tests for the invalidated red not satisfying, a later red satisfying, a red recorded before the invalidation not satisfying, and a missing history digest not satisfying.
- [ ] 1.3 Enforce at most two invalidations per kind on an attempt, naming the human waiver as the exit; verify with a test for the third attempt being refused and the first two files remaining.

## 2. Method and refusals

- [ ] 2.1 Let `proposeMethod` ignore a stored failing red that is invalidated while still refusing a valid one; verify with `test/red-method.test.mjs` for both and for the other refusals still applying.
- [ ] 2.2 Name `red invalidate` in the `red waive` refusal over an existing red and in the `method propose` refusal for a stored red; verify with tests asserting both messages.

## 3. Command and records

- [ ] 3.1 Add `idefactory red invalidate` with `--kind`, `--class`, `--note`, and `--by`, taking the writer lease and refusing under HALT; verify with a CLI test for success, a missing flag, an unknown class, and HALT, and with `test/writer-lease.test.mjs` for the new command.
- [ ] 3.2 Emit `red.invalidated` with codes only; verify with `test/event-log.test.mjs` asserting the note is absent from the event.
- [ ] 3.3 Show invalidations in status, the reviewer packet, and the verdict comment, beside any later red or method; verify with packet tests asserting the class, digest, identity, and the statement that the red was withdrawn.

## 4. Help and guidance

- [ ] 4.1 Register `red invalidate` help and update `red waive` help to point to it, leaving global usage unchanged; verify with `test/command-help.test.mjs`.
- [ ] 4.2 Update the `factory-build`, `factory-tdd`, `factory-verify`, and governance guidance and adapter copies to describe the command, its classes, and that it grants nothing; verify by regenerating adapters and running the adapter and guidance tests.
