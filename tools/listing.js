// Builds an annotated listing of the main program from a coverage file.
// node tools/listing.js coverage.json > listing.asm
const { loadRomDir } = require('./env');
const { disasm } = require('./dis6809');
const fs = require('fs');
const path = require('path');
const cov = JSON.parse(fs.readFileSync(process.argv[2]));
const names = fs.existsSync(path.join(__dirname, 'ramnames.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'ramnames.json'))) : {};
const rom = loadRomDir().main;
const isCode = new Uint8Array(0x10000);
for (const a of cov.code) isCode[a] = 1;
const isData = new Uint8Array(0x10000);
for (const a of cov.data) isData[a] = 1;
// static recursive descent from executed code to find unexecuted code paths
const statik = new Uint8Array(0x10000);
const extra = fs.existsSync(path.join(__dirname, 'entries.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'entries.json'))) : [];
const todo = cov.code.slice().concat(extra);
const isExtra = new Set(extra);
const labels = new Map();
const xref = new Map();
const addX = (t, f) => { if (!xref.has(t)) xref.set(t, []); xref.get(t).push(f); };
while (todo.length) {
  let pc = todo.pop();
  while (pc >= 0x6000 && pc < 0x10000) {
    if (statik[pc]) break;
    statik[pc] = 1;
    const d = disasm(rom, pc);
    const m = d.txt.split(' ')[0];
    if (d.target !== null && /^(L?B|JSR|JMP|BSR|LBSR)/.test(m) && !/^(BIT)/.test(m)) {
      if (m === 'JSR' || m === 'BSR' || m === 'LBSR') labels.set(d.target, 'sub'); else if (!labels.has(d.target)) labels.set(d.target, 'loc');
      addX(d.target, pc);
      if (d.target >= 0x6000 && !d.txt.includes('[')) todo.push(d.target);
    }
    if (/^(RTS|RTI|JMP|BRA|LBRA|PULS.*PC|PULU.*PC)/.test(d.txt)) break;
    pc = d.pc;
  }
}
for (const [t] of Object.entries(cov.calls)) labels.set(+t, 'sub');
for (const t of extra) if (!labels.has(t)) labels.set(t, 'tbl');
for (const [from, tos] of Object.entries(cov.ijump)) for (const t of Object.keys(tos)) { if (!labels.has(+t)) labels.set(+t, 'loc'); addX(+t, +from); }
const H = (v, n = 4) => v.toString(16).toUpperCase().padStart(n, '0');
const lab = (a) => (labels.get(a) || 'loc') + '_' + H(a);
const lines = [];
let a = 0x6000;
while (a < 0x10000) {
  if (statik[a]) {
    if (labels.has(a)) {
      const xs = xref.get(a) || [];
      lines.push('');
      lines.push(lab(a) + ':' + (xs.length ? '    ; <- ' + xs.slice(0, 8).map(x => H(x)).join(' ') + (xs.length > 8 ? ' ...' : '') : ''));
    }
    const d = disasm(rom, a);
    let txt = d.txt;
    if (d.target !== null && labels.has(d.target)) txt = txt.replace('$' + H(d.target), lab(d.target));
    // RAM names
    txt = txt.replace(/\$([0-9A-F]{4})/g, (s, h) => { const v = parseInt(h, 16); return names[H(v)] ? names[H(v)] : s; });
    txt = txt.replace(/<\$([0-9A-F]{2})/g, (s, h) => { const n = names['DP' + h]; return n ? '<' + n : s; });
    lines.push('  ' + H(a) + ': ' + d.bytes.join(' ').padEnd(12) + ' ' + txt + (isCode[a] ? '' : '   ; (no ejecutado)'));
    a = d.pc;
  } else {
    const start = a; const bytes = [];
    while (a < 0x10000 && !statik[a] && bytes.length < 16) { bytes.push(rom[a]); a++; if (labels.has(a)) break; }
    if (labels.has(start)) lines.push(lab(start) + ':');
    lines.push('  ' + H(start) + ': FCB ' + bytes.map(b => H(b, 2)).join(' ') + '   ' + (bytes.some((_, i) => isData[start + i]) ? '; datos' : '; no leido'));
  }
}
console.log(lines.join('\n'));
