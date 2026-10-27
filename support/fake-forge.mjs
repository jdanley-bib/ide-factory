#!/usr/bin/env node
/**
 * Stub forge client for unit tests. Records argv and never opens a network socket.
 * Env:
 *   IDEFACTORY_FORGE_LOG — append each argv line (NUL-separated fields)
 *   IDEFACTORY_FORGE_DB  — JSON state for issued pull request numbers
 */
import fs from 'node:fs';

const logPath = process.env.IDEFACTORY_FORGE_LOG;
const dbPath = process.env.IDEFACTORY_FORGE_DB;
const args = process.argv.slice(2);

if (logPath) {
  fs.appendFileSync(logPath, `${JSON.stringify(args)}\n`);
}

function loadDb() {
  if (dbPath && fs.existsSync(dbPath)) {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
  return { nextNumber: 1 };
}

function saveDb(db) {
  if (!dbPath) return;
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

const [command, sub] = args;

if (command === 'pr' && sub === 'create') {
  const db = loadDb();
  const number = db.nextNumber;
  db.nextNumber += 1;
  saveDb(db);
  const url = `https://github.com/example/test/pull/${number}`;
  process.stdout.write(`${url}\n`);
  process.exit(0);
}

if (command === 'pr' && sub === 'edit') {
  process.stdout.write('');
  process.exit(0);
}

if (command === 'pr' && sub === 'comment') {
  process.stdout.write('');
  process.exit(0);
}

if (command === 'pr' && sub === 'view') {
  const commentsPath = process.env.IDEFACTORY_FORGE_COMMENTS;
  let comments = [];
  if (commentsPath && fs.existsSync(commentsPath)) {
    comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  }
  process.stdout.write(JSON.stringify({ comments }));
  process.exit(0);
}

process.stderr.write(`unsupported forge argv: ${args.join(' ')}\n`);
process.exit(1);
