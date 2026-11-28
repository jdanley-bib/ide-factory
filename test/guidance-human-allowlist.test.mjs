import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { AUTHORITY } from '../src/lib/authority.mjs';
import { repoRoot } from './helpers.mjs';

const PHRASES = ['ask the human', 'only the human', 'only a human', 'wait for the human'];
const FIXTURE = JSON.parse(fs.readFileSync(path.join(repoRoot, 'test/fixtures/guidance-human-allowlist.json'), 'utf8'));

function shippedTemplates(dir = path.join(repoRoot, 'templates')) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...shippedTemplates(full));
    else if (/\.(md|mdc)$/.test(entry.name)) files.push(full);
  }
  return files;
}

export function scanHits(files) {
  const hits = [];
  for (const file of files) {
    const rel = path.relative(repoRoot, file).split(path.sep).join('/');
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const lower = line.toLowerCase();
      for (const phrase of PHRASES) {
        if (lower.includes(phrase)) hits.push({ file: rel, line: index + 1, text: line, phrase });
      }
    });
  }
  return hits;
}

/** Every problem with the hits against the allowlist, the authority table, and the reserved reasons. */
export function allowlistProblems(hits, fixture = FIXTURE, authority = AUTHORITY) {
  const problems = [];
  const used = new Set();
  for (const hit of hits) {
    const entryIndex = fixture.entries.findIndex((entry) => entry.file === hit.file
      && hit.text.toLowerCase().includes(entry.sentence.toLowerCase()));
    if (entryIndex < 0) {
      problems.push(`${hit.file}:${hit.line} has "${hit.phrase}" with no allowlist entry`);
    } else {
      used.add(entryIndex);
    }
  }
  fixture.entries.forEach((entry, index) => {
    const label = `${entry.file} "${entry.sentence}"`;
    const reserved = Object.hasOwn(fixture.reservedReasons, entry.gate);
    if (!reserved && authority[entry.gate]?.level !== 'human') {
      problems.push(`allowlist entry ${label} names gate ${entry.gate}, which the authority table does not mark human`);
    }
    if (!used.has(index)) problems.push(`allowlist entry ${label} matches no current hit`);
  });
  return problems;
}

test('every human-only phrase in the shipped templates is allowlisted with a human gate or a reserved reason', () => {
  const hits = scanHits(shippedTemplates());
  assert.ok(hits.length > 0, 'the scan should find the two reviewed phrases');
  assert.deepEqual(allowlistProblems(hits), []);
});

test('an unlisted human-only phrase fails and names the file', () => {
  const hit = { file: 'templates/skills/factory-tdd/SKILL.md', line: 24, text: 'do not ask the human first', phrase: 'ask the human' };
  const problems = allowlistProblems([hit], { ...FIXTURE, entries: [] });
  assert.match(problems.join('\n'), /templates\/skills\/factory-tdd\/SKILL\.md:24 has "ask the human" with no allowlist entry/);
});

test('an allowlist entry that names a non-human gate fails', () => {
  const fixture = { ...FIXTURE, entries: [{ ...FIXTURE.entries[0], gate: 'waive-red' }, FIXTURE.entries[1]] };
  const problems = allowlistProblems(scanHits(shippedTemplates()), fixture);
  assert.match(problems.join('\n'), /names gate waive-red, which the authority table does not mark human/);
});

test('an allowlist entry that matches no hit is reported as stale', () => {
  const fixture = { ...FIXTURE, entries: [...FIXTURE.entries, { file: 'templates/skills/factory-run/SKILL.md', sentence: 'ask the human to stop', gate: 'record-approval' }] };
  const problems = allowlistProblems(scanHits(shippedTemplates()), fixture);
  assert.match(problems.join('\n'), /matches no current hit/);
});
