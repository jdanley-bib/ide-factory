## ADDED Requirements

### Requirement: Attempt repoint requires the lease
`attempt repoint` SHALL require the writer lease whether it previews or applies, because it reads the same files that apply writes.

#### Scenario: Repoint under a held lease
- **WHEN** another process holds the writer lease and `attempt repoint` runs
- **THEN** the command fails naming the lease and writes nothing
