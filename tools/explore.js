// Search based bot: plays the game from start through all stages using save
// states (tries random input chunks, keeps the ones that make progress without
// losing a life, backtracks when stuck). Records sprite/tile usage along the
// committed path.  node tools/explore.js <out.json.gz> <startStage> <maxFrames> [seed]
const { CC, loadRomDir, savePng } = require('./env');
const fs = require('fs');
const zlib = require('zlib');
const out = process.argv[2];
const startStage = +process.argv[3] || 1;
const MAXF = +process.argv[4] || 30000;
let seed = +process.argv[5] || 1;
const SHOTS = process.env.SHOTS;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const roms = loadRomDir();
const m = new CC.CircusCharlie(roms);
const gfx = new CC.Graphics(roms);
let vs = null;
m.onVideoFrame = (mm) => { vs = mm.videoState(vs); };
const LIVES = 0x2200;
function ohNo() {
  const b = m.mem;
  for (let base = 0x3800; base < 0x3a00; base += 0x100)
    for (let o = 0; o < 0x100; o += 4) {
      const code = b[base + o] + 8 * (b[base + o + 1] & 0x20);
      if (code >= 0x16 && code <= 0x18 && b[base + o + 3]) return true;
    }
  return false;
}

function capture() {
  const list = [];
  for (let o = 0; o < 0x100; o += 4) {
    const a1 = vs.sprites[o + 1];
    list.push([o >> 2, vs.sprites[o] + 8 * (a1 & 0x20), a1 & 15, a1 & 0xc0, vs.sprites[o + 2], vs.sprites[o + 3]]);
  }
  const t = new Uint16Array(0x400);
  for (let i = 0; i < 0x400; i++) { const at = vs.colorram[i]; t[i] = (vs.videoram[i] + ((at & 0x20) << 3)) * 16 + (at & 15); }
  return { s: list, sc: vs.scroll, t, st: m.mem[0x2201] + 1 };
}

let dist = 0, lastScroll = 0;
const inputs = [];   // committed inputs (INPUTS=<file> saves them for tools/hybrid.js)
function step(inp, rec) {
  if (rec) inputs.push(inp);
  m.setInputs(inp);
  m.runFrame(false);
  let d = (m.scroll - lastScroll) & 0xff; if (d > 127) d -= 256;
  dist += d; lastScroll = m.scroll;
  if (rec && vs) rec.push(capture());
}
// boot + select stage
const boot = [];
for (let i = 0; i < 420; i++) boot.push({});
for (let i = 0; i < 6; i++) boot.push({ start1: 1 });
for (let i = 0; i < 60; i++) boot.push({});
for (let s = 1; s < startStage; s++) { for (let i = 0; i < 6; i++) boot.push({ right: 1 }); for (let i = 0; i < 20; i++) boot.push({}); }
for (let i = 0; i < 6; i++) boot.push({ button: 1 });
for (let i = 0; i < 200; i++) boot.push({});
const recorded = [];
for (const b of boot) step(b, recorded);
const livesStart = m.mem[LIVES];
console.error('lives', livesStart);

const SEG = 20, LOOK = 45, K = 10;
const POLICIES = [
  () => ({}),
  (i) => ({ button: i < 4 }),
  (i) => ({ right: true, button: i < 4 }),
  (i) => ({ left: true, button: i < 4 }),
  (i) => ({ right: true }),
  (i) => ({ left: true }),
];
function randomChunk() {
  const seq = [];
  while (seq.length < SEG) {
    const x = rnd();
    const hold = { right: x < 0.55, left: x > 0.85, button: rnd() < 0.25 };
    const n = 2 + Math.floor(rnd() * 14);
    for (let i = 0; i < n && seq.length < SEG; i++) seq.push(i < 4 || !hold.button ? hold : { right: hold.right, left: hold.left });
  }
  return seq;
}
const stack = [];   // {state, dist, lastScroll, recLen}
let frames = 0, fails = 0, lastShot = 0;
while (frames < MAXF) {
  const base = { state: m.saveState(), dist, lastScroll, recLen: recorded.length, inLen: inputs.length };
  const lives0 = m.mem[LIVES];
  let best = null, bestScore = -1e9;
  for (let k = 0; k < K; k++) {
    const chunk = randomChunk();
    m.loadState(base.state); dist = base.dist; lastScroll = base.lastScroll;
    let dead = false;
    for (const inp of chunk) { step(inp); if (m.mem[LIVES] < lives0 || ohNo()) { dead = true; break; } }
    if (dead) continue;
    const dAfter = dist;
    const mid = m.saveState(), midD = dist, midS = lastScroll;
    let survived = false;
    for (const pol of POLICIES) {
      m.loadState(mid); dist = midD; lastScroll = midS;
      let d2 = false;
      for (let i = 0; i < LOOK; i++) { step(pol(i)); if (m.mem[LIVES] < lives0 || ohNo()) { d2 = true; break; } }
      if (!d2) { survived = true; break; }
    }
    if (!survived) continue;
    const score = -dAfter + rnd() * 3;
    if (score > bestScore) { bestScore = score; best = chunk; }
  }
  m.loadState(base.state); dist = base.dist; lastScroll = base.lastScroll;
  if (!best) {
    fails++; if (process.env.DBG) console.error('fail', fails, frames);
    // backtrack a few segments
    const back = Math.min(stack.length, 1 + Math.floor(rnd() * Math.min(6, 1 + fails / 3)));
    let b = null;
    for (let i = 0; i < back; i++) b = stack.pop();
    if (b) {
      m.loadState(b.state); dist = b.dist; lastScroll = b.lastScroll; recorded.length = b.recLen; inputs.length = b.inLen; frames -= back * SEG;
    }
    if (fails > 400) { console.error('stuck, accepting a death'); fails = 0; for (const inp of randomChunk()) step(inp, recorded); frames += SEG; }
    continue;
  }
  fails = Math.max(0, fails - 1); if (process.env.DBG) console.error('ok frames', frames, 'dist', dist);
  stack.push(base);
  if (stack.length > 400) stack.shift();
  for (const inp of best) step(inp, recorded);
  frames += SEG;
  if (SHOTS && frames - lastShot >= (+process.env.EVERY || 1500)) {
    lastShot = frames;
    const buf = new Uint32Array(224 * 256); gfx.renderSoftware(vs, buf);
    savePng(`${SHOTS}/e${startStage}_${String(frames).padStart(6, '0')}.png`, 224, 256, buf);
    console.error('frames', frames, 'dist', dist, 'lives', m.mem[LIVES]);
  }
}
// compress: tiles only as usage counts
const tiles = new Map();
const framesOut = recorded.map((r) => { for (const k of r.t) tiles.set(k, (tiles.get(k) || 0) + 1); return { st: r.st, s: r.s, sc: r.sc }; });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ frames: framesOut, tiles: Array.from(tiles) })));
if (process.env.INPUTS) fs.writeFileSync(process.env.INPUTS, JSON.stringify(inputs.map((i) => (i.start1 ? 8 : 0) | (i.left ? 1 : 0) | (i.right ? 2 : 0) | (i.button ? 16 : 0))));
console.error('done, recorded', recorded.length);
