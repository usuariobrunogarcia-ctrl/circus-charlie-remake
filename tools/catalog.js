// Builds the raw sprite catalogue: replays the bot inputs of every stage on the
// rewritten engine, finds which 16x16 sprites always move together (objects) and
// records every frame (combination of sprites) of every object.
//   node tools/catalog.js <inputs dir> <out.json>
// Inputs: <dir>/in<stage>.json (tools/engine-explore.js, played with CHEAT=1 rule).
const { CC, loadRomDir } = require('./engine-env');
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
const out = process.argv[3] || 'catalog-raw.json';
const roms = loadRomDir();
const gfx = new CC.Graphics(roms);
const blank = new Uint8Array(gfx.numSprites);
for (let c = 0; c < gfx.numSprites; c++) {
  const px = gfx.spriteRGBA(c, 1);
  let any = false;
  for (let i = 3; i < px.length; i += 4) if (px[i]) { any = true; break; }
  blank[c] = any ? 0 : 1;
}

// one sprite of record r (0-63): display position, code, attributes
function sprite(m, r) {
  const u = 0x2400 + r * 16;
  const attr = m[u + 15];
  const code = m[u + 14] + 8 * (attr & 0x20);
  const x = m[u + 6] - 16, y = m[u + 4];
  // off-screen parts are kept (the frame stays whole); y = 0 means parked
  if (blank[code] || y === 0 || y >= 240) return null;
  return { r, code, attr, x, y };
}

function replay(st, onFrame, setup) {
  const f = path.join(dir, `in${st}.json`);
  if (!fs.existsSync(f)) return false;
  const seq = JSON.parse(fs.readFileSync(f, 'utf8'));
  const g = new CC.Game(CC.patchRomForEnter(roms.main));
  g.in.dsw1 = 0; g.in.dsw2 = 0x4b; g.boot();
  if (setup) setup(g);
  for (let i = 0; i < seq.length; i++) {
    const v = seq[i];
    let sys = 0xff, p1 = 0xff;
    if (v & 8) sys &= ~8; if (v & 1) p1 &= ~1; if (v & 2) p1 &= ~2; if (v & 16) p1 &= ~0x10;
    g.in.system = sys; g.in.p1 = p1; g.in.p2 = p1;
    if (g.m[0x2003] === 2) g.m[0x2200] = 3;
    g.tick();
    if (g.m[0x2003] === 2 && g.m[0x2201] === st - 1 && g.m[0x2006] >= 3 && g.m[0x2006] <= 5) onFrame(g.m, i);
  }
  return true;
}

const touching = (a, b) => Math.abs(a.x - b.x) <= 16 && Math.abs(a.y - b.y) <= 16;
const result = { groups: {}, frames: [], transitions: [] };
const frameIndex = new Map();
const trans = new Map();
// touching clusters of sprites
function clusters(list) {
  const out = [], used = new Array(list.length).fill(false);
  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    const cl = [list[i]]; used[i] = true;
    for (let k = 0; k < cl.length; k++) {
      for (let j = 0; j < list.length; j++) {
        if (!used[j] && touching(cl[k], list[j])) { used[j] = true; cl.push(list[j]); }
      }
    }
    out.push(cl);
  }
  return out;
}
function framePartsOf(cl) {
  const x0 = Math.min(...cl.map((p) => p.x)), y0 = Math.min(...cl.map((p) => p.y));
  return cl.map((p) => [p.code, p.attr & 0xdf, p.x - x0, p.y - y0])
    .sort((a, b) => a[3] - b[3] || a[2] - b[2] || a[0] - b[0]);
}
const frameKey = (cl) => framePartsOf(cl).map((p) => p.join('.')).join('|');
for (let st = 1; st <= 6; st++) {
  // pass 1: rigid pairs of records (measured while they move) and script driven groups
  const pairs = new Map();       // "a,b" -> Map(offset -> count) ("a,bs": while static)
  const staticSplit = new Map();
  const scripted = new Set();    // "root,n" from the animation script readers
  let prev = [];
  const ok = replay(st, (m) => {
    const s = [];
    for (let r = 0; r < 64; r++) s[r] = sprite(m, r);
    for (let a = 0; a < 64; a++) {
      if (!s[a]) continue;
      const moving = prev[a] && (prev[a].x !== s[a].x || prev[a].y !== s[a].y);
      for (let b = a + 1; b < Math.min(64, a + 9); b++) {
        if (!s[b] && !moving) {
          // appears without its neighbour: not the same static object
          const k = a + ',' + b + 's';
          staticSplit.set(k, (staticSplit.get(k) || 0) + 1);
          continue;
        }
        if (!s[b]) continue;
        if (!moving) {
          const k = a + ',' + b + 's';
          let h = pairs.get(k);
          if (!h) pairs.set(k, h = new Map());
          const o = (s[b].x - s[a].x) + ',' + (s[b].y - s[a].y);
          h.set(o, (h.get(o) || 0) + 1);
          continue;
        }
        const k = a + ',' + b;
        let h = pairs.get(k);
        if (!h) pairs.set(k, h = new Map());
        const o = (s[b].x - s[a].x) + ',' + (s[b].y - s[a].y);
        h.set(o, (h.get(o) || 0) + 1);
      }
    }
    prev = s;
  }, (g) => {
    g.visFrame = function (x, n) { if (this.m[0x2003] === 2) scripted.add(((x - 0x2400) >> 4) + ',' + n); };
  });
  const scriptedRec = new Set();
  for (const k of scripted) {
    const [r, n] = k.split(',').map(Number);
    for (let i = 0; i < n; i++) scriptedRec.add(r + i);
  }
  const parent = [...Array(64).keys()];
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  for (const [k, h] of pairs) {
    const tot = [...h.values()].reduce((x, y) => x + y, 0);
    const top = Math.max(...h.values());
    const [ox, oy] = [...h.entries()].find(([, c]) => c === top)[0].split(',').map(Number);
    const near = Math.abs(ox) <= 16 && Math.abs(oy) <= 16;
    const isStatic = k.endsWith('s');
    // moving together, or never moving and always shown together
    const linked = isStatic
      ? !pairs.has(k.slice(0, -1)) && tot >= 30 && top === tot && !(staticSplit.get(k) > 0)
      : tot >= 10 && top / tot >= 0.97;
    const [pa, pb] = k.replace('s', '').split(',').map(Number);
    if (linked && near && !scriptedRec.has(pa) && !scriptedRec.has(pb)) {
      const [a, b] = [pa, pb];
      parent[find(b)] = find(a);
    }
  }
  for (const k of scripted) {
    const [r, n] = k.split(',').map(Number);
    for (let i = 1; i < n && r + i < 64; i++) parent[find(r + i)] = find(r);
  }
  const groups = new Map();
  for (let r = 0; r < 64; r++) {
    const root = find(r);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  }
  const groupOf = new Int16Array(64);
  const glist = [...groups.values()];
  glist.forEach((g, i) => g.forEach((r) => { groupOf[r] = i; }));

  // pass 2: frames. Inside a record group the visible sprites are split into
  // touching clusters; a frame is the set of (code, attributes, offset) of a cluster.
  result.groups[st] = glist.filter((g) => g.length > 0).map((g) => g.map((r) => 0x2400 + r * 16));
  const lastKey = new Map();     // record -> frame key shown by its cluster last frame
  replay(st, (m, t) => {
    const s = [];
    for (let r = 0; r < 64; r++) s[r] = sprite(m, r);
    const now = new Map();
    for (const recs of glist) {
      for (const cl of clusters(recs.filter((r) => s[r]).map((r) => s[r]))) {
        const key = frameKey(cl);
        let fr = frameIndex.get(key);
        if (fr === undefined) {
          fr = result.frames.length;
          frameIndex.set(key, fr);
          result.frames.push({ key, parts: framePartsOf(cl), count: 0, stages: [], first: [st, t] });
        }
        const F = result.frames[fr];
        F.count++;
        if (!F.stages.includes(st)) F.stages.push(st);
        for (const p of cl) {
          const prevFr = lastKey.get(p.r);
          if (prevFr !== undefined && prevFr !== fr) {
            const tk = prevFr + '>' + fr;
            trans.set(tk, (trans.get(tk) || 0) + 1);
          }
          now.set(p.r, fr);
        }
      }
    }
    lastKey.clear();
    for (const [k, v] of now) lastKey.set(k, v);
  });
  console.error(`stage ${st}: ${glist.length} record groups, ${result.frames.length} frames so far`);
}
result.transitions = [...trans.entries()].map(([k, c]) => [...k.split('>').map(Number), c]);
fs.writeFileSync(out, JSON.stringify(result));
