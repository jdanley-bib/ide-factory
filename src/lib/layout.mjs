import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const packageRoot = path.resolve(here, '../..');
export const templatesRoot = path.join(packageRoot, 'templates');

export const ROLES = ['lead', 'architect', 'engineer', 'reviewer', 'scribe'];

export const MARKER = '<!-- idefactory:owned -->';
export const SECTION_START = '<!-- idefactory:start -->';
export const SECTION_END = '<!-- idefactory:end -->';

export function projectDir(flags, rest, cwd, cmd) {
  if (flags.path) return path.resolve(cwd, flags.path);
  if (['init', 'upgrade', 'doctor', 'status', 'halt', 'resume'].includes(cmd) && rest[0]) {
    return path.resolve(cwd, rest[0]);
  }
  return path.resolve(cwd);
}

export function halted(project) {
  return fs.existsSync(path.join(project, 'HALT'));
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

export function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`);
}

export function writeIfMissing(file, content) {
  if (fs.existsSync(file)) return false;
  writeText(file, content);
  return true;
}

export function mergeMarked(existing, section) {
  const block = `${SECTION_START}\n${section.trim()}\n${SECTION_END}\n`;
  if (!existing || !existing.trim()) return block;
  const pattern = new RegExp(
    `${escapeRegExp(SECTION_START)}[\\s\\S]*?${escapeRegExp(SECTION_END)}\\n?`,
  );
  if (pattern.test(existing)) return existing.replace(pattern, block);
  return `${existing.replace(/\s*$/, '')}\n\n${block}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ledger(project, event, data = {}) {
  try {
    const dir = path.join(project, '.factory');
    if (!fs.existsSync(dir)) return;
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...data });
    fs.appendFileSync(path.join(dir, 'ledger.jsonl'), `${line}\n`);
  } catch {
    // Observability must not block the command.
  }
}
