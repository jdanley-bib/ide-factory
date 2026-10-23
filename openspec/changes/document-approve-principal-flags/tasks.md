# Tasks

## 1. Document the approve principal flags

- [ ] 1.1 Add a failing test that the README approve example includes `--principal-provider` and `--principal-subject`. Verify the test fails with `node --test test/readme-approve-example.test.mjs` before implementation.
  factory:
    verificationProfile: frontend-low
    checks: [unit]
- [ ] 1.2 Add those flags to the README approve example. The reviewer id for this task is `jason-danley`. Do not write an approval file. Verify with `node --test test/readme-approve-example.test.mjs`.
  - The README approve example names both principal flags.
  factory:
    verificationProfile: release
    checks: [unit]
    dependencies: ["1.1"]
