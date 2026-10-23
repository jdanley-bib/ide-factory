# verification-evidence Specification

## MODIFIED Requirements

### Requirement: Source revision binding
A passing check record SHALL identify the git revision and clean worktree against which the check ran. Verification SHALL refuse to record a pass when the worktree is dirty or the revision cannot be resolved. Uncommitted paths under `.factory/approvals/` and uncommitted changes to `.factory/decisions.md` SHALL NOT by themselves make the worktree dirty. The factory SHALL NOT gitignore `.factory/approvals/`.

#### Scenario: Clean revision recorded
- **WHEN** a registered check exits zero on a clean git worktree
- **THEN** the evidence source revision equals that worktree HEAD

#### Scenario: Dirty worktree
- **WHEN** the worktree has uncommitted changes outside factory run-state and a check is run
- **THEN** verification does not record a passing result

#### Scenario: Approval files alone stay clean
- **WHEN** the only uncommitted paths are under `.factory/approvals/` or are `.factory/decisions.md`
- **AND** a registered check exits zero
- **THEN** verification records a passing result
- **AND** the evidence source revision equals HEAD

#### Scenario: Product changes stay dirty
- **WHEN** `.factory/decisions.md` is modified and a product source file is also modified
- **AND** a check is run
- **THEN** verification does not record a passing result
