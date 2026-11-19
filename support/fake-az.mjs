#!/usr/bin/env node
/**
 * Stub Azure CLI for unit tests. Records argv and never opens a network socket.
 * Env:
 *   IDEFACTORY_AZ_LOG     — append each argv as one JSON line
 *   IDEFACTORY_AZ_DB      — JSON state for pull requests, threads, and work items
 *   IDEFACTORY_AZ_ENV_LOG — append whether AZURE_DEVOPS_EXT_PAT was present (never its value)
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const logPath = process.env.IDEFACTORY_AZ_LOG;
const dbPath = process.env.IDEFACTORY_AZ_DB;
const envLogPath = process.env.IDEFACTORY_AZ_ENV_LOG;

if (logPath) fs.appendFileSync(logPath, `${JSON.stringify(args)}\n`);
if (envLogPath) {
  fs.appendFileSync(envLogPath, `${JSON.stringify({
    pat: process.env.AZURE_DEVOPS_EXT_PAT ? 'present' : 'absent',
    patLength: (process.env.AZURE_DEVOPS_EXT_PAT || '').length,
  })}\n`);
}

function loadDb() {
  if (dbPath && fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  return {};
}

function saveDb(db) {
  if (dbPath) fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function flag(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function multi(name) {
  const index = args.indexOf(name);
  if (index < 0) return [];
  const values = [];
  for (let i = index + 1; i < args.length && !args[i].startsWith('--'); i += 1) values.push(args[i]);
  return values;
}

function reply(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exit(0);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const head = args.slice(0, 3).join(' ');
const db = loadDb();
db.pullRequests ||= {};
db.threads ||= {};
db.workItems ||= {};
db.nextPullRequest ||= 1;
db.nextWorkItem ||= 100;
db.nextThread ||= 1;

if (head === 'repos pr create') {
  const id = db.nextPullRequest;
  db.nextPullRequest += 1;
  db.pullRequests[id] = {
    sourceRefName: `refs/heads/${flag('--source-branch')}`,
    title: flag('--title'),
    description: flag('--description'),
  };
  saveDb(db);
  reply({ pullRequestId: id, status: 'active' });
}

if (head === 'repos pr update') {
  const id = flag('--id');
  if (!db.pullRequests[id]) fail(`pull request ${id} not found`);
  db.pullRequests[id].description = flag('--description');
  saveDb(db);
  reply({ pullRequestId: Number(id), status: 'active' });
}

if (args[0] === 'devops' && args[1] === 'invoke') {
  const route = Object.fromEntries(multi('--route-parameters').map((pair) => pair.split('=')));
  const id = route.pullRequestId;
  const method = flag('--http-method');
  if (method === 'POST') {
    const body = JSON.parse(fs.readFileSync(flag('--in-file'), 'utf8'));
    const threadId = db.nextThread;
    db.nextThread += 1;
    db.threads[id] ||= [];
    db.threads[id].push({
      id: threadId,
      comments: body.comments.map((comment, index) => ({
        id: index + 1,
        content: comment.content,
        commentType: 'text',
        author: { uniqueName: 'factory-bot@example.com' },
        publishedDate: '2026-11-19T00:00:00Z',
      })),
    });
    saveDb(db);
    reply({ id: threadId });
  }
  reply({ value: db.threads[id] || [] });
}

function parseFields(values) {
  const fields = {};
  for (const pair of values) {
    const index = pair.indexOf('=');
    if (index > 0) fields[pair.slice(0, index)] = pair.slice(index + 1);
  }
  return fields;
}

if (head === 'boards work-item create') {
  const id = db.nextWorkItem;
  db.nextWorkItem += 1;
  const item = {
    id,
    rev: 1,
    fields: {
      'System.WorkItemType': flag('--type'),
      'System.Title': flag('--title'),
      'System.Description': flag('--description'),
      'System.State': 'New',
      ...parseFields(multi('--fields')),
    },
    comments: [],
    relations: [],
  };
  db.workItems[id] = item;
  saveDb(db);
  reply(item);
}

if (head === 'boards work-item update') {
  const id = flag('--id');
  const item = db.workItems[id];
  if (!item) fail(`work item ${id} not found`);
  if (flag('--state')) item.fields['System.State'] = flag('--state');
  if (flag('--description')) item.fields['System.Description'] = flag('--description');
  Object.assign(item.fields, parseFields(multi('--fields')));
  if (flag('--discussion')) item.comments.push(flag('--discussion'));
  item.rev += 1;
  saveDb(db);
  reply(item);
}

if (head === 'boards work-item show') {
  const item = db.workItems[flag('--id')];
  if (!item) fail(`work item ${flag('--id')} not found`);
  reply(item);
}

if (args.slice(0, 4).join(' ') === 'boards work-item relation add') {
  const item = db.workItems[flag('--id')];
  if (!item) fail(`work item ${flag('--id')} not found`);
  item.relations.push({ rel: flag('--relation-type'), url: flag('--target-url') });
  saveDb(db);
  reply(item);
}

fail(`unsupported az argv: ${args.join(' ')}`);
