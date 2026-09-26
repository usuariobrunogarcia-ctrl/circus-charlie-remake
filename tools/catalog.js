// Plays every stage with a bot on the rewritten engine and records which sprites
// belong to script driven animations (visFrame hook) and which are set directly.
//   node tools/catalog.js [frames per stage] > report
const { CC, loadRomDir } = require('./engine-env');
const scripts = require('./scripts');
const FR = +process.argv[2] || 4000;
const roms = loadRomDir();
const gfx = new CC.Graphics(roms);
// sprites whose pixels are all transparent
const blank = new Uint8Array(gfx.numSprites);
for (let c = 0; c < gfx.numSprites; c++) {
  const px = gfx.spriteRGBA(c, 1);
  let any = false;
  for (let i = 3; i < px.length; i += 4) if (px[i]) { any = true; break; }
  blank[c] = any ? 0 : 1;
}

const report = { anims: {}, direct: {} };
for (let st = 1; st <= 6; st++) {
  const g = new CC.Game(CC.patchRomForEnter(roms.main));
  g.in.dsw1 = 0; g.in.dsw2 = 0x4b; g.boot();
  const groups = new Map();       // root -> {n, entry, start, frame}
  let f = 0;
  g.visFrame = function (x, n, entry, size) {
    const cur = groups.get(x);
    let start = entry;
    if (cur && cur.n === n) {
      const nx = cur.next;
      if (entry === nx || (this.rom8(nx) === 0xff && entry === this.rom16(nx + 1))) start = cur.start;
    }
    groups.set(x, { n, entry, start, frame: f, next: entry + size });
  };
  const script = scripts.playStage(st, 11);
  for (f = 0; f < FR; f++) {
    const i = script(f); let sys = 0xff, p1 = 0xff;
    if (i.start1) sys &= ~8; if (i.left) p1 &= ~1; if (i.right) p1 &= ~2; if (i.button) p1 &= ~0x10;
    g.in.system = sys; g.in.p1 = p1; g.in.p2 = p1;
    if (f > 700 && g.m[0x2003] === 2) g.m[0x2200] = 3;
    try { g.tick(); } catch (e) { if (!(e instanceof CC.Game.Todo)) throw e; }
    if (g.m[0x2003] !== 2) continue;
    const m = g.m, stage = m[0x2201] + 1;
    const covered = new Set();
    for (const [x, gr] of groups) for (let k = 0; k < gr.n; k++) covered.add(x + 16 * k);
    for (let u = 0x2400; u < 0x2800; u += 16) {
      const code = m[u + 14] + 8 * (m[u + 15] & 0x20);
      const y = m[u + 6], x = m[u + 4];
      if (blank[code] || y < 16 || y >= 240 || !x) continue;
      if (covered.has(u)) {
        const root = [...groups.keys()].find((r) => u >= r && u < r + 16 * groups.get(r).n);
        const gr = groups.get(root);
        const key = `s${stage} ${gr.start.toString(16)}`;
        const a = report.anims[key] || (report.anims[key] = { n: gr.n, frames: {} });
        a.frames[gr.entry.toString(16)] = (a.frames[gr.entry.toString(16)] || 0) + 1;
      } else {
        const key = `s${stage} ${u.toString(16)}`;
        const d = report.direct[key] || (report.direct[key] = {});
        d[code.toString(16)] = (d[code.toString(16)] || 0) + 1;
      }
    }
  }
}
console.log(JSON.stringify(report, null, 1));
