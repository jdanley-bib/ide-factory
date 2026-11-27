import fs from 'node:fs';

fs.writeFileSync('argv-seen.json', JSON.stringify(process.argv.slice(2)));
