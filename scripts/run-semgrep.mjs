#!/usr/bin/env node
/**
 * Shared Semgrep SAST entrypoint for local use and CI.
 * Fail-closed when the semgrep binary is absent; never downloads or installs it.
 * Escape hatch: --skip-semgrep (not used by baseline or SAST CI).
 */
import { spawnSync } from 'node:child_process';

const SEMGREP_ARGS = ['--error', '--metrics=off', '--config', 'p/javascript'];

const args = process.argv.slice(2);
const skip = args.includes('--skip-semgrep');

if (skip) {
  console.warn('warning: Semgrep scan skipped (--skip-semgrep)');
  console.log('SEMGREP_SKIP');
  process.exit(0);
}

const probe = spawnSync('semgrep', ['--help'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (probe.error || probe.status === null) {
  const detail = probe.error?.code === 'ENOENT'
    ? 'semgrep binary not found on PATH'
    : (probe.error?.message || 'semgrep is unavailable');
  console.error(`error: ${detail}; install Semgrep on PATH or pass --skip-semgrep`);
  process.exit(1);
}

const result = spawnSync('semgrep', SEMGREP_ARGS, {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`error: failed to run semgrep: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
