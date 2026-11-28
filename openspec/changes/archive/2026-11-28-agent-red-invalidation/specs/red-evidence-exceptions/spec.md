## MODIFIED Requirements

### Requirement: Waiver refused over an existing red
`red waive` without `--invalid-red` SHALL refuse a kind for which a failing CLI red is stored. The refusal SHALL name that red, SHALL point to `red invalidate` for a red that is not genuine, and SHALL point to `--invalid-red` for a human acceptance of such a red. It SHALL record nothing.

#### Scenario: Waiver over a genuine red
- **WHEN** waive runs for `unit` on an attempt with a failing CLI red for `unit` and without `--invalid-red`
- **THEN** the command exits non-zero, names the existing red, and names `--invalid-red`
- **AND** no exception file is written and the attempt is unchanged

#### Scenario: Refusal names the agent command
- **WHEN** the same refusal is printed
- **THEN** it also names `red invalidate`

### Requirement: Guidance matches the waiver rules
The help for `red waive`, the README, and the shipped `factory-build`, `factory-tdd`, `factory-verify`, and governance guidance SHALL name `--invalid-red` and `red invalidate`, SHALL state that a post-implementation red is invalidated and not treated as genuine, and SHALL state that a waiver does not replace passing verification, distinct review, or lockouts.

#### Scenario: Help names the flags
- **WHEN** `idefactory help red waive` runs
- **THEN** its output names `--invalid-red` and `--acknowledge-not-stuck`

#### Scenario: Shipped copies name the flag
- **WHEN** each shipped copy of the `factory-build` skill is read
- **THEN** it names `--invalid-red` and `red invalidate` and states that a waiver does not replace passing verification, distinct review, or lockouts
