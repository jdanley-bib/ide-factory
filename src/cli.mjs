#!/usr/bin/env node
import { run } from './lib/run.mjs';

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});
process.exit(code);
