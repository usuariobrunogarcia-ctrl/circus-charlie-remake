// Headless run: node tools/run.js <frames> <outdir> <every> [inputScript.js]
// input script exports function(frame, machine) -> inputs object
const { CC, loadRomDir, savePng } = require('./env');
const fs = require('fs');
const path = require('path');
const frames = +process.argv[2] || 600;
const out = process.argv[3] || '/tmp/cc';
const every = +process.argv[4] || 60;
const script = process.argv[5] ? require(path.resolve(process.argv[5])) : () => ({});
const start = +process.argv[6] || 0;
fs.mkdirSync(out, { recursive: true });
const roms = loadRomDir();
const m = new CC.CircusCharlie(roms, process.env.DSW1 ? {dsw1: +process.env.DSW1} : {});
if (process.env.PATCH) require(process.env.PATCH)(m); m.reset();
const g = new CC.Graphics(roms);
const buf = new Uint32Array(224 * 256);
let vs = null;
m.onVideoFrame = (mm) => { vs = mm.videoState(vs); };
const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  m.setInputs(script(f, m) || {});
  m.runFrame();
  if (f >= start && f % every === every - 1) {
    g.renderSoftware(vs, buf);
    savePng(`${out}/f${String(f + 1).padStart(5, '0')}.png`, 224, 256, buf);
  }
}
console.log('frames', frames, 'ms', Date.now() - t0, 'pc', m.cpu.pc.toString(16));
