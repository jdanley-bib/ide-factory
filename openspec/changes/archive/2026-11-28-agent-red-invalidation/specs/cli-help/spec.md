## ADDED Requirements

### Requirement: Red invalidation help
`idefactory help red invalidate` SHALL describe the flags, the two classes, that the command grants nothing, the per-kind limit, and that a human waiver remains for a kind that cannot be satisfied. The global usage text SHALL NOT change.

#### Scenario: Invalidate help
- **WHEN** the user runs `idefactory help red invalidate`
- **THEN** the output names `--class`, `post-implementation`, `wrong-failure`, and the limit of two per kind

#### Scenario: Global text unchanged
- **WHEN** the user runs `idefactory help`
- **THEN** the output is the existing global usage text
