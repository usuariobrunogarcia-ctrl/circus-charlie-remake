// Generates js/objdefs.js: the named objects and animations used by the HD
// graphics ("sprites ya armados"). Animations come from the ROM animation
// scripts (read by anim1/anim2/anim3/anim4/anim4b in the engine): an animation
// is a script start address, its frames are the script entries.
//   node tools/objdefs.js <inputs dir> [sheet.png]
// The inputs (tools/engine-explore.js) are replayed only to learn which
// scripts each stage uses and where each object lives.
const { CC, loadRomDir, savePng } = require('./engine-env');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const sheetOut = process.argv[3];
const roms = loadRomDir();
const rom = roms.main;
const gfx = new CC.Graphics(roms);
const r8 = (a) => rom[a & 0xffff];
const r16 = (a) => (r8(a) << 8) | r8(a + 1);

// names: script start -> [object folder, animation folder]. Objects without a
// name here are exported as "sin_nombre/anim_XXXX".
const NAMES = require('./objnames.json');

// entry formats of the script readers: record count, entry size, code/attr layout
const FORMATS = {
  3: { n: 1, codes: [0], attrs: [1], delay: 2 },                    // anim1: code, attr, delay
  4: { n: 2, codes: [0, 1], attrs: [2, 2], delay: 3 },              // anim2
  5: { n: 3, codes: [0, 1, 2], attrs: [3, 3, 3], delay: 4 },        // anim3
  6: { n: 4, codes: [0, 1, 2, 3], attrs: [4, 4, 4, 4], delay: 5 },  // anim4
  9: { n: 4, codes: [0, 1, 2, 3], attrs: [4, 5, 6, 7], delay: 8 },  // anim4b
};

/** Frames of a script: follows the 0xFF jumps until an entry repeats. */
function walk(start, size) {
  const fmt = FORMATS[size];
  const frames = [], seen = new Set();
  let y = start;
  for (let guard = 0; guard < 64; guard++) {
    if (r8(y) === 0xff) y = r16(y + 1);
    if (seen.has(y)) break;
    seen.add(y);
    frames.push({
      entry: y,
      codes: fmt.codes.map((i) => r8(y + i)),
      attrs: fmt.attrs.map((i) => r8(y + i)),
      delay: r8(y + fmt.delay),
    });
    y += size;
  }
  return frames;
}

// ------------------------------------------------------------- learn usage
const used = new Map();     // start -> {size, stages:Set, roots:Set, layout}
for (let st = 1; st <= 6; st++) {
  const f = path.join(dir, `in${st}.json`);
  if (!fs.existsSync(f)) continue;
  const seq = JSON.parse(fs.readFileSync(f, 'utf8'));
  const g = new CC.Game(CC.patchRomForEnter(rom));
  g.in.dsw1 = 0; g.in.dsw2 = 0x4b; g.boot();
  const cur = new Map();    // root -> {start, next}
  g.visFrame = function (x, n, entry, size) {
    if (this.m[0x2003] !== 2) return;
    const c = cur.get(x);
    let start = entry;
    if (c && c.size === size) {
      const nx = c.next;
      if (entry === nx || (r8(nx) === 0xff && entry === r16(nx + 1))) start = c.start;
    }
    cur.set(x, { start, next: entry + size, size });
    let u = used.get(start);
    if (!u) used.set(start, u = { size, stages: new Set(), roots: new Set(), offs: null, entries: new Set() });
    u.entries.add(entry);
    u.stages.add(this.m[0x2201] + 1);
    u.roots.add(x);
    // layout of the records relative to the first one (display coordinates)
    const m = this.m, pos = (k) => [m[x + 16 * k + 6] - 16, m[x + 16 * k + 4]];
    if (!u.offs && n > 1) {
      const p0 = pos(0);
      u.pending = { x, n };
    }
  };
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i];
    let sys = 0xff, p1 = 0xff;
    if (v & 8) sys &= ~8; if (v & 1) p1 &= ~1; if (v & 2) p1 &= ~2; if (v & 16) p1 &= ~0x10;
    g.in.system = sys; g.in.p1 = p1; g.in.p2 = p1;
    if (g.m[0x2003] === 2) g.m[0x2200] = 3;
    g.tick();
    // after the frame the positions are final
    for (const u of used.values()) {
      if (!u.pending) continue;
      const { x, n } = u.pending;
      const m = g.m, pos = (k) => [m[x + 16 * k + 6] - 16, m[x + 16 * k + 4]];
      const p0 = pos(0);
      u.offs = [];
      const w = (d) => ((d + 128) & 255) - 128;   // positions wrap at 256
      for (let k = 0; k < n; k++) { const p = pos(k); u.offs.push([w(p[0] - p0[0]), w(p[1] - p0[1])]); }
      delete u.pending;
    }
  }
}

// ------------------------------------------------------------- definitions
const anims = [];
for (const [start, u] of [...used.entries()].sort((a, b) => a[0] - b[0])) {
  const fmt = FORMATS[u.size];
  const offs = u.offs || [[0, 0]];
  let frames = walk(start, u.size);
  let lastSeen = 0;
  frames.forEach((f, i) => { if (u.entries.has(f.entry)) lastSeen = i; });
  frames = frames.slice(0, lastSeen + 1);
  // canvas: bounding box of the records (16x16 each) relative to record 0
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [dx, dy] of offs) { x0 = Math.min(x0, dx); y0 = Math.min(y0, dy); x1 = Math.max(x1, dx + 16); y1 = Math.max(y1, dy + 16); }
  const hex = start.toString(16).toUpperCase();
  const nm = NAMES[hex] || ['sin_nombre', 'anim_' + hex];
  anims.push({
    start, size: u.size, n: fmt.n, stages: [...u.stages].sort(),
    object: nm[0], name: nm[1],
    offs, box: [x0, y0, x1 - x0, y1 - y0],
    frames: frames.map((f) => [f.codes, f.attrs, f.delay]),
  });
}
const js = `/* Generated by tools/objdefs.js - objects and animations for the HD graphics. */
(function (root) {
  'use strict';
  (root.CC = root.CC || {}).OBJDEFS = ${JSON.stringify({ anims })};
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(__dirname, '..', 'js', 'objdefs.js'), js);
console.log(anims.length, 'animations');
for (const a of anims) console.log(a.start.toString(16), 'stages', a.stages.join(''), 'n', a.n, 'frames', a.frames.length, a.object + '/' + a.name);

// ------------------------------------------------------------- review sheet
if (sheetOut) {
  const CELL = 40, S = 3, PER = 12;
  const W = PER * CELL * S, H = anims.length * CELL * S;
  const buf = new Uint32Array(W * H).fill(0xff303030);
  anims.forEach((a, row) => {
    a.frames.slice(0, PER).forEach(([codes, attrs], col) => {
      codes.forEach((c, k) => {
        const code = c + 8 * (attrs[k] & 0x20), color = attrs[k] & 15;
        if (code >= gfx.numSprites) return;
        const px = gfx.spriteRGBA(code, color);
        const ox = a.offs[k][0] - a.box[0] + 4, oy = a.offs[k][1] - a.box[1] + 4;
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const sx = attrs[k] & 0x80 ? 15 - x : x, sy = attrs[k] & 0x40 ? 15 - y : y;
          const o = (sy * 16 + sx) * 4;
          if (!px[o + 3] || ox + x >= CELL || oy + y >= CELL) continue;
          const v = (255 << 24) | (px[o + 2] << 16) | (px[o + 1] << 8) | px[o];
          for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++)
            buf[((row * CELL + oy + y) * S + yy) * W + (col * CELL + ox + x) * S + xx] = v;
        }
      });
      for (let x = 0; x < CELL * S; x++) buf[(row * CELL * S) * W + col * CELL * S + x] = 0xff606060;
    });
  });
  savePng(sheetOut, W, H, buf);
}
