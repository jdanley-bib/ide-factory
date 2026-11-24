import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { SUPPLIED_EVIDENCE_TYPES, assertSuppliedEvidence, getAttempt } from '../src/lib/attempt.mjs';
import { readTransitionEvidence } from '../src/lib/evidence-input.mjs';
import { cleanup, idefactory, repoRoot, tempProject } from './helpers.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-evidence-'));
}

function withFile(content, fn) {
  const dir = tempDir();
  const file = path.join(dir, 'evidence.json');
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const SAMPLE = {
  reviewerId: 'reviewer-1',
  verdict: 'ACCEPT',
  notes: 'He said "ship it" \\ and left — café, naïve, 日本語',
};

test('no evidence flag yields an empty object', () => {
  assert.deepEqual(readTransitionEvidence({}), {});
});

test('inline JSON returns the parsed object', () => {
  assert.deepEqual(readTransitionEvidence({ evidence: JSON.stringify(SAMPLE) }), SAMPLE);
});

test('a file holding a JSON object returns the same object as inline JSON', () => {
  const text = JSON.stringify(SAMPLE, null, 2);
  withFile(text, (file) => {
    assert.deepEqual(readTransitionEvidence({ 'evidence-file': file }), SAMPLE);
    assert.deepEqual(
      readTransitionEvidence({ 'evidence-file': file }),
      readTransitionEvidence({ evidence: text }),
    );
  });
});

test('spaces, escaped quotes, and non-ASCII text round-trip unchanged', () => {
  const evidence = { verdict: 'ACCEPT', notes: 'test with spaces and \\"escaped\\" quotes \\\\ ünï' };
  withFile(JSON.stringify(evidence), (file) => {
    assert.equal(readTransitionEvidence({ 'evidence-file': file }).notes, evidence.notes);
  });
});

test('a UTF-8 byte-order mark is accepted', () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(SAMPLE), 'utf8')]);
  withFile(bytes, (file) => {
    assert.deepEqual(readTransitionEvidence({ 'evidence-file': file }), SAMPLE);
  });
});

test('UTF-16LE content with a byte-order mark is accepted', () => {
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(SAMPLE), 'utf16le')]);
  withFile(bytes, (file) => {
    assert.deepEqual(readTransitionEvidence({ 'evidence-file': file }), SAMPLE);
  });
});

test('reading leaves the evidence file untouched', () => {
  withFile(JSON.stringify(SAMPLE), (file) => {
    const before = fs.readFileSync(file);
    const mtime = fs.statSync(file).mtimeMs;
    readTransitionEvidence({ 'evidence-file': file });
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(fs.statSync(file).mtimeMs, mtime);
  });
});

test('both sources given names both flags and asks for only one', () => {
  withFile(JSON.stringify(SAMPLE), (file) => {
    assert.throws(
      () => readTransitionEvidence({ evidence: '{}', 'evidence-file': file }),
      (error) => /--evidence/.test(error.message)
        && /--evidence-file/.test(error.message)
        && /only one/.test(error.message),
    );
  });
});

test('the conflict is reported before the file is read', () => {
  assert.throws(
    () => readTransitionEvidence({ evidence: '{}', 'evidence-file': '/no/such/file.json' }),
    /only one/,
  );
});

test('a flag given with no value fails with the transition usage', () => {
  for (const flags of [{ evidence: true }, { 'evidence-file': true }, { 'evidence-file': '' }]) {
    assert.throws(
      () => readTransitionEvidence(flags),
      /Usage: idefactory attempt transition .*--evidence-file/,
      JSON.stringify(flags),
    );
  }
});

test('a missing path names the path', () => {
  const missing = path.join(tempDir(), 'nope.json');
  assert.throws(
    () => readTransitionEvidence({ 'evidence-file': missing }),
    (error) => error.message.includes(`evidence file not found: ${missing}`),
  );
});

test('JSON text passed as the file value fails as a missing file and points to --evidence', () => {
  const inline = '{"verdict":"ACCEPT"}';
  assert.throws(
    () => readTransitionEvidence({ 'evidence-file': inline }),
    (error) => error.message.includes(`evidence file not found: ${inline}`)
      && /--evidence takes inline JSON/.test(error.message),
  );
});

test('a directory fails naming the path', () => {
  const dir = tempDir();
  try {
    assert.throws(
      () => readTransitionEvidence({ 'evidence-file': dir }),
      (error) => error.message.includes(`evidence file is a directory: ${dir}`),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty file fails saying it is empty and names the path', () => {
  withFile('', (file) => {
    assert.throws(
      () => readTransitionEvidence({ 'evidence-file': file }),
      (error) => error.message.includes(`evidence file is empty: ${file}`),
    );
  });
  withFile(Buffer.from([0xef, 0xbb, 0xbf]), (file) => {
    assert.throws(
      () => readTransitionEvidence({ 'evidence-file': file }),
      /evidence file is empty/,
    );
  });
});

test('malformed JSON in the file fails naming the path', () => {
  withFile('{not json', (file) => {
    assert.throws(
      () => readTransitionEvidence({ 'evidence-file': file }),
      (error) => error.message.includes(`evidence file ${file} is not valid JSON`),
    );
  });
});

test('JSON that is not an object fails naming the path', () => {
  for (const text of ['[]', '[1]', '"text"', '12', 'true', 'null']) {
    withFile(text, (file) => {
      assert.throws(
        () => readTransitionEvidence({ 'evidence-file': file }),
        (error) => error.message.includes(`evidence file ${file} must hold a JSON object`),
        text,
      );
    });
  }
});

test('malformed inline JSON names --evidence-file as the alternative', () => {
  assert.throws(
    () => readTransitionEvidence({ evidence: '{verdict:ACCEPT}' }),
    (error) => /--evidence-file <path>/.test(error.message)
      && /shell quoting/.test(error.message),
  );
});

test('a relative path resolves from the supplied working directory', () => {
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, 'e.json'), JSON.stringify(SAMPLE));
    assert.deepEqual(readTransitionEvidence({ 'evidence-file': 'e.json' }, { cwd: dir }), SAMPLE);
    assert.throws(
      () => readTransitionEvidence({ 'evidence-file': 'other.json' }, { cwd: dir }),
      /evidence file not found: other\.json/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function seedAttempts(dir, count = 1) {
  assert.equal((await idefactory(dir, ['init'])).code, 0);
  fs.mkdirSync(path.join(dir, 'openspec/changes/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'openspec/changes/demo/tasks.md'),
    '- [ ] 1.1 Add parser\n  factory:\n    kind: general\n    checks: [unit]\n    verificationProfile: cli\n    roles: [engineer, reviewer, scribe]\n',
  );
  assert.equal((await idefactory(dir, ['sync-tasks', 'demo'])).code, 0);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const started = await idefactory(dir, ['attempt', 'start', 'demo', '1.1']);
    assert.equal(started.code, 0, started.err);
    ids.push(JSON.parse(started.out).id);
  }
  return ids;
}

function attemptBytes(dir, id) {
  return fs.readFileSync(path.join(dir, '.factory/attempts', `${id}.json`), 'utf8');
}

function evidenceFile(dir, evidence, name = 'evidence.json') {
  const file = path.join(dir, '..', `${path.basename(dir)}-${name}`);
  fs.writeFileSync(file, typeof evidence === 'string' ? evidence : JSON.stringify(evidence));
  return file;
}

const IMPLEMENTING = { implementerId: 'engineer-1', notes: 'has "quotes" and spaces' };

test('transition with --evidence-file stores the same evidence as inline --evidence', async () => {
  const dir = tempProject();
  try {
    const [inlineId, fileId] = await seedAttempts(dir, 2);
    const inline = await idefactory(dir, [
      'attempt', 'transition', inlineId, 'implementing', '--evidence', JSON.stringify(IMPLEMENTING),
    ]);
    assert.equal(inline.code, 0, inline.err);
    const file = evidenceFile(dir, IMPLEMENTING);
    const viaFile = await idefactory(dir, [
      'attempt', 'transition', fileId, 'implementing', '--evidence-file', file,
    ]);
    assert.equal(viaFile.code, 0, viaFile.err);
    const a = getAttempt(dir, inlineId);
    const b = getAttempt(dir, fileId);
    assert.equal(b.state, a.state);
    assert.equal(b.implementerId, a.implementerId);
    assert.deepEqual(b.evidence, a.evidence);
    assert.equal(fs.existsSync(file), true);
    assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(IMPLEMENTING));
    fs.rmSync(file);
  } finally {
    cleanup(dir);
  }
});

test('both flags together exit non-zero and leave the attempt untouched', async () => {
  const dir = tempProject();
  try {
    const [id] = await seedAttempts(dir);
    const before = attemptBytes(dir, id);
    const file = evidenceFile(dir, IMPLEMENTING);
    const result = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing',
      '--evidence', JSON.stringify(IMPLEMENTING), '--evidence-file', file,
    ]);
    assert.notEqual(result.code, 0);
    assert.match(result.err, /only one of --evidence and --evidence-file/);
    assert.equal(attemptBytes(dir, id), before);
    assert.equal(fs.existsSync(file), true);
    fs.rmSync(file);
  } finally {
    cleanup(dir);
  }
});

test('a missing, empty, or malformed evidence file fails and leaves the attempt untouched', async () => {
  const dir = tempProject();
  try {
    const [id] = await seedAttempts(dir);
    const before = attemptBytes(dir, id);
    const empty = evidenceFile(dir, '', 'empty.json');
    const bad = evidenceFile(dir, '{oops', 'bad.json');
    const missing = path.join(dir, 'gone.json');
    for (const [file, pattern] of [
      [missing, /evidence file not found/],
      [empty, /evidence file is empty/],
      [bad, /is not valid JSON/],
    ]) {
      const result = await idefactory(dir, [
        'attempt', 'transition', id, 'implementing', '--evidence-file', file,
      ]);
      assert.notEqual(result.code, 0, file);
      assert.match(result.err, pattern);
      assert.ok(result.err.includes(file), result.err);
      assert.equal(attemptBytes(dir, id), before);
    }
    assert.equal(fs.existsSync(empty), true);
    assert.equal(fs.existsSync(bad), true);
    fs.rmSync(empty);
    fs.rmSync(bad);
  } finally {
    cleanup(dir);
  }
});

test('a caller-supplied verification result in the file is rejected like inline evidence', async () => {
  const dir = tempProject();
  try {
    const [id] = await seedAttempts(dir);
    const before = attemptBytes(dir, id);
    const payload = { implementerId: 'engineer-1', verification: [{ kind: 'unit', passed: true }] };
    const inline = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing', '--evidence', JSON.stringify(payload),
    ]);
    const file = evidenceFile(dir, payload);
    const viaFile = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing', '--evidence-file', file,
    ]);
    assert.notEqual(inline.code, 0);
    assert.notEqual(viaFile.code, 0);
    assert.equal(viaFile.err, inline.err);
    assert.match(viaFile.err, /caller-supplied/);
    assert.equal(attemptBytes(dir, id), before);
    fs.rmSync(file);
  } finally {
    cleanup(dir);
  }
});

test('inline --evidence behaves as before and malformed inline JSON points to the file option', async () => {
  const dir = tempProject();
  try {
    const [id] = await seedAttempts(dir);
    const before = attemptBytes(dir, id);
    const bad = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing', '--evidence', '{implementerId:engineer-1}',
    ]);
    assert.notEqual(bad.code, 0);
    assert.match(bad.err, /--evidence-file <path>/);
    assert.equal(attemptBytes(dir, id), before);
    const ok = await idefactory(dir, [
      'attempt', 'transition', id, 'implementing', '--evidence', JSON.stringify(IMPLEMENTING),
    ]);
    assert.equal(ok.code, 0, ok.err);
    assert.equal(getAttempt(dir, id).state, 'implementing');
  } finally {
    cleanup(dir);
  }
});

test('a flag with no value exits with the transition usage', async () => {
  const dir = tempProject();
  try {
    const [id] = await seedAttempts(dir);
    for (const flag of ['--evidence', '--evidence-file']) {
      const result = await idefactory(dir, ['attempt', 'transition', id, 'implementing', flag]);
      assert.notEqual(result.code, 0);
      assert.match(result.err, /Usage: idefactory attempt transition .*--evidence-file/);
    }
  } finally {
    cleanup(dir);
  }
});

test('every shipped copy of factory-build and factory-run documents the evidence file', () => {
  for (const dir of ['templates', '.cursor', '.claude', '.cline', '.github', '.agents']) {
    for (const name of ['factory-build', 'factory-run']) {
      const skill = fs.readFileSync(path.join(repoRoot, dir, 'skills', name, 'SKILL.md'), 'utf8');
      const label = `${dir}/${name}`;
      assert.match(skill, /--evidence-file/, label);
      assert.match(skill, /`--evidence` takes inline JSON/, label);
      assert.match(skill, /only one/i, label);
      assert.match(skill, /operating system temporary directory/i, label);
      assert.match(skill, /not inside the project/i, label);
      assert.match(skill, /remove (that|the) file after the command whether it succeeds or fails/i, label);
    }
  }
});

test('README and help document both evidence flags', async () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  assert.match(readme, /--evidence-file/);
  assert.match(readme, /`--evidence <json>`/);
  assert.match(readme, /only one/i);
  assert.match(readme, /UTF-16LE/);
  assert.match(readme, /Remove-Item/);
  const dir = tempProject();
  try {
    const help = await idefactory(dir, ['--help']);
    assert.match(help.out, /--evidence json \| --evidence-file path/);
  } finally {
    cleanup(dir);
  }
});

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'idefactory-test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'idefactory-test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function commitAll(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'idefactory-test']);
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), [
    '.factory/attempts/*',
    '!.factory/attempts/.gitkeep',
    '.factory/work/',
    '.factory/ledger.jsonl',
    '.factory/orchestration/*',
    '!.factory/orchestration/.gitkeep',
    '',
  ].join('\n'));
  git(dir, ['add', '-A']);
  if (git(dir, ['status', '--porcelain']).length > 0) git(dir, ['commit', '-m', 'checkpoint']);
}

function utf8BomBytes(value) {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(value), 'utf8')]);
}

function utf16leBytes(value) {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(value), 'utf16le')]);
}

test('evidence files in the temp directory carry a full attempt through verify, review, and complete', async () => {
  const dir = tempProject();
  const scratch = tempDir();
  try {
    assert.equal(path.relative(dir, scratch).startsWith('..'), true, 'evidence files live outside the project');
    const [id] = await seedAttempts(dir);
    const configPath = path.join(dir, '.factory/config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.governance.policyVersion = 1;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    fs.writeFileSync(path.join(dir, '.factory/checks.json'), `${JSON.stringify({
      schemaVersion: 1,
      checks: {
        unit: {
          argv: [process.execPath, '-e', "process.exit(require('fs').existsSync('fixed.flag') ? 0 : 1)"],
          cwdPolicy: 'project',
          timeoutMs: 30_000,
          artifacts: [],
        },
      },
    }, null, 2)}\n`);
    commitAll(dir);

    const transition = async (state, file) => idefactory(dir, [
      'attempt', 'transition', id, state, ...(file ? ['--evidence-file', file] : []),
    ]);
    const bomFile = path.join(scratch, 'implementing.json');
    fs.writeFileSync(bomFile, utf8BomBytes({ implementerId: 'engineer-1' }));
    const implementing = await transition('implementing', bomFile);
    assert.equal(implementing.code, 0, implementing.err);

    const red = await idefactory(dir, ['verify', 'run', id, '--check', 'unit', '--red']);
    assert.equal(red.code, 0, red.err + red.out);
    fs.writeFileSync(path.join(dir, 'fixed.flag'), 'fixed\n');
    commitAll(dir);
    const green = await idefactory(dir, ['verify', 'run', id, '--check', 'unit']);
    assert.equal(green.code, 0, green.err + green.out);
    assert.equal((await transition('verifying')).code, 0);
    assert.equal((await transition('awaiting-review')).code, 0);

    const reviewFile = path.join(scratch, 'review.json');
    fs.writeFileSync(reviewFile, utf16leBytes({
      reviewerId: 'reviewer-1',
      verdict: 'ACCEPT',
      notes: 'He said "ship it" — café',
    }));
    const accepted = await transition('accepted', reviewFile);
    assert.equal(accepted.code, 0, accepted.err);
    assert.equal(getAttempt(dir, id).evidence.review.notes, 'He said "ship it" — café');

    const done = await idefactory(dir, ['complete', 'demo', '1.1', '--attempt', id]);
    assert.equal(done.code, 0, done.err + done.out);
    assert.equal(getAttempt(dir, id).state, 'finalized');
    assert.equal(fs.existsSync(bomFile) && fs.existsSync(reviewFile), true, 'the CLI never deletes the files');
  } finally {
    cleanup(dir);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('supported transition evidence keys and their types are pinned', () => {
  assert.deepEqual(SUPPLIED_EVIDENCE_TYPES, {
    reviewerId: 'string',
    implementerId: 'string',
    securityReviewerId: 'string',
    verdict: 'string',
    notes: 'string',
    changedFiles: 'string[]',
    baseRev: 'string',
  });
});

test('each supported key refuses a value of the wrong type', () => {
  const review = { state: 'awaiting-review' };
  const wrong = {
    reviewerId: 7,
    implementerId: ['engineer-1'],
    securityReviewerId: null,
    verdict: true,
    notes: { text: 'x' },
    changedFiles: 'src/a.mjs',
    baseRev: 12,
  };
  for (const [key, value] of Object.entries(wrong)) {
    assert.throws(
      () => assertSuppliedEvidence(review, 'rejected', { [key]: value }),
      (error) => error.message.includes(`"${key}"`),
      key,
    );
  }
  assert.throws(
    () => assertSuppliedEvidence(review, 'rejected', { changedFiles: ['ok', 3] }),
    /"changedFiles" must be an array of strings/,
  );
  assert.doesNotThrow(() => assertSuppliedEvidence(review, 'rejected', {
    reviewerId: 'reviewer-1',
    notes: 'text',
    changedFiles: ['src/a.mjs'],
    baseRev: 'abc123',
  }));
});

test('README names each supported evidence key and the top-level notes form', () => {
  const readme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');
  const start = readme.indexOf('### Transition evidence');
  assert.ok(start >= 0, 'README has a Transition evidence section');
  const next = readme.indexOf('\n## ', start + 1);
  const section = readme.slice(start, next >= 0 ? next : undefined);
  for (const key of Object.keys(SUPPLIED_EVIDENCE_TYPES)) {
    assert.match(section, new RegExp(`\`${key}\``), `README names ${key}`);
  }
  assert.match(section, /"notes"/);
  assert.match(section, /unsupported evidence key/);
});
