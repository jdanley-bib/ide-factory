#!/usr/bin/env node
/**
 * Rebuilds templates/adapter-history.json: the normalized digests of every
 * generated adapter file and instruction section that a past release wrote.
 *
 * For each commit that touched templates/ or src/lib/install.mjs it runs that
 * commit's own `init` in a temporary project and digests what came out. The
 * working tree is included last. Digests already in the table are never
 * dropped, so a run only appends.
 *
 * Usage: node scripts/build-adapter-history.mjs [--out path]
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUCTION_FILES, digest } from '../src/lib/adapters.mjs';
import { SECTION_END, SECTION_START } from '../src/lib/layout.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HISTORY_VERSION = 1;
const ADAPTER_ROOTS = ['.cursor/', '.claude/', '.github/', '.agents/', '.cline/'];

function git(args, options = {}) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, ...options });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString('utf8')}`);
  }
  return result.stdout;
}

function listCommits() {
  const out = git(['log', '--reverse', '--format=%H', '--', 'templates', 'src/lib/install.mjs'])
    .toString('utf8');
  return out.split('\n').filter(Boolean);
}

function exportCommit(sha, target) {
  const archive = git(['archive', sha]);
  const result = spawnSync('tar', ['-x', '-C', target], { input: archive });
  if (result.status !== 0) throw new Error(`tar failed for ${sha}`);
}

function runInit(sourceRoot, project) {
  const result = spawnSync(
    process.execPath,
    [path.join(sourceRoot, 'src/cli.mjs'), 'init', '--path', project],
    { cwd: sourceRoot, encoding: 'utf8' },
  );
  return result.status === 0;
}

function walk(root, rel = '') {
  const out = [];
  const dir = rel ? path.join(root, rel) : root;
  for (const name of fs.readdirSync(dir).sort()) {
    const next = rel ? `${rel}/${name}` : name;
    if (fs.statSync(path.join(root, next)).isDirectory()) out.push(...walk(root, next));
    else out.push(next);
  }
  return out;
}

function sectionBlock(text) {
  const start = text.indexOf(SECTION_START);
  const end = text.indexOf(SECTION_END);
  if (start === -1 || end === -1 || end < start) return null;
  return `${text.slice(start, end + SECTION_END.length)}\n`;
}

/** @returns {Map<string, string>} key -> digest */
function collect(project) {
  const found = new Map();
  for (const rel of walk(project)) {
    if (!INSTRUCTION_FILES.includes(rel) && !ADAPTER_ROOTS.some((root) => rel.startsWith(root))) continue;
    if (rel.startsWith('.github/workflows/')) continue;
    const text = fs.readFileSync(path.join(project, rel), 'utf8');
    if (INSTRUCTION_FILES.includes(rel)) {
      const block = sectionBlock(text);
      if (block) found.set(`${rel}#section`, digest(block));
      continue;
    }
    found.set(rel, digest(text));
  }
  return found;
}

function readTable(file) {
  if (!fs.existsSync(file)) return { version: HISTORY_VERSION, files: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeTable(file, table) {
  const files = {};
  for (const key of Object.keys(table.files).sort()) {
    files[key] = [...new Set(table.files[key])].sort();
  }
  fs.writeFileSync(file, `${JSON.stringify({ version: HISTORY_VERSION, files }, null, 2)}\n`);
}

function main() {
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex === -1
    ? path.join(repoRoot, 'templates/adapter-history.json')
    : path.resolve(process.argv[outIndex + 1]);
  const table = readTable(out);
  const sources = listCommits().map((sha) => ({ label: sha.slice(0, 7), sha }));
  sources.push({ label: 'working tree', sha: null });

  for (const source of sources) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-history-'));
    try {
      let sourceRoot = repoRoot;
      if (source.sha) {
        sourceRoot = path.join(scratch, 'source');
        fs.mkdirSync(sourceRoot);
        exportCommit(source.sha, sourceRoot);
      }
      const project = path.join(scratch, 'project');
      fs.mkdirSync(project);
      if (!runInit(sourceRoot, project)) {
        console.error(`skip ${source.label}: init failed`);
        continue;
      }
      for (const [key, value] of collect(project)) {
        (table.files[key] ||= []).push(value);
      }
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
  writeTable(out, table);
  console.log(`wrote ${path.relative(repoRoot, out)} with ${Object.keys(table.files).length} paths`);
}

main();
