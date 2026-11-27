import fs from 'node:fs';

const armed = '.factory/work/transient.armed';
if (fs.existsSync(armed)) {
  fs.unlinkSync(armed);
  process.exit(127);
}
const tests = fs.existsSync('tests.json') ? JSON.parse(fs.readFileSync('tests.json', 'utf8')) : [];
let failed = 0;
for (const entry of tests) {
  if (!fs.existsSync(entry.requires)) {
    console.log(`FAIL ${entry.name}`);
    failed = 1;
  }
}
process.exit(failed);
