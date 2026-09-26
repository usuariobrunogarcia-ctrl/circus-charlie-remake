// Plays every stage with a random bot and records sprite / tile usage.
// node tools/record.js <out.json.gz> [framesPerStage] [seed]
const { CC, loadRomDir } = require('./env');
const fs = require('fs');
const zlib = require('zlib');
const out = process.argv[2] || 'record.json.gz';
const FPS_STAGE = +process.argv[3] || 20000;
let seed = +process.argv[4] || 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const roms = loadRomDir();
const frames = [];     // per frame: array of [slot, code, color, flags, x, y]
const tiles = new Map(); // "code,color" -> count
let vs = null;
const SHOTS = process.env.SHOTS;
const { savePng } = require('./env');
let gfx = null; const sbuf = new Uint32Array(224 * 256);
function shot(m, st, f) { gfx = gfx || new CC.Graphics(roms); gfx.renderSoftware(vs, sbuf); savePng(`${SHOTS}/s${st}_${String(f).padStart(6, '0')}.png`, 224, 256, sbuf); }

function runSession(stage, nFrames, bot) {
  const m = new CC.CircusCharlie(roms);
  m.onVideoFrame = (mm) => { vs = mm.videoState(vs); };
  let f = 0;
  const press = (k) => ({ [k]: true });
  const seq = [];
  // title -> start -> choose screen
  for (let i = 0; i < 420; i++) seq.push({});
  for (let i = 0; i < 6; i++) seq.push(press('start1'));
  for (let i = 0; i < 60; i++) seq.push({});
  for (let s = 1; s < stage; s++) { for (let i = 0; i < 6; i++) seq.push(press('right')); for (let i = 0; i < 20; i++) seq.push({}); }
  for (let i = 0; i < 6; i++) seq.push(press('button'));
  let hold = {}, holdLeft = 0;
  for (f = 0; f < nFrames; f++) {
    let inp;
    if (f < seq.length) inp = seq[f];
    else {
      if (holdLeft-- <= 0) { hold = bot(rnd); holdLeft = hold.len; }
      inp = Object.assign({}, hold);
      // restart after game over
      if (f % 900 === 0) inp.start1 = true;
      if (f % 900 > 60 && f % 900 < 66) inp.button = true;
    }
    m.setInputs(inp);
    if (f > seq.length) m.mem[0x2200] = 3; // infinite lives (catalogue tool only)
    m.runFrame(false);
    if (SHOTS && f % 3000 === 2999) shot(m, stage, f);
    if (!vs) continue;
    const list = [];
    for (let o = 0; o < 0x100; o += 4) {
      const a1 = vs.sprites[o + 1];
      const code = vs.sprites[o] + 8 * (a1 & 0x20);
      list.push([o >> 2, code, a1 & 15, a1 & 0xc0, vs.sprites[o + 2], vs.sprites[o + 3]]);
    }
    frames.push({ st: stage, s: list, sc: vs.scroll });
    for (let i = 0; i < 0x400; i++) {
      const at = vs.colorram[i];
      const k = (vs.videoram[i] + ((at & 0x20) << 3)) * 16 + (at & 15);
      tiles.set(k, (tiles.get(k) || 0) + 1);
    }
  }
}
const bot = (r) => {
  const x = r();
  return { right: x < 0.6, left: x > 0.85, button: r() < 0.3, len: 5 + Math.floor(r() * 40) };
};
runSession(1, 3000, bot); // includes attract mode
for (let st = 1; st <= 6; st++) { runSession(st, FPS_STAGE, bot); console.error('stage', st, 'done'); }
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ frames, tiles: Array.from(tiles) })));
console.error('frames', frames.length);
