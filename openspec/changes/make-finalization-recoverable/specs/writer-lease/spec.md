# Spec Delta

## Purpose

Prevents concurrent CLI processes from racing factory mutations while allowing deterministic recovery when a command crashes and leaves an expired lease.

## ADDED Requirements

### Requirement: Exclusive writer lease
Before a mutating CLI command changes factory state, it SHALL acquire one project-scoped lease atomically. The lease SHALL contain schema version, lease id, command, owner process, acquisition time, and expiry time. While a valid lease exists, another mutating command SHALL exit non-zero with a clear lease-held error and SHALL NOT run its mutation.

#### Scenario: Concurrent writer refused
- **WHEN** one mutating command holds a non-expired lease and a second mutating command starts
- **THEN** the second command exits non-zero with a lease-held error
- **AND** its requested factory mutation does not occur

#### Scenario: One acquisition winner
- **WHEN** two mutating commands race to acquire an absent lease
- **THEN** exactly one command acquires it
- **AND** the other exits without running its mutation

### Requirement: Mutating command scope
Init, upgrade, sync-tasks, next, run, attempt start or transition, verify run or import, complete, approve, reject, lockout create or resolve, and resume SHALL require the writer lease. Status, doctor, help, and attempt show SHALL be read-only and SHALL NOT acquire it. Halt SHALL remain available as a safety override while a lease is held.

#### Scenario: Read-only command during mutation
- **WHEN** status, doctor, or attempt show runs while a writer lease is held
- **THEN** it runs without acquiring or deleting that lease

#### Scenario: Halt during mutation
- **WHEN** halt runs while a writer lease is held
- **THEN** the HALT file is set without stealing or deleting the lease

### Requirement: Lease release
The owning command SHALL remove its lease on normal success or handled error only when the stored lease id still equals the id it acquired. It SHALL NOT remove a successor's lease.

#### Scenario: Error releases lease
- **WHEN** a leased command exits through a handled error
- **THEN** a later mutating command can acquire the lease

#### Scenario: Owner mismatch
- **WHEN** the lease id changes before the original owner releases
- **THEN** the original owner does not delete the changed lease

### Requirement: Expired lease recovery
A lease SHALL expire five minutes after acquisition. A contender SHALL NOT steal a non-expired lease. For an expired lease, contenders SHALL use an atomic stale-lease takeover so exactly one acquires a new lease. A malformed or unsupported lease SHALL fail closed with a clear recovery error and SHALL NOT be deleted automatically.

#### Scenario: Expired lease reclaimed
- **WHEN** the lease expiry is in the past and two mutating commands contend
- **THEN** exactly one command acquires a new lease
- **AND** the other exits without mutation

#### Scenario: Corrupt lease blocks
- **WHEN** the lease record is unreadable or has an unsupported schema
- **THEN** a mutating command exits with a lease-recovery error
- **AND** it does not delete the record or run its mutation
