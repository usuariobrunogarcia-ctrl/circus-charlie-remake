// Contact sheets of the raw catalogue: one row per object, its frames composed.
//   node tools/catalog-sheet.js <catalog-raw.json> <outdir>
const { CC, loadRomDir, savePng } = require('./env');
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outDir = process.argv[3] || '.';
const gfx = new CC.Graphics(loadRomDir());
const MAXF = 16, CELL = 64, S = 2;

function compose(parts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) { x0 = Math.min(x0, p[3]); y0 = Math.min(y0, p[4]); x1 = Math.max(x1, p[3] + 16); y1 = Math.max(y1, p[4] + 16); }
  const w = x1 - x0, h = y1 - y0, px = new Uint32Array(w * h);
  for (const p of parts) {
    const [, code, attr, dx, dy] = p;
    const rgba = gfx.spriteRGBA(code, attr & 15);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const sx = attr & 0x80 ? 15 - x : x, sy = attr & 0x40 ? 15 - y : y;
      const o = (sy * 16 + sx) * 4;
      if (!rgba[o + 3]) continue;
      px[(dy - y0 + y) * w + dx - x0 + x] = (255 << 24) | (rgba[o + 2] << 16) | (rgba[o + 1] << 8) | rgba[o];
    }
  }
  return { w, h, px };
}

// frames by shape (the colour is a palette variant)
const shapeKey = (f) => f.parts.map((p) => [p[0], p[1] & 0xc0, p[2], p[3]].join('.')).join('|');
const seen = new Map();
const frames = [];
for (const f of raw.frames) {
  const k = shapeKey(f);
  if (seen.has(k)) { frames[seen.get(k)].count += f.count; continue; }
  seen.set(k, frames.length);
  frames.push({ ...f, id: raw.frames.indexOf(f) });
}
// objects: frames that share any sprite code
const parent = frames.map((_, i) => i);
const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
const byCode = new Map();
frames.forEach((f, i) => f.parts.forEach((p) => {
  const c = p[0];
  if (byCode.has(c)) parent[find(i)] = find(byCode.get(c)); else byCode.set(c, i);
}));
const objs = new Map();
frames.forEach((f, i) => { const r = find(i); if (!objs.has(r)) objs.set(r, []); objs.get(r).push(i); });
const list = [...objs.values()].sort((a, b) => frames[a[0]].first[0] - frames[b[0]].first[0] || frames[a[0]].first[1] - frames[b[0]].first[1]);
const PER = 16;
const rows = [];
list.forEach((o, oi) => { for (let k = 0; k < o.length; k += PER) rows.push([oi, o.slice(k, k + PER)]); });
const W = PER * CELL * S, H = rows.length * CELL * S;
const buf = new Uint32Array(W * H).fill(0xff303030);
const legend = [];
rows.forEach(([oi, fl], row) => {
  legend.push(`row ${row}: object ${oi} frames ${fl.map((i) => frames[i].id).join(',')}  stages ${[...new Set(fl.flatMap((i) => frames[i].stages))].join('')}`);
  fl.forEach((fi, col) => {
    const f = frames[fi];
    const c = compose(f.parts.map((p) => [0, p[0], p[1], p[2], p[3]]));
    for (let y = 0; y < Math.min(c.h, CELL); y++) for (let x = 0; x < Math.min(c.w, CELL); x++) {
      const v = c.px[y * c.w + x];
      if (!v) continue;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++)
        buf[(row * CELL * S + y * S + yy) * W + col * CELL * S + x * S + xx] = v;
    }
    for (let x = 0; x < CELL * S; x++) buf[(row * CELL * S) * W + col * CELL * S + x] = oi % 2 ? 0xff5050a0 : 0xff606060;
    for (let y = 0; y < CELL * S; y++) buf[(row * CELL * S + y) * W + col * CELL * S] = 0xff606060;
  });
});
// split in pages of 20 rows
const PAGE = 20;
for (let p = 0; p * PAGE < rows.length; p++) {
  const h = Math.min(PAGE, rows.length - p * PAGE) * CELL * S;
  savePng(`${outDir}/objs_${p}.png`, W, h, buf.subarray(p * PAGE * CELL * S * W, p * PAGE * CELL * S * W + h * W));
}
fs.writeFileSync(`${outDir}/objs.txt`, legend.join('\n') + '\n');
console.log(list.length, 'objects', frames.length, 'frames', rows.length, 'rows');
