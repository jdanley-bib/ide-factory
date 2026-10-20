#!/usr/bin/env node
import fs from 'node:fs';

const dbPath = process.env.IDEFACTORY_FAKE_DB;
const logPath = process.env.IDEFACTORY_FAKE_LOG;
const args = process.argv.slice(2);
if (logPath) fs.appendFileSync(logPath, `${args.join('\0')}\n`);

const load = () => (dbPath && fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : []);
const save = (tasks) => fs.writeFileSync(dbPath, JSON.stringify(tasks, null, 2));

const [command, sub] = args;
if (command !== 'task') {
  process.stderr.write(`unsupported ${args.join(' ')}\n`);
  process.exit(1);
}

if (sub === 'create') {
  const title = [];
  const flags = {};
  for (let i = 2; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      const next = args[i + 1];
      flags[args[i]] = next !== undefined && !next.startsWith('-') ? args[++i] : true;
    } else title.push(args[i]);
  }
  const tasks = load();
  tasks.push({
    id: `TASK-${tasks.length + 1}`,
    title: title.join(' '),
    status: 'To Do',
    archived: false,
    labels: String(flags['-l'] || '').split(',').map((label) => label.trim()).filter(Boolean),
    description: flags['-d'] || '',
    isReady: true,
    acceptanceCriteria: flags['--ac'] ? [{ text: flags['--ac'] }] : [],
  });
  save(tasks);
  process.stdout.write(`created ${tasks.at(-1).id}\n`);
  process.exit(0);
}

if (sub === 'list') {
  process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: 'task-list', tasks: load() }));
  process.exit(0);
}

if (sub === 'view') {
  const task = load().find((item) => item.id === args[2]) || null;
  process.stdout.write(JSON.stringify({ schemaVersion: 1, kind: 'task', task }));
  process.exit(0);
}

process.stderr.write(`unsupported sub ${sub}\n`);
process.exit(1);
