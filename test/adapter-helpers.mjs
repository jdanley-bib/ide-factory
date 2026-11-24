import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { INSTRUCTION_FILES, SKILL_DIRS, digest, renderAdapters } from '../src/lib/adapters.mjs';
import { repoRoot } from './helpers.mjs';

export function walkTree(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  for (const name of fs.readdirSync(dir).sort()) {
    const next = rel ? `${rel}/${name}` : name;
    if (fs.statSync(path.join(root, next)).isDirectory()) out.push(...walkTree(root, next));
    else out.push(next);
  }
  return out;
}

export function hashTree(root) {
  return walkTree(root).map((rel) => `${rel}:${digest(fs.readFileSync(path.join(root, rel), 'utf8'))}`);
}

export function writeRendering(dir, entries, { crlf = false } = {}) {
  for (const item of entries) {
    if (item.scope !== 'file') continue;
    const file = path.join(dir, item.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crlf ? item.content.replace(/\n/g, '\r\n') : item.content);
  }
}

export function historyOf(entries) {
  const files = {};
  for (const item of entries) files[item.key] = [digest(item.content)];
  return { version: 1, files };
}

export function changedTemplates() {
  const templates = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-templates-'));
  fs.cpSync(path.join(repoRoot, 'templates'), templates, { recursive: true });
  fs.appendFileSync(path.join(templates, 'skills/factory-build/SKILL.md'), '\nNEW UPSTREAM LINE\n');
  fs.appendFileSync(path.join(templates, 'commands/factory-review.md'), '\nNEW REVIEW LINE\n');
  return templates;
}

export function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Record every rename while fn runs; optionally fail a rename whose target matches. */
export function spyRenames(fn, { failOn } = {}) {
  const original = fs.renameSync;
  const targets = [];
  fs.renameSync = (from, to) => {
    if (failOn && failOn(to)) throw new Error(`injected failure for ${to}`);
    targets.push(to);
    return original(from, to);
  };
  try {
    fn();
  } finally {
    fs.renameSync = original;
  }
  return targets;
}

export const LEGACY_RELEASE = path.join(repoRoot, 'test/fixtures/legacy-release');

/** The file layout of the release before the conditional review guidance, as an old install wrote it. */
export function legacyRelease() {
  const files = new Map();
  const readFrom = (rel) => fs.readFileSync(path.join(LEGACY_RELEASE, rel), 'utf8');
  for (const skill of fs.readdirSync(path.join(LEGACY_RELEASE, 'skills'))) {
    for (const rel of walkTree(path.join(LEGACY_RELEASE, 'skills'), skill)) {
      for (const dest of SKILL_DIRS) files.set(`${dest}/${rel}`, readFrom(`skills/${rel}`));
    }
  }
  for (const file of fs.readdirSync(path.join(LEGACY_RELEASE, 'commands'))) {
    const name = file.replace(/\.md$/, '');
    files.set(`.cursor/commands/${file}`, readFrom(`commands/${file}`));
    files.set(`.claude/commands/${file}`, readFrom(`commands/${file}`));
    files.set(`.github/prompts/${name}.prompt.md`, readFrom(`prompts/${name}.prompt.md`));
    files.set(`.cline/workflows/${file}`, readFrom(`workflows/${file}`));
  }
  files.set('.cursor/rules/factory.mdc', readFrom('rules/factory.mdc'));
  files.set('.github/agents/factory.agent.md', readFrom('rules/factory.agent.md'));
  files.set('.cline/rules/factory.md', readFrom('rules/factory.cline.md'));
  for (const rel of INSTRUCTION_FILES) files.set(rel, readFrom('AGENTS.md'));
  return files;
}

export function installLegacyRelease(dir, { crlf = false } = {}) {
  for (const [rel, content] of legacyRelease()) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, crlf ? content.replace(/\n/g, '\r\n') : content);
  }
}

export function currentRendering(rel, project = repoRoot) {
  const item = renderAdapters(project).find((entry) => entry.path === rel);
  if (!item) throw new Error(`not a generated path: ${rel}`);
  return item.content;
}
