# Tasks

## 1. Document the approve principal flags

- [ ] 1.1 Add a failing test that the README approve example includes `--principal-provider` and `--principal-subject`, then add those flags to the example. The reviewer id is `jason-danley`. Do not write an approval file. Verify the test fails with `node --test test/readme-approve-example.test.mjs` before the README edit, and passes with the same command after it.
  - The README approve example names both principal flags.
  factory:
    verificationProfile: release
    checks: [unit]
