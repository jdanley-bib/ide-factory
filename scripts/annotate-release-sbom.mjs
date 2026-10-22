#!/usr/bin/env node
/**
 * Add lockfile digest and source revision to CycloneDX SBOM metadata.
 * Used after @cyclonedx/cyclonedx-npm generation in release CI and tests.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LOCKFILE_PROPERTY = 'lockfile-sha256';
const SOURCE_REVISION_PROPERTY = 'source-revision';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveSourceRevision() {
  if (process.env.SOURCE_REVISION) return process.env.SOURCE_REVISION.trim();
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.trim();
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git rev-parse HEAD failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function lockfileDigest(lockfilePath) {
  const digest = createHash('sha256').update(fs.readFileSync(lockfilePath)).digest('hex');
  return `sha256:${digest}`;
}

function upsertProperty(properties, name, value) {
  const list = properties ?? [];
  const index = list.findIndex((entry) => entry.name === name);
  if (index >= 0) {
    list[index] = { name, value };
  } else {
    list.push({ name, value });
  }
  return list;
}

const sbomArg = process.argv[2];
if (!sbomArg) {
  console.error('usage: node scripts/annotate-release-sbom.mjs <sbom-path>');
  process.exit(1);
}

const sbomPath = path.resolve(repoRoot, sbomArg);
const lockfilePath = path.join(repoRoot, 'package-lock.json');

if (!fs.existsSync(sbomPath)) {
  console.error(`error: SBOM not found: ${sbomPath}`);
  process.exit(1);
}
if (!fs.existsSync(lockfilePath)) {
  console.error(`error: lockfile not found: ${lockfilePath}`);
  process.exit(1);
}

const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));
sbom.metadata = sbom.metadata ?? {};
sbom.metadata.properties = upsertProperty(sbom.metadata.properties, LOCKFILE_PROPERTY, lockfileDigest(lockfilePath));
sbom.metadata.properties = upsertProperty(
  sbom.metadata.properties,
  SOURCE_REVISION_PROPERTY,
  resolveSourceRevision(),
);

fs.writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
