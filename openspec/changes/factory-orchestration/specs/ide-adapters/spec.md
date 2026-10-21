# ide-adapters Delta

## ADDED Requirements

### Requirement: Factory run command
Init SHALL install a factory-run skill and slash/prompt command for Cursor, Copilot, and Claude that loops on `idefactory run`, spawns at most one IDE subagent per orchestration request when the host supports it, records evidence, and stops on CLI stop conditions. Skills SHALL NOT call Ollama or a model HTTP API.

#### Scenario: Run skill present
- **WHEN** init completes
- **THEN** a factory-run skill exists under the Cursor, Copilot, and Claude skill locations

### Requirement: Model profiles are hints
`.factory/config.json` SHALL include modelProfiles mapped per IDE adapter key. The CLI SHALL treat them as hints in orchestration requests and SHALL NOT launch a model.

#### Scenario: Profile in request
- **WHEN** next or run emits a packet for engineer
- **THEN** the output names a modelProfile hint from config
