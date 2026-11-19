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

export const BOARD_STATE_DEFAULTS = {
  new: 'New',
  ready: 'Ready for Factory',
  inProgress: 'In Progress',
  waiting: 'Waiting on Human',
  blocked: 'Blocked',
  inReview: 'In Review',
  readyForHumanReview: 'Ready for Human Review',
};

const BOARD_DEFAULTS = {
  provider: 'azure-devops',
  workItemType: 'User Story',
  tag: 'factory',
  changeField: 'Custom.OpenSpecChange',
  branchField: 'Custom.FactoryBranch',
  runUrlField: 'Custom.FactoryRunUrl',
};

const BOARD_STATE_FLAGS = {
  'state-new': 'new',
  'state-ready': 'ready',
  'state-in-progress': 'inProgress',
  'state-waiting': 'waiting',
  'state-blocked': 'blocked',
  'state-in-review': 'inReview',
  'state-ready-for-human-review': 'readyForHumanReview',
};

/**
 * Board settings with defaults filled, or null when the board is not configured.
 * @param {string} project
 * @returns {object|null}
 */
export function readBoardConfig(project) {
  const file = configPath(project);
  if (!fs.existsSync(file)) return null;
  let board;
  try {
    board = JSON.parse(readText(file)).board;
  } catch {
    return null;
  }
  if (!board || typeof board !== 'object') return null;
  return {
    ...BOARD_DEFAULTS,
    ...board,
    states: { ...BOARD_STATE_DEFAULTS, ...(board.states || {}) },
  };
}

/**
 * Errors for a board entry. Absent config has none.
 * @param {object|undefined} board
 * @returns {string[]}
 */
export function boardConfigErrors(board) {
  if (board === undefined) return [];
  if (!board || typeof board !== 'object') return ['config.json board must be an object'];
  const errors = [];
  const provider = board.provider ?? BOARD_DEFAULTS.provider;
  if (provider !== 'azure-devops') errors.push('config.json board.provider must be azure-devops');
  for (const key of ['organization', 'project']) {
    if (typeof board[key] !== 'string' || !board[key].trim()) {
      errors.push(`config.json board.${key} is required`);
    }
  }
  if (typeof board.organization === 'string' && board.organization
    && !/^https:\/\//.test(board.organization)) {
    errors.push('config.json board.organization must be an https URL');
  }
  const states = { ...BOARD_STATE_DEFAULTS, ...(board.states || {}) };
  for (const [key, value] of Object.entries(states)) {
    if (typeof value !== 'string' || !value.trim()) errors.push(`config.json board.states.${key} must be a non-empty string`);
  }
  for (const [key, value] of Object.entries(states)) {
    if (key !== 'ready' && value === states.ready) {
      errors.push(`config.json board.states.ready must differ from board.states.${key}`);
    }
  }
  return errors;
}

/**
 * Write the board entry from CLI flags, filling defaults. Writes nothing when invalid.
 * @param {string} project
 * @param {Record<string, string|boolean>} flags
 * @returns {object}
 */
export function configureBoard(project, flags) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const config = readFactoryConfig(project);
  const previous = config.board && typeof config.board === 'object' ? config.board : {};
  const board = {
    ...BOARD_DEFAULTS,
    ...previous,
    states: { ...BOARD_STATE_DEFAULTS, ...(previous.states || {}) },
  };
  const fields = {
    organization: 'organization',
    project: 'project',
    'work-item-type': 'workItemType',
    tag: 'tag',
    'change-field': 'changeField',
    'branch-field': 'branchField',
    'run-url-field': 'runUrlField',
  };
  for (const [flagName, key] of Object.entries(fields)) {
    const value = stringFlag(flags[flagName]);
    if (value) board[key] = value;
  }
  for (const [flagName, key] of Object.entries(BOARD_STATE_FLAGS)) {
    const value = stringFlag(flags[flagName]);
    if (value) board.states[key] = value;
  }
  if (typeof board.organization === 'string') board.organization = board.organization.replace(/\/+$/, '');
  const errors = boardConfigErrors(board);
  if (errors.length) {
    throw new Error(`${errors.join('\n')}\nUsage: idefactory board configure --organization <url> --project <name> [--work-item-type <type>] [--tag <tag>] [--change-field <ref>] [--state-ready <name>] ...`);
  }
  config.board = board;
  writeFactoryConfig(project, config);
  return board;
}
