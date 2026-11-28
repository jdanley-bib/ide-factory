import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { SECTION_END, SECTION_START } from '../src/lib/layout.mjs';
import { cleanup, idefactory, tempProject } from './helpers.mjs';

const FILE = 'AGENTS.md';

function lineOf(text, marker) {
  return text.slice(0, text.indexOf(marker)).split('\n').length;
}

async function project() {
  const dir = tempProject();
  const init = await idefactory(dir, ['init']);
  assert.equal(init.code, 0, init.err + init.out);
  return dir;
}

function damaged(text, kind) {
  if (kind === 'start-no-end') return text.replace(SECTION_END, '');
  if (kind === 'end-no-start') return text.replace(SECTION_START, '');
  if (kind === 'reversed') {
    const body = text.replace(SECTION_START, '').replace(SECTION_END, '');
    return `${SECTION_END}\n${body}\n${SECTION_START}\n`;
  }
  if (kind === 'repeated') return `${text}\n${SECTION_START}\n`;
  throw new Error(kind);
}

const CASES = [
  {
    kind: 'start-no-end',
    reason: (text) => `the start marker at line ${lineOf(text, SECTION_START)} has no end marker`,
    repair: (text) => `Add ${SECTION_END} on its own line after the factory section, or delete the start marker at line ${lineOf(text, SECTION_START)}.`,
  },
  {
    kind: 'end-no-start',
    reason: (text) => `the end marker at line ${lineOf(text, SECTION_END)} has no start marker`,
    repair: (text) => `Add ${SECTION_START} on its own line before the factory section, or delete the end marker at line ${lineOf(text, SECTION_END)}.`,
  },
  {
    kind: 'reversed',
    reason: (text) => `the end marker at line ${lineOf(text, SECTION_END)} comes before the start marker at line ${lineOf(text, SECTION_START)}`,
    repair: () => 'Swap the two markers, or delete both and run idefactory upgrade to append a fresh section.',
  },
  {
    kind: 'repeated',
    reason: (text) => {
      const starts = [...text.matchAll(new RegExp(SECTION_START, 'g'))].map((m) => text.slice(0, m.index).split('\n').length);
      return `found ${starts.length} start markers at lines ${starts.join(', ')} and 1 end markers at lines ${lineOf(text, SECTION_END)}`;
    },
    repair: () => 'Keep one start marker and one end marker as a pair, and delete the others.',
  },
];

for (const item of CASES) {
  test(`a ${item.kind} marker gets the file, the lines, and the exact repair, and the file is unchanged`, async () => {
    const dir = await project();
    try {
      const original = fs.readFileSync(path.join(dir, FILE), 'utf8');
      const broken = damaged(original, item.kind);
      fs.writeFileSync(path.join(dir, FILE), broken);
      const expected = `${FILE} has malformed instruction markers and was not replaced: ${item.reason(broken)}. ${item.repair(broken)} An agent may make that edit and run idefactory upgrade again; upgrade does not write this file.`;

      const upgraded = await idefactory(dir, ['upgrade']);
      assert.ok((upgraded.out + upgraded.err).includes(expected), upgraded.out + upgraded.err);
      assert.equal(fs.readFileSync(path.join(dir, FILE), 'utf8'), broken);

      const replaced = await idefactory(dir, ['upgrade', '--replace', FILE]);
      assert.ok((replaced.out + replaced.err).includes(expected), replaced.out + replaced.err);
      assert.equal(fs.readFileSync(path.join(dir, FILE), 'utf8'), broken);

      const doctor = await idefactory(dir, ['doctor']);
      assert.ok((doctor.out + doctor.err).includes(expected), doctor.out + doctor.err);
    } finally {
      cleanup(dir);
    }
  });
}

test('the repair text is the same from upgrade, --replace, and doctor', async () => {
  const dir = await project();
  try {
    fs.writeFileSync(path.join(dir, FILE), damaged(fs.readFileSync(path.join(dir, FILE), 'utf8'), 'repeated'));
    const notes = [
      (await idefactory(dir, ['upgrade'])).out,
      (await idefactory(dir, ['upgrade', '--replace', FILE])).out,
      (await idefactory(dir, ['doctor'])).err,
    ].map((text) => text.split('\n').find((line) => line.includes('malformed instruction markers')));
    assert.ok(notes[0], 'upgrade prints the note');
    assert.equal(notes[1], notes[0]);
    assert.equal(notes[2].replace(/^warning: /, ''), notes[0].replace(/^note: /, ''));
  } finally {
    cleanup(dir);
  }
});
