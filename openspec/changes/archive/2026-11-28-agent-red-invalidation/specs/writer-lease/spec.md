## ADDED Requirements

### Requirement: Red invalidation requires the lease
`red invalidate` SHALL require the writer lease.

#### Scenario: Invalidate under a held lease
- **WHEN** another process holds the writer lease and `red invalidate` runs
- **THEN** the command fails naming the lease and writes nothing
