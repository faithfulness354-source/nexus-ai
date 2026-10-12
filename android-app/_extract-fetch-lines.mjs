import fs from 'fs';
import path from 'path';

const roots = [
  'android/app/src/main/assets/public/_next/static/chunks',
  'out/_next/static/chunks',
];
const needle = 'fetch("/api/upload/presigned"';
for (const root of roots) {
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    const source = fs.readFileSync(file, 'utf8');
    let from = 0;
    while (true) {
      const at = source.indexOf(needle, from);
      if (at < 0) break;
      console.log('\nFILE', file.replaceAll('\\', '/'));
      console.log(source.slice(at - 160, at + 220).replace(/\s+/g, ' '));
      from = at + needle.length;
    }
  }
}
