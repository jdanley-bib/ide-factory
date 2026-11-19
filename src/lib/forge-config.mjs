import fs from 'node:fs';
import path from 'node:path';
import { halted, readText, writeText } from './layout.mjs';

export const FORGE_PROVIDERS = ['github', 'azure-devops'];

export function configPath(project) {
  return path.join(project, '.factory', 'config.json');
}

export function readFactoryConfig(project) {
  const file = configPath(project);
  if (!fs.existsSync(file)) throw new Error('No .factory/config.json. Run idefactory init first.');
  return JSON.parse(readText(file));
}

export function writeFactoryConfig(project, config) {
  writeText(configPath(project), `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Forge settings. A missing entry means GitHub.
 * @param {string} project
 * @returns {{ provider: string, organization?: string, project?: string, repository?: string }}
 */
export function readForgeConfig(project) {
  const file = configPath(project);
  if (!fs.existsSync(file)) return { provider: 'github' };
  try {
    const forge = JSON.parse(readText(file)).forge;
    if (!forge || typeof forge !== 'object') return { provider: 'github' };
    return { provider: 'github', ...forge };
  } catch {
    return { provider: 'github' };
  }
}

/**
 * Errors for a forge entry. Absent config has none.
 * @param {object|undefined} forge
 * @returns {string[]}
 */
export function forgeConfigErrors(forge) {
  if (forge === undefined) return [];
  if (!forge || typeof forge !== 'object') return ['config.json forge must be an object'];
  if (!FORGE_PROVIDERS.includes(forge.provider)) {
    return [`config.json forge.provider must be one of ${FORGE_PROVIDERS.join(', ')}`];
  }
  if (forge.provider !== 'azure-devops') return [];
  const errors = [];
  for (const key of ['organization', 'project', 'repository']) {
    if (typeof forge[key] !== 'string' || !forge[key].trim()) {
      errors.push(`config.json forge.${key} is required for azure-devops`);
    }
  }
  if (typeof forge.organization === 'string' && forge.organization
    && !/^https:\/\//.test(forge.organization)) {
    errors.push('config.json forge.organization must be an https URL');
  }
  return errors;
}

/**
 * Write the forge entry from CLI flags. Writes nothing when invalid.
 * @param {string} project
 * @param {Record<string, string|boolean>} flags
 * @returns {object} the stored forge entry
 */
export function configureForge(project, flags) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const provider = stringFlag(flags.provider);
  const forge = provider === 'azure-devops'
    ? {
      provider,
      organization: stringFlag(flags.organization).replace(/\/+$/, ''),
      project: stringFlag(flags.project),
      repository: stringFlag(flags.repository),
    }
    : { provider };
  const errors = forgeConfigErrors(forge);
  if (errors.length) {
    throw new Error(`${errors.join('\n')}\nUsage: idefactory forge configure --provider github|azure-devops [--organization <url> --project <name> --repository <name>]`);
  }
  const config = readFactoryConfig(project);
  config.forge = forge;
  writeFactoryConfig(project, config);
  return forge;
}

export function stringFlag(value) {
  return typeof value === 'string' ? value.trim() : '';
}
