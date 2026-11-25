# Spec Delta

## ADDED Requirements

### Requirement: Red failure entry is recorded
When a red run does not record an assertion failure, the factory SHALL append a structured failure entry under `evidence.redFailures` on the attempt. The entry SHALL carry the check kind, the classification, whether the run timed out, the timeout limit, the elapsed duration, the exit code, the spawn error code when one exists, the log digest, and the time recorded.

#### Scenario: Timed-out red run is recorded
- **WHEN** a red run's check times out after its registered timeout
- **THEN** the attempt gains a `redFailures` entry for that kind with `timedOut` true, the registered `timeoutMs`, the elapsed duration, and the log digest

#### Scenario: Command cannot start
- **WHEN** a red run's argv cannot be started
- **THEN** the `redFailures` entry records the spawn error code and no exit code

#### Scenario: Exit code is recorded
- **WHEN** a red run exits with a non-zero code that is not an assertion failure
- **THEN** the `redFailures` entry records that exit code

#### Scenario: Red record is unchanged
- **WHEN** a non-assertion red run records a `redFailures` entry
- **THEN** `evidence.reds` has no entry for that kind
- **AND** no evidence record is stored for that kind

### Requirement: Red failure error reports its diagnostics
The error thrown for a non-assertion red run SHALL begin with the classification, as the infrastructure-failure requirement already requires, and SHALL state the diagnostic detail for that run: the timeout limit and elapsed time for a timeout, the spawn error code for a command that cannot start, or the exit code otherwise.

#### Scenario: Timeout detail in the error
- **WHEN** a red run times out
- **THEN** the error names `infrastructure-failure` and states the timeout limit and elapsed time

#### Scenario: Spawn error detail in the error
- **WHEN** a red run's argv cannot be started with a spawn error code of `ENOENT`
- **THEN** the error names `infrastructure-failure` and states `ENOENT`

### Requirement: Raw output stays out of red records
The factory SHALL NOT store raw check output in the attempt, in the thrown error, or in any control event for a red run. The `redFailures` entry SHALL carry only a `sha256:` log digest of the captured output.

#### Scenario: Sentinel output is absent
- **WHEN** a red run's check writes a distinctive string to stdout or stderr and fails without an assertion
- **THEN** that string does not appear in the attempt file, the thrown error, or the control event log
- **AND** the `redFailures` entry carries a `sha256:` log digest

### Requirement: Timed-out red runs count toward the retry cap
A timed-out red run SHALL increment the retry counter for its check kind in the same way as any other infrastructure failure. The fourth occurrence for the same kind SHALL close the run session with `retry-cap` and SHALL throw an error that begins with `retry-cap:` and carries the same diagnostics as the infrastructure-failure error.

#### Scenario: Fourth timeout reaches the cap
- **WHEN** a red run for `unit` times out for the fourth time on the same attempt
- **THEN** the retry counter for `unit` is four
- **AND** the latest run session is closed with `retry-cap`
- **AND** the error begins with `retry-cap:` and states the timeout limit

#### Scenario: Earlier timeout does not close the session
- **WHEN** a red run for `unit` times out once on an attempt
- **THEN** the retry counter for `unit` is one
- **AND** the run session stays open
