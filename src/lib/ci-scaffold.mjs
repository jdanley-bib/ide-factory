import fs from 'node:fs';
import path from 'node:path';
import { halted, writeText } from './layout.mjs';

export const CONSUMER_WORKFLOW_RELATIVE = '.github/workflows/factory-consumer.yml';

/**
 * Consumer baseline only. Not installed by init or upgrade, and never written
 * over this repository's ci.yml or release.yml.
 */
export const CONSUMER_WORKFLOW = `name: factory-consumer

on:
  pull_request:
  push:

permissions:
  contents: read

jobs:
  baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm audit --audit-level=high
      - run: npx openspec validate --all
`;

/**
 * Write the consumer workflow only when it is absent.
 * @param {string} project
 * @returns {string} absolute path written
 */
export function scaffoldConsumerCi(project) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const file = path.join(project, CONSUMER_WORKFLOW_RELATIVE);
  if (fs.existsSync(file)) {
    throw new Error(`consumer workflow already exists: ${CONSUMER_WORKFLOW_RELATIVE}`);
  }
  const resolved = path.resolve(file);
  const workflows = path.resolve(project, '.github', 'workflows');
  if (resolved !== path.join(workflows, 'factory-consumer.yml')) {
    throw new Error('ci scaffold refuses to write outside the consumer workflow path');
  }
  writeText(file, CONSUMER_WORKFLOW);
  return file;
}
