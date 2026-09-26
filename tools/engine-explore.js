// Search based bot on the rewritten engine (fast): tries random input chunks from
// saved states, keeps the ones that progress without dying, backtracks when
// stuck, until the stage is cleared. Saves the inputs (one number per frame:
// 1 left, 2 right, 8 start, 16 button) for tools/hybrid.js "file" and tools/catalog.js.
//   node tools/engine-explore.js <stage 1-6> <out.json> [maxFrames] [seed]
const { CC, loadRomDir } = require('./engine-env');
const fs = require('fs');
const st = +process.argv[2] || 1;
const out = process.argv[3] || `inputs_s${st}.json`;
const MAXF = +process.argv[4] || 20000;
let seed = +process.argv[5] || 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const roms = loadRomDir();
const g = new CC.Game(CC.patchRomForEnter(roms.main));
g.in.dsw1 = 0; g.in.dsw2 = 0x4b; g.boot();
const sprBuf = new Uint8Array(256);

let dist = 0, lastScroll = 0;
const inputs = [];
function step(v, rec) {
  let sys = 0xff, p1 = 0xff;
  if (v & 8) sys &= ~8;
  if (v & 1) p1 &= ~1;
  if (v & 2) p1 &= ~2;
  if (v & 16) p1 &= ~0x10;
  g.in.system = sys; g.in.p1 = p1; g.in.p2 = p1;
  g.tick();
  let d = (g.out.scroll - lastScroll) & 0xff; if (d > 127) d -= 256;
  dist -= d; lastScroll = g.out.scroll;
  if (rec) inputs.push(v);
}
const save = () => ({ m: g.m.slice(), out: { ...g.out }, dist, lastScroll, n: inputs.length });
const load = (s) => { g.m.set(s.m); Object.assign(g.out, s.out); dist = s.dist; lastScroll = s.lastScroll; inputs.length = s.n; };
const dead = (lives0) => g.m[0x2200] < lives0 || g.m[0x2006] === 5 || (g.m[0x2003] === 2 && g.m[0x2006] < 3);
const cleared = () => g.m[0x2006] === 4;

// boot and choose the stage (same timing as tools/scripts.js playStage)
const pre = require('./scripts').playStage(st, 1);
const preLen = 420 + 6 + 60 + (st - 1) * 26 + 6;
for (let f = 0; f < preLen; f++) {
  const i = pre(f);
  step((i.start1 ? 8 : 0) | (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.button ? 16 : 0), true);
}
while (!(g.m[0x2003] === 2 && g.m[0x2006] === 3) && inputs.length < 5000) step(0, true);
for (let i = 0; i < 60; i++) step(0, true);
console.error('stage', g.m[0x2201] + 1, 'at frame', inputs.length);

const SEG = 16, LOOK = 60, K = 12;
const POLICIES = [
  () => 0, (i) => (i < 4 ? 16 : 0), (i) => 2 | (i < 4 ? 16 : 0), (i) => 1 | (i < 4 ? 16 : 0), () => 2, () => 1,
];
function chunk() {
  const seq = [];
  while (seq.length < SEG) {
    const x = rnd();
    const dir = x < 0.6 ? 2 : x > 0.85 ? 1 : 0;
    const btn = rnd() < 0.3;
    const n = 2 + Math.floor(rnd() * 12);
    for (let i = 0; i < n && seq.length < SEG; i++) seq.push(dir | (btn && i < 4 ? 16 : 0));
  }
  return seq;
}
const stack = [];
let fails = 0;
while (inputs.length < MAXF && !cleared()) {
  const base = save();
  const lives0 = g.m[0x2200];
  let best = null, bestScore = -1e9;
  for (let k = 0; k < K; k++) {
    load(base);
    const c = chunk();
    let bad = false, won = false;
    for (const v of c) { step(v); if (cleared()) { won = true; break; } if (dead(lives0)) { bad = true; break; } }
    if (bad) continue;
    if (won) { best = c; break; }
    const d1 = dist, mid = save();
    let ok = false;
    for (const pol of POLICIES) {
      load(mid);
      let b2 = false;
      for (let i = 0; i < LOOK; i++) { step(pol(i)); if (cleared()) break; if (dead(lives0)) { b2 = true; break; } }
      if (!b2) { ok = true; break; }
    }
    if (!ok) continue;
    const score = d1 + rnd() * 3;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  load(base);
  if (!best) {
    fails++;
    const back = Math.min(stack.length, 1 + Math.floor(rnd() * Math.min(8, 1 + fails / 3)));
    let b = null;
    for (let i = 0; i < back; i++) b = stack.pop();
    if (b) load(b);
    if (fails > 300) { console.error('stuck at', inputs.length); break; }
    continue;
  }
  fails = Math.max(0, fails - 1);
  stack.push(base);
  if (stack.length > 600) stack.shift();
  for (const v of best) { step(v, true); if (cleared()) break; }
}
// let the stage clear sequence play
for (let i = 0; i < 900; i++) step(0, true);
fs.writeFileSync(out, JSON.stringify(inputs));
console.error('done', cleared() || g.m[0x2201] + 1 !== st ? 'CLEARED' : 'not cleared', 'frames', inputs.length, 'dist', dist);
