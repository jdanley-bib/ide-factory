import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';

const DEFAULT_POLICY_VERSION = 1;

export function readPolicyVersion(project) {
  const configPath = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(configPath)) return DEFAULT_POLICY_VERSION;
  try {
    const config = JSON.parse(readText(configPath));
    const version = config?.governance?.policyVersion;
    if (Number.isInteger(version) && version > 0) return version;
  } catch {
    // fall through
  }
  return DEFAULT_POLICY_VERSION;
}

/**
 * Run the project-configured verifier without a shell.
 * @param {string} project
 * @param {{ provider?: string, subject?: string }} claim
 * @returns {{ provider: string, subject: string, issuer: string, verifiedAt: string }}
 */
export function confirmPrincipal(project, claim) {
  const provider = claim?.provider;
  const subject = claim?.subject;
  if (typeof provider !== 'string' || provider.length === 0
    || typeof subject !== 'string' || subject.length === 0) {
    throw new Error('verified principal requires provider and subject');
  }
  const verifier = readVerifier(project);
  if (verifier.provider && verifier.provider !== provider) {
    throw new Error('principal provider does not match the configured verifier');
  }
  const result = spawnSync(verifier.argv[0], verifier.argv.slice(1), {
    cwd: project,
    shell: false,
    timeout: verifier.timeoutMs,
    encoding: 'utf8',
    env: {
      ...process.env,
      FACTORY_PRINCIPAL_PROVIDER: provider,
      FACTORY_PRINCIPAL_SUBJECT: subject,
    },
  });
  if (result.error || result.status !== 0) {
    throw new Error('principal verifier did not confirm the subject');
  }
  let body;
  try {
    body = JSON.parse(result.stdout);
  } catch {
    throw new Error('principal verifier returned invalid JSON');
  }
  if (body?.provider !== provider || body?.subject !== subject
    || typeof body.issuer !== 'string' || body.issuer.length === 0) {
    throw new Error('principal verifier did not confirm the subject');
  }
  return {
    provider,
    subject,
    issuer: body.issuer,
    verifiedAt: new Date().toISOString(),
  };
}

export function configuredPrincipalProvider(project) {
  return readVerifier(project).provider;
}

function readVerifier(project) {
  const configPath = path.join(project, '.factory', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('policy version 2 requires a configured principal verifier');
  }
  let config;
  try {
    config = JSON.parse(readText(configPath));
  } catch {
    throw new Error('policy version 2 requires a configured principal verifier');
  }
  const verifier = config?.governance?.principalVerifier;
  if (!verifier || !Array.isArray(verifier.argv) || verifier.argv.length === 0
    || typeof verifier.argv[0] !== 'string') {
    throw new Error('policy version 2 requires a configured principal verifier');
  }
  const timeoutMs = Number.isInteger(verifier.timeoutMs) && verifier.timeoutMs > 0
    ? verifier.timeoutMs
    : 5000;
  const provider = typeof verifier.provider === 'string' ? verifier.provider : '';
  return { argv: verifier.argv, timeoutMs, provider };
}
