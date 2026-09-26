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
const CHEAT = !!process.env.CHEAT;
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
  if (CHEAT && g.m[0x2003] === 2) g.m[0x2200] = 3;   // infinite lives (same rule when replaying)
  g.tick();
  let d = (g.out.scroll - lastScroll) & 0xff; if (d > 127) d -= 256;
  dist -= d; lastScroll = g.out.scroll;
  if (rec) inputs.push(v);
}
const save = () => ({ m: g.m.slice(), out: { ...g.out }, busy: g.busy, frames: g.frames, dist, lastScroll, n: inputs.length });
const load = (s) => { g.m.set(s.m); Object.assign(g.out, s.out); g.busy = s.busy; g.frames = s.frames; g.soundCommands.length = 0; dist = s.dist; lastScroll = s.lastScroll; inputs.length = s.n; };
// the "OH NO!!" sign (sprites 0x16-0x18) appears as soon as Charlie is hit
function ohNo() {
  const m = g.m;
  for (let u = 0x2400; u < 0x2800; u += 16) {
    const c = m[u + 14] + 8 * (m[u + 15] & 0x20);
    if (c >= 0x16 && c <= 0x18 && m[u + 6] >= 16 && m[u + 6] < 240) return true;
  }
  return false;
}
const dead = (lives0) => ohNo() || g.m[0x2200] < lives0 || g.m[0x2006] === 5 || (g.m[0x2003] === 2 && g.m[0x2006] < 3);
const cleared = () => g.m[0x2006] === 4;

// boot and choose the stage (same timing as tools/scripts.js playStage)
const pre = require('./scripts').playStage(st, 1);
const preLen = 420 + 6 + 60 + (st - 1) * 26 + 6;
for (let f = 0; f < preLen; f++) {
  const i = pre(f);
  step((i.start1 ? 8 : 0) | (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.button ? 16 : 0), true);
}
while (!(g.m[0x2003] === 2 && g.m[0x2006] === 3) && inputs.length < 5000) step(0, true);
console.error('stage', g.m[0x2201] + 1, 'at frame', inputs.length);

const SEG = 16, LOOK = +process.env.LOOK || 60, K = 16;
const POLICIES = [
  () => 0, (i) => (i < 4 ? 16 : 0), (i) => 2 | (i < 4 ? 16 : 0), (i) => 1 | (i < 4 ? 16 : 0), () => 2, () => 1,
];
function chunk() {
  const seq = [];
  const style = rnd();
  while (seq.length < SEG) {
    const x = rnd();
    const dir = x < 0.6 ? 2 : x > 0.85 ? 1 : 0;
    const btn = rnd() < 0.3;
    const n = 2 + Math.floor(rnd() * 12);
    for (let i = 0; i < n && seq.length < SEG; i++) {
      // half of the chunks press the button at random frames (timing based stages)
      const b = style < 0.5 ? (btn && i < 4) : rnd() < 0.2;
      seq.push(dir | (b ? 16 : 0));
    }
  }
  return seq;
}
const stack = [];
let fails = 0, bestLen = 0;
while (inputs.length < MAXF && !cleared()) {
  const base = save();
  const lives0 = g.m[0x2200];
  let best = null, bestScore = -1e9;
  for (let k = 0; k < K; k++) {
    load(base);
    const c = chunk();
    let bad = false, won = false;
    for (const v of c) { step(v); if (cleared()) { won = true; break; } if (dead(lives0)) { bad = true; break; } }
    if (bad) { if (process.env.DBG2) console.error('dead', g.m[0x2200], lives0, g.m[0x2003], g.m[0x2006]); continue; }
    if (won) { best = c; break; }
    const d1 = dist, mid = save();
    let ok = false;
    for (const pol of POLICIES) {
      load(mid);
      let b2 = false;
      for (let i = 0; i < LOOK; i++) { step(pol(i)); if (cleared()) break; if (dead(lives0)) { b2 = true; break; } }
      if (!b2) { ok = true; break; }
    }
    if (!ok) { if (process.env.DBG2) console.error('look dead', g.m[0x2200], lives0, g.m[0x2003], g.m[0x2006], 'cam', g.m[0x2203], g.m[0x2204]); continue; }
    const score = d1 + rnd() * 3;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  load(base);
  if (!best) {
    fails++;
    if (process.env.DBG && fails % 20 === 0) console.error('fail', fails, inputs.length, 'best', bestLen);
    const back = Math.min(stack.length, 1 + Math.floor(rnd() * Math.min(40, 1 + fails / 4)));
    let b = null;
    for (let i = 0; i < back; i++) b = stack.pop();
    if (b) load(b);
    if (CHEAT && fails > 300) {
      // accept a death and go on from the checkpoint
      console.error('accepting a death at', inputs.length);
      for (const v of chunk()) step(v, true);
      while ((ohNo() || !(g.m[0x2003] === 2 && g.m[0x2006] === 3 && (st < 5 || g.m[0x2800] === 1))) && !cleared() && inputs.length < MAXF) step(0, true);
      fails = 0; bestLen = inputs.length; stack.length = 0;
      continue;
    }
    if (fails > 2000) { console.error('stuck at', inputs.length); break; }
    continue;
  }
  if (inputs.length > bestLen + 64) { bestLen = inputs.length; fails = 0; }
  if (process.env.DBG && (inputs.length & 255) < SEG) console.error('frames', inputs.length, 'dist', dist, 'lives', g.m[0x2200], 'cam', g.m[0x2203], g.m[0x2204]);
  stack.push(base);
  if (stack.length > 600) stack.shift();
  for (const v of best) { step(v, true); if (cleared()) break; }
}
// let the stage clear sequence play
for (let i = 0; i < 900; i++) step(0, true);
fs.writeFileSync(out, JSON.stringify(inputs));
console.error('done', cleared() || g.m[0x2201] + 1 !== st ? 'CLEARED' : 'not cleared', 'frames', inputs.length, 'dist', dist);
