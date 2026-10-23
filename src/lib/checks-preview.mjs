import fs from 'node:fs';
import path from 'node:path';
import { readText } from './layout.mjs';

/**
 * Print-only preview of missing registry entries.
 * Infers unit from package.json scripts.test. Does not write or spawn checks.
 * @param {string} project
 * @returns {string}
 */
export function previewChecks(project) {
  const profiles = readJson(path.join(project, '.factory', 'profiles.json')) || {};
  const registry = readJson(path.join(project, '.factory', 'checks.json')) || { checks: {} };
  const mapped = new Set(Object.keys(registry.checks || {}));
  const required = new Set();
  for (const profile of Object.values(profiles)) {
    if (!profile || !Array.isArray(profile.checks)) continue;
    for (const kind of profile.checks) {
      if (typeof kind === 'string') required.add(kind);
    }
  }
  const packageJson = readJson(path.join(project, 'package.json'));
  const hasTestScript = typeof packageJson?.scripts?.test === 'string' && packageJson.scripts.test.length > 0;
  const preview = { missing: [] };
  for (const kind of [...required].sort()) {
    if (mapped.has(kind)) continue;
    if (kind === 'unit' && hasTestScript) {
      preview.missing.push({
        kind: 'unit',
        argv: ['npm', 'test'],
        cwdPolicy: 'project',
        timeoutMs: 120000,
        artifacts: [],
      });
    } else {
      preview.missing.push({ kind });
    }
  }
  return JSON.stringify(preview, null, 2);
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}
