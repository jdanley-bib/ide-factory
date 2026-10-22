# release-provenance Specification

## Purpose
Produces a release SBOM and SLSA provenance that identify the lockfile and the exact SBOM bytes that were built.

## Requirements

### Requirement: Release SBOM
A release workflow SHALL produce a CycloneDX SBOM containing every locked production dependency and every locked development dependency. The SBOM metadata SHALL include the lockfile digest and the source revision.

#### Scenario: Locked dependencies are listed
- **WHEN** a release workflow runs for a tagged revision
- **THEN** the SBOM lists each locked production and development dependency
- **AND** its metadata includes that revision's lockfile digest

#### Scenario: Non-release CI does not publish
- **WHEN** the baseline pull-request job runs
- **THEN** it does not publish a release or an npm package

### Requirement: Provenance subject
The release workflow SHALL attach SLSA v1 build provenance whose subject digest equals the digest of the generated SBOM. The provenance SHALL name the source repository and the source revision.

#### Scenario: Subject matches the SBOM
- **WHEN** provenance is generated for a release SBOM
- **THEN** the provenance subject digest equals the SBOM digest
- **AND** the provenance names the repository and source revision

#### Scenario: Provenance level
- **WHEN** the provenance statement is produced
- **THEN** it claims SLSA v1 build provenance
- **AND** it does not claim SLSA Build L2 or L3

### Requirement: Release permissions
The release workflow SHALL request identity-token write only for attestation and SHALL pin every third-party action to a full commit SHA.

#### Scenario: Attestation permission
- **WHEN** the release workflow is read
- **THEN** attestation is the only reason it requests identity-token write
- **AND** every third-party action is pinned to a full commit SHA
