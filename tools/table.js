// Prints a table of 16-bit words: node tools/table.js <addr> <count> [--add]
const { loadRomDir } = require('./env');
const fs = require('fs'); const path = require('path');
const r = loadRomDir().main;
const a = parseInt(process.argv[2], 16), n = +process.argv[3];
const w = [];
for (let i = 0; i < n; i++) w.push((r[a + i * 2] << 8) | r[a + i * 2 + 1]);
console.log(w.map((v) => v.toString(16)).join(' '));
if (process.argv.includes('--add')) {
  const f = path.join(__dirname, 'entries.json');
  const cur = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
  for (const v of w) if (v >= 0x6000 && !cur.includes(v)) cur.push(v);
  fs.writeFileSync(f, JSON.stringify(cur.sort((x, y) => x - y)));
  console.log('entries:', cur.length);
}
