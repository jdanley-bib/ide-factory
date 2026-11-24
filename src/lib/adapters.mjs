import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  MARKER,
  SECTION_END,
  SECTION_START,
  readText,
  templatesRoot,
} from './layout.mjs';

export const SKILL_DIRS = [
  '.cursor/skills',
  '.claude/skills',
  '.github/skills',
  '.agents/skills',
  '.cline/skills',
];

export const INSTRUCTION_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
];

export const COMMANDS = [
  {
    name: 'factory-status',
    description: 'Show factory team, OpenSpec, and work queue status',
  },
  {
    name: 'factory-plan',
    description: 'Staff a human-authored OpenSpec change into .factory/work',
  },
  {
    name: 'factory-build',
    description: 'Implement the next factory work item with the factory-build skill',
  },
  {
    name: 'factory-run',
    description: 'Bounded multi-task factory orchestration until a stop condition',
  },
  {
    name: 'factory-full',
    description: 'One-stop factory: explore, propose if needed, plan, and run',
  },
  {
    name: 'factory-review',
    description: 'Review the current factory task as a different role',
  },
  {
    name: 'factory-setup',
    description: 'Confirm the test command and governance mode, then record them',
  },
];

/**
 * Normalized digest: CRLF becomes LF and the text ends with exactly one newline.
 * @param {string} text
 * @returns {string}
 */
export function digest(text) {
  const normalized = `${String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '')}\n`;
  return createHash('sha256').update(normalized).digest('hex');
}

function posix(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}

function walkFiles(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  for (const name of fs.readdirSync(dir).sort()) {
    const next = rel ? `${rel}/${name}` : name;
    if (fs.statSync(path.join(root, next)).isDirectory()) out.push(...walkFiles(root, next));
    else out.push(next);
  }
  return out;
}

function withNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

export const EXTENSIONS_DIR = '.factory/extensions';
const EXTENSION_START = '<!-- idefactory:extension:start -->';
const EXTENSION_END = '<!-- idefactory:extension:end -->';

/** The project's extension section for one generated name, or '' when there is none. */
function extensionSection(project, group, name) {
  const rel = `${EXTENSIONS_DIR}/${group}/${name}.md`;
  const file = path.join(project, rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return '';
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  if (text === '') return '';
  return [
    EXTENSION_START,
    '## Project extensions',
    '',
    `The text below comes from \`${rel}\`. Where it conflicts with the factory text above, follow the text below.`,
    '',
    text,
    EXTENSION_END,
    '',
  ].join('\n');
}

function entry(filePath, content, kind, name, scope = 'file') {
  return {
    path: filePath,
    key: scope === 'section' ? `${filePath}#section` : filePath,
    content,
    kind,
    name,
    scope,
  };
}

/**
 * The full desired set of generated adapter files and instruction sections.
 * @param {string} project
 * @param {{ templates?: string }} [options]
 * @returns {{ path: string, key: string, content: string, kind: string, name: string, scope: 'file'|'section' }[]}
 */
export function renderAdapters(project, options = {}) {
  const templates = options.templates || templatesRoot;
  const entries = [];

  const skillsRoot = path.join(templates, 'skills');
  for (const name of fs.readdirSync(skillsRoot).sort()) {
    const from = path.join(skillsRoot, name);
    if (!fs.statSync(from).isDirectory()) continue;
    for (const rel of walkFiles(from)) {
      let content = fs.readFileSync(path.join(from, rel), 'utf8');
      if (rel === 'SKILL.md') {
        const extra = extensionSection(project, 'skills', name);
        if (extra) content = `${withNewline(content)}\n${extra}`;
      }
      for (const dest of SKILL_DIRS) {
        entries.push(entry(posix(dest, name, rel), content, 'skill', name));
      }
    }
  }

  for (const command of COMMANDS) {
    const body = readText(path.join(templates, 'commands', `${command.name}.md`)).trim();
    const extra = extensionSection(project, 'commands', command.name);
    const owned = `${body}${extra ? `\n\n${extra.trimEnd()}` : ''}\n\n${MARKER}\n`;
    const plain = `---\ndescription: ${command.description}\n---\n\n${owned}`;
    entries.push(entry(`.cursor/commands/${command.name}.md`, plain, 'command', command.name));
    entries.push(entry(`.claude/commands/${command.name}.md`, plain, 'command', command.name));
    entries.push(entry(
      `.github/prompts/${command.name}.prompt.md`,
      `---\ndescription: ${command.description}\nagent: factory\n---\n\n${owned}`,
      'command',
      command.name,
    ));
    entries.push(entry(`.cline/workflows/${command.name}.md`, owned, 'command', command.name));
  }

  const ruleExtra = extensionSection(project, 'rules', 'factory');
  const withRule = (text) => (ruleExtra ? `${withNewline(text)}\n${ruleExtra}` : withNewline(text));
  entries.push(entry(
    '.cursor/rules/factory.mdc',
    withRule(readText(path.join(templates, 'cursor/rules/factory.mdc'))),
    'rule',
    'factory',
  ));
  entries.push(entry(
    '.github/agents/factory.agent.md',
    withRule(readText(path.join(templates, 'copilot/factory.agent.md'))),
    'agent',
    'factory',
  ));
  entries.push(entry(
    '.cline/rules/factory.md',
    withRule(readText(path.join(templates, 'cline/rules/factory.md'))),
    'rule',
    'factory',
  ));

  const section = readText(path.join(templates, 'fragments/instructions.md'));
  const block = `${SECTION_START}\n${section.trim()}\n${SECTION_END}\n`;
  for (const file of INSTRUCTION_FILES) {
    entries.push(entry(file, block, 'instructions', 'instructions', 'section'));
  }

  return entries;
}

const MANIFEST_VERSION = 1;

export function manifestPath(project) {
  return path.join(project, '.factory', 'adapters.json');
}

function toolVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(templatesRoot), 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

/**
 * @param {string} project
 * @returns {{ version: number, tool?: string, files: Record<string, { digest: string, pinned?: boolean }> }}
 */
export function readManifest(project) {
  const file = manifestPath(project);
  if (!fs.existsSync(file)) return { version: MANIFEST_VERSION, files: {} };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read .factory/adapters.json: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || parsed.version !== MANIFEST_VERSION) {
    throw new Error(`.factory/adapters.json has an unsupported version (expected ${MANIFEST_VERSION}).`);
  }
  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    throw new Error('.factory/adapters.json must hold a "files" object.');
  }
  return parsed;
}

function manifestBody(manifest) {
  const files = {};
  for (const key of Object.keys(manifest.files).sort()) files[key] = manifest.files[key];
  return `${JSON.stringify({ version: MANIFEST_VERSION, tool: toolVersion(), files }, null, 2)}\n`;
}

/** Write a file through a temporary file in the same directory and a rename. */
export function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.idefactory-tmp`);
  try {
    fs.writeFileSync(temp, text);
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

/**
 * Writes the manifest through a temporary file in the same directory and a rename.
 * @param {string} project
 * @param {{ files: Record<string, object> }} manifest
 * @returns {boolean} whether the file changed
 */
export function writeManifest(project, manifest) {
  const file = manifestPath(project);
  const body = manifestBody(manifest);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === body) return false;
  atomicWrite(file, body);
  return true;
}

/**
 * Decide what to do with one generated file.
 * @param {{ local: string|null, rendering: string, baseline?: string|null, history?: string[], pinned?: boolean }} input
 * @returns {{ status: 'pinned'|'create'|'current'|'update'|'modified'|'preserved', upstreamChanged?: boolean }}
 */
export function classify({ local, rendering, baseline = null, history = [], pinned = false }) {
  if (pinned) return { status: 'pinned', upstreamChanged: rendering !== baseline };
  if (local === null || local === undefined) return { status: 'create' };
  if (local === rendering) return { status: 'current' };
  if (local === baseline || history.includes(local)) return { status: 'update' };
  if (baseline !== null && baseline === rendering) return { status: 'modified' };
  return { status: 'preserved' };
}

function indexesOf(text, needle) {
  const out = [];
  let at = text.indexOf(needle);
  while (at !== -1) {
    out.push(at);
    at = text.indexOf(needle, at + needle.length);
  }
  return out;
}

function locateSection(text) {
  const starts = indexesOf(text, SECTION_START);
  const ends = indexesOf(text, SECTION_END);
  if (starts.length === 0 && ends.length === 0) return { kind: 'none' };
  if (starts.length !== 1 || ends.length !== 1) {
    return {
      kind: 'malformed',
      reason: `expected one ${SECTION_START} and one ${SECTION_END} marker, found ${starts.length} and ${ends.length}`,
    };
  }
  if (ends[0] < starts[0]) {
    return { kind: 'malformed', reason: 'the end marker comes before the start marker' };
  }
  return { kind: 'one', start: starts[0], end: ends[0] + SECTION_END.length };
}

/** CRLF only when every line break in the text is CRLF. */
export function detectEol(text) {
  return /\r\n/.test(text) && !/(^|[^\r])\n/.test(text) ? '\r\n' : '\n';
}

function withEol(text, eol) {
  const lf = text.replace(/\r\n/g, '\n');
  return eol === '\n' ? lf : lf.replace(/\n/g, eol);
}

function planSection(project, item, manifest, history) {
  const local = readLocal(path.join(project, item.path));
  const recorded = manifest.files[item.key] || {};
  const rendering = digest(item.content);
  const base = {
    key: item.key,
    path: item.path,
    scope: item.scope,
    kind: item.kind,
    name: item.name,
    content: item.content,
    rendering,
    baseline: recorded.digest || null,
    local: null,
    localText: null,
  };
  if (!local.exists) return { ...base, status: 'create', mode: 'file' };
  if (!local.regular) return { ...base, status: 'preserved', reason: 'not a regular file', mode: 'none' };
  const found = locateSection(local.text);
  if (found.kind === 'malformed') {
    return { ...base, status: 'malformed', reason: found.reason, localText: local.text, mode: 'none' };
  }
  if (found.kind === 'none') {
    return { ...base, status: 'create', mode: 'append', localText: local.text };
  }
  const localDigest = digest(`${local.text.slice(found.start, found.end)}\n`);
  const result = classify({
    local: localDigest,
    rendering,
    baseline: base.baseline,
    history: history.files[item.key] || [],
    pinned: Boolean(recorded.pinned),
  });
  return {
    ...base,
    ...result,
    local: localDigest,
    localText: local.text,
    mode: 'replace',
    range: [found.start, found.end],
    localBlock: `${local.text.slice(found.start, found.end)}\n`,
  };
}

/**
 * The full file text after writing this section item. Only the marked block changes.
 * @param {object} item a planned section item
 * @returns {string}
 */
export function renderSectionInto(item) {
  if (item.status === 'malformed') {
    throw new Error(`${item.path} is malformed: ${item.reason}`);
  }
  if (item.mode === 'file') return item.content;
  const eol = detectEol(item.localText);
  if (item.mode === 'append') {
    return `${item.localText.replace(/\s*$/, '')}${eol}${eol}${withEol(item.content, eol)}`;
  }
  const [start, end] = item.range;
  const block = withEol(item.content.replace(/\n$/, ''), eol);
  return `${item.localText.slice(0, start)}${block}${item.localText.slice(end)}`;
}

export function historyPath() {
  return path.join(templatesRoot, 'adapter-history.json');
}

/** @returns {{ version: number, files: Record<string, string[]> }} */
export function loadHistory() {
  const file = historyPath();
  if (!fs.existsSync(file)) return { version: 1, files: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLocal(file) {
  if (!fs.existsSync(file)) return { exists: false };
  if (!fs.statSync(file).isFile()) return { exists: true, regular: false };
  return { exists: true, regular: true, text: fs.readFileSync(file, 'utf8') };
}

function planFile(project, item, manifest, history) {
  const local = readLocal(path.join(project, item.path));
  const recorded = manifest.files[item.key] || {};
  const rendering = digest(item.content);
  const baseline = recorded.digest || null;
  const base = {
    key: item.key,
    path: item.path,
    scope: item.scope,
    kind: item.kind,
    name: item.name,
    content: item.content,
    rendering,
    baseline,
    local: null,
    localText: null,
  };
  if (local.exists && !local.regular) {
    return { ...base, status: 'preserved', reason: 'not a regular file' };
  }
  const localDigest = local.exists ? digest(local.text) : null;
  const result = classify({
    local: localDigest,
    rendering,
    baseline,
    history: history.files[item.key] || [],
    pinned: Boolean(recorded.pinned),
  });
  return {
    ...base,
    ...result,
    local: localDigest,
    localText: local.exists ? local.text : null,
  };
}

/**
 * Classify every generated file without writing anything.
 * @param {string} project
 * @param {{ templates?: string, history?: object, manifest?: object }} [options]
 */
export function planAdapters(project, options = {}) {
  const history = options.history || loadHistory();
  const manifest = options.manifest || readManifest(project);
  const entries = renderAdapters(project, { templates: options.templates });
  const files = [];
  for (const item of entries) {
    files.push(item.scope === 'file'
      ? planFile(project, item, manifest, history)
      : planSection(project, item, manifest, history));
  }
  const rendered = new Set(entries.map((item) => item.key));
  const orphans = [];
  const drop = [];
  const seen = new Set();
  const consider = (key, source) => {
    if (key.endsWith('#section') || rendered.has(key) || seen.has(key)) return;
    seen.add(key);
    const local = readLocal(path.join(project, key));
    if (local.exists) orphans.push({ key, path: key, source });
    else if (source === 'manifest') drop.push(key);
  };
  for (const key of Object.keys(manifest.files).sort()) consider(key, 'manifest');
  for (const key of Object.keys(history.files).sort()) consider(key, 'history');
  return { files, orphans, drop, manifest };
}

const COUNT_KEYS = ['current', 'updated', 'created', 'modified', 'preserved', 'replaced', 'pinned', 'malformed'];

export function emptySummary() {
  const summary = { orphan: 0 };
  for (const key of COUNT_KEYS) summary[key] = 0;
  return summary;
}

function textFor(item) {
  if (item.scope === 'section') return renderSectionInto(item);
  if ((item.status === 'update' || item.status === 'replace') && item.localText !== null) {
    return withEol(item.content, detectEol(item.localText));
  }
  return item.content;
}

function normalizePath(project, value) {
  let rel = String(value).replace(/\\/g, '/');
  if (path.isAbsolute(value)) rel = path.relative(project, value).replace(/\\/g, '/');
  return rel.replace(/^\.\//, '');
}

/**
 * Mark preserved (or, for an explicit path, modified) files for replacement.
 * Nothing is written. Throws for a path that is not a generated adapter file.
 * @returns {{ plan: object, notes: string[] }}
 */
export function markReplacements(project, plan, { force = false, replace = [] } = {}) {
  const notes = [];
  const byPath = new Map(plan.files.map((item) => [item.path, item]));
  const replaceable = new Set(['preserved', 'modified']);
  const mark = (item) => ({ ...item, status: 'replace', replacedStatus: item.status });
  const files = plan.files.slice();
  const indexOf = (item) => files.findIndex((entry) => entry.key === item.key);

  const unknown = replace
    .map((value) => normalizePath(project, value))
    .filter((rel) => !byPath.has(rel));
  if (unknown.length) {
    throw new Error(`${unknown.join(', ')}: not a generated adapter file. Nothing was written.`);
  }

  for (const value of replace) {
    const rel = normalizePath(project, value);
    const item = files[indexOf(byPath.get(rel))];
    if (replaceable.has(item.status)) files[indexOf(item)] = mark(item);
    else if (item.status === 'pinned') {
      notes.push(`${rel} is pinned and was not replaced. Run idefactory adapters unpin ${rel} first.`);
    } else if (item.status === 'malformed') {
      notes.push(`${rel} has malformed instruction markers and was not replaced: ${item.reason}. Repair them by hand.`);
    } else if (item.status !== 'replace') {
      notes.push(`Nothing to replace for ${rel}: it is ${item.status}.`);
    }
  }
  if (force) {
    files.forEach((item, index) => {
      if (item.status === 'preserved') files[index] = mark(item);
      else if (item.status === 'malformed') {
        notes.push(`${item.path} has malformed instruction markers and was not replaced: ${item.reason}. Repair them by hand.`);
      }
    });
  }
  return { plan: { ...plan, files }, notes };
}

/**
 * Apply a plan: write created, updated, and replaced files, then the manifest.
 * A preserved, modified, pinned, or malformed file is never written. Each
 * replaced file is copied under the run directory first.
 * @param {string} project
 * @param {ReturnType<typeof planAdapters>} plan
 * @param {{ run?: { runDir: string, rel: string } | null }} [options]
 */
export function applyPlan(project, plan, options = {}) {
  const manifest = { version: MANIFEST_VERSION, files: {} };
  for (const [key, value] of Object.entries(plan.manifest.files)) manifest.files[key] = { ...value };
  const summary = emptySummary();
  const files = [];
  const backups = new Map();

  const replaced = plan.files.filter((item) => item.status === 'replace');
  if (replaced.length > 0 && !options.run) throw new Error('A replacement needs a run directory for backups.');
  for (const item of replaced) {
    const target = path.join(options.run.runDir, 'backups', item.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(project, item.path), target);
    backups.set(item.key, `${options.run.rel}/backups/${item.path}`);
  }

  for (const item of plan.files) {
    if (item.status === 'create' || item.status === 'update') {
      atomicWrite(path.join(project, item.path), textFor(item));
      manifest.files[item.key] = { digest: item.rendering };
      summary[item.status === 'create' ? 'created' : 'updated'] += 1;
    } else if (item.status === 'replace') {
      atomicWrite(path.join(project, item.path), textFor(item));
      manifest.files[item.key] = { digest: item.rendering };
      summary.replaced += 1;
    } else if (item.status === 'current') {
      manifest.files[item.key] = { digest: item.rendering };
      summary.current += 1;
    } else if (item.status === 'pinned') {
      summary.pinned += 1;
    } else if (item.status === 'modified') {
      summary.modified += 1;
    } else if (item.status === 'malformed') {
      summary.malformed += 1;
    } else {
      summary.preserved += 1;
    }
    files.push({ ...item, action: item.status, backup: backups.get(item.key) || null });
  }
  for (const key of plan.drop) delete manifest.files[key];
  summary.orphan = plan.orphans.length;
  const manifestChanged = writeManifest(project, manifest);
  return { files, orphans: plan.orphans, summary, manifestChanged };
}

function splitLines(text) {
  const lf = String(text).replace(/\r\n/g, '\n');
  if (lf === '') return [];
  const lines = lf.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function diffOps(a, b) {
  const n = a.length;
  const m = b.length;
  if (n * m > 25_000_000) {
    return [
      ...a.map((text, i) => ({ t: '-', text, oldNo: i + 1 })),
      ...b.map((text, i) => ({ t: '+', text, newNo: i + 1 })),
    ];
  }
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', text: a[i], oldNo: i + 1, newNo: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ t: '-', text: a[i], oldNo: i + 1 });
      i += 1;
    } else {
      ops.push({ t: '+', text: b[j], newNo: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ t: '-', text: a[i], oldNo: i + 1 });
    i += 1;
  }
  while (j < m) {
    ops.push({ t: '+', text: b[j], newNo: j + 1 });
    j += 1;
  }
  return ops;
}

/**
 * Unified diff of two texts, line based. Line endings are ignored.
 * @returns {string} empty when the texts are equal
 */
export function unifiedDiff(oldText, newText, options = {}) {
  const { oldLabel = 'local', newLabel = 'incoming', context = 3 } = options;
  const ops = diffOps(splitLines(oldText), splitLines(newText));
  const changed = [];
  ops.forEach((op, index) => {
    if (op.t !== ' ') changed.push(index);
  });
  if (changed.length === 0) return '';
  const ranges = [];
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  const out = [`--- ${oldLabel}`, `+++ ${newLabel}`];
  for (const [start, end] of ranges) {
    const before = ops.slice(0, start);
    const hunk = ops.slice(start, end + 1);
    const oldBefore = before.filter((op) => op.t !== '+').length;
    const newBefore = before.filter((op) => op.t !== '-').length;
    const oldCount = hunk.filter((op) => op.t !== '+').length;
    const newCount = hunk.filter((op) => op.t !== '-').length;
    const oldStart = oldCount === 0 ? oldBefore : oldBefore + 1;
    const newStart = newCount === 0 ? newBefore : newBefore + 1;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of hunk) out.push(`${op.t}${op.text}`);
  }
  return `${out.join('\n')}\n`;
}

export function upgradeDir(project) {
  return path.join(project, '.factory', 'upgrade');
}

/** Create a fresh run directory named for the UTC time, never reusing a name. */
export function createRun(project, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  fs.mkdirSync(upgradeDir(project), { recursive: true });
  for (let attempt = 1; ; attempt += 1) {
    const runId = attempt === 1 ? stamp : `${stamp}-${attempt}`;
    const runDir = path.join(upgradeDir(project), runId);
    try {
      fs.mkdirSync(runDir);
      return { runId, runDir, rel: `.factory/upgrade/${runId}` };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

function writeStaged(runDir, rel, text) {
  const file = path.join(runDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/**
 * Save the incoming rendering and a diff for every preserved file.
 * @returns {null | { runId: string, runDir: string, rel: string, files: Map<string, { incoming: string, diff: string|null }> }}
 */
export function stageConflicts(project, plan, options = {}) {
  const preserved = plan.files.filter((item) => item.status === 'preserved');
  if (preserved.length === 0) return null;
  const run = options.run || createRun(project, options.now);
  const files = new Map();
  for (const item of preserved) {
    const incomingRel = `incoming/${item.path}`;
    writeStaged(run.runDir, incomingRel, item.content);
    let diffRel = null;
    const local = item.scope === 'section' ? item.localBlock : item.localText;
    if (typeof local === 'string') {
      diffRel = `diffs/${item.path}.diff`;
      writeStaged(run.runDir, diffRel, unifiedDiff(local, item.content, {
        oldLabel: `local/${item.path}`,
        newLabel: `incoming/${item.path}`,
      }));
    }
    files.set(item.key, {
      incoming: `${run.rel}/${incomingRel}`,
      diff: diffRel ? `${run.rel}/${diffRel}` : null,
    });
  }
  return { ...run, files };
}

/**
 * Pin or unpin generated files in the manifest. Writes nothing else.
 * @param {string} project
 * @param {string[]} paths
 * @param {'pin'|'unpin'} mode
 * @returns {{ done: string[], notes: string[] }}
 */
export function setPins(project, paths, mode) {
  const plan = planAdapters(project);
  const byPath = new Map(plan.files.map((item) => [item.path, item]));
  const wanted = paths.map((value) => normalizePath(project, value));
  const unknown = wanted.filter((rel) => !byPath.has(rel));
  if (unknown.length) {
    throw new Error(`${unknown.join(', ')}: not a generated adapter file. Nothing was changed.`);
  }
  const manifest = { version: MANIFEST_VERSION, files: { ...plan.manifest.files } };
  const done = [];
  const notes = [];
  for (const rel of wanted) {
    const item = byPath.get(rel);
    const entry = manifest.files[item.key];
    if (mode === 'pin') {
      if (entry && entry.pinned) {
        notes.push(`${rel} is already pinned.`);
        continue;
      }
      manifest.files[item.key] = { digest: item.rendering, pinned: true };
      done.push(rel);
    } else if (entry && entry.pinned) {
      manifest.files[item.key] = { digest: entry.digest };
      done.push(rel);
    } else {
      notes.push(`${rel} is not pinned.`);
    }
  }
  writeManifest(project, manifest);
  return { done, notes };
}
