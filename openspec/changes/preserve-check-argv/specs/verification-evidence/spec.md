## ADDED Requirements

### Requirement: Registered argv runs exactly as stored
A registered check SHALL start with the stored executable and the stored elements as separate arguments, with no shell. Characters such as `|`, quotes, and a leading `--` in an element SHALL reach the program unchanged on every supported platform.

#### Scenario: Complex argv reaches the program
- **WHEN** a check is registered with the elements `--filter` and `Category=Unit | Category=Integration "x"`
- **AND** the check runs
- **THEN** the program receives those two elements unchanged and as two separate arguments

### Requirement: Spawn failures are actionable
When a registered executable cannot be started, the failure SHALL name the executable and the platform cause. Where the target is a Windows batch shim that cannot be started without a shell, the message SHALL say so and SHALL NOT report a test failure.

#### Scenario: Missing executable
- **WHEN** a registered check names an executable that does not exist
- **THEN** the result is an infrastructure failure that names the executable
- **AND** it is not recorded as a failing red

#### Scenario: Batch shim on Windows
- **WHEN** a registered check names a Windows batch shim that cannot start without a shell
- **THEN** the failure message names the shim and says it cannot be started without a shell
