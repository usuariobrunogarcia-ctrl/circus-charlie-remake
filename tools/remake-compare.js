// Compares the remake's stage 1 (remake/js/stage1.js) with the verified engine
// (js/engine) playing the same inputs: camera, Charlie's height, rings, score.
//   node tools/remake-compare.js [policy seed] [frames]
const { CC, loadRomDir } = require('./engine-env');
require('../remake/js/stage1.js');
const scripts = require('./scripts');
const R = globalThis.Remake;
if (process.env.SC) {
  const P = R.Stage1.prototype, j = P.jump, l = P.landingPoints;
  P.jump = function () { j.call(this); console.log('R jump', this.frame, 'ahead', this.c.ringsAhead.map((r) => this.hw(r.x).toString(16)), 'rings', this.rings.map((r) => this.hw(r.x).toString(16))); };
  P.landingPoints = function () { console.log('R land', this.frame, 'ahead', this.c.ringsAhead.map((r) => this.hw(r.x).toString(16))); l.call(this); };
}
const seed0 = +process.argv[2] || 1;
const FR = +process.argv[3] || 1500;

const roms = loadRomDir();
const g = new CC.Game(CC.patchRomForEnter(roms.main));
g.in.dsw1 = 0; g.in.dsw2 = 0x4b; g.boot();
function step(v) {
  let sys = 0xff, p1 = 0xff;
  if (v & 8) sys &= ~8; if (v & 1) p1 &= ~1; if (v & 2) p1 &= ~2; if (v & 16) p1 &= ~0x10;
  g.in.system = sys; g.in.p1 = p1; g.in.p2 = p1;
  g.tick();
}
const FILE = process.env.INPUTS ? JSON.parse(require('fs').readFileSync(process.env.INPUTS, 'utf8')) : null;
let fi = 0;
if (FILE) {
  while (!(g.m[0x2003] === 2 && g.m[0x2006] === 3 && g.m[0x2800] === 1)) step(FILE[fi++]);
} else {
  const pre = scripts.playStage(1, 1);
  for (let f = 0; f < 420 + 6 + 60 + 6; f++) { const i = pre(f); step((i.start1 ? 8 : 0) | (i.right ? 2 : 0) | (i.button ? 16 : 0)); }
  while (!(g.m[0x2003] === 2 && g.m[0x2006] === 3 && g.m[0x2800] === 1)) step(0);
}
const m = g.m;
const P0 = CC.Game.prototype.s1Prize; g.s1Prize = function (b, d) { if (process.env.SC) console.log('ENGINE PRIZE', b, d.toString(16), 'at', globalThis.curF); return P0.call(this, b, d); };


console.log('2022', m[0x2022], '220e', m[0x220e], '202f', m[0x202f].toString(16));
const player = { score: 0, lives: 3, rings: m[0x2208], pots: m[0x2209], misses: 0, round: m[0x220e] };
const S = new R.Stage1(player, { difficulty: 1 });
S.rand = m[0x20bb];
S.frame = m[0x2014];
S.ringTimer = (m[0x20c2] << 8) | m[0x20c3];

let seed = seed0;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let hold = 0, left = 0, prevBtn = false;
const bcd = (v) => (v >> 4) * 10 + (v & 15);
const engScore = () => bcd(m[0x20a0]) * 10000 + bcd(m[0x20a1]) * 100 + bcd(m[0x20a2]);
const engCam = () => m[0x2203] * 256 - ((m[0x2204] << 8) | m[0x2205]) / 256;
let diffs = 0;
for (let f = 0; f < FR; f++) {
  if (left-- <= 0) { const x = rnd(); hold = (x < 0.7 ? 2 : x > 0.9 ? 1 : 0) | (rnd() < 0.25 ? 16 : 0); left = 4 + Math.floor(rnd() * 30); }
  let btn = !!(hold & 16) && left % 20 < 3;
  let v = (hold & 3) | (btn ? 16 : 0);
  if (FILE) { v = FILE[fi++] || 0; btn = !!(v & 16); }
  globalThis.curF = f;
  step(v);
  // the engine reads the inputs latched by the interrupt: same frame
  S.update({ left: !!(v & 1), right: !!(v & 2), jump: btn && !prevBtn }, { left: 0, right: 224 });
  prevBtn = btn;
  const ec = engCam(), ey = m[0x2644], eh = m[0x20b7];
  const rc = S.cam, ry = S.c.y >> 8;
  const eRings = [0x26d0, 0x2700, 0x2730, 0x2760].filter((u) => m[u]).map((u) => m[u + 6]).sort((a, b) => a - b);
  const rRings = S.rings.filter((r) => S.hw(r.x) >= 0 && S.hw(r.x) < 256).map((r) => S.hw(r.x) & 0xff).sort((a, b) => a - b);
  if (process.env.DBG && (f > 300 && f < 349)) console.log(f, 'timer', ((m[0x20c2] << 8) | m[0x20c3]).toString(16), S.ringTimer.toString(16), 'cnt', m[0x2208], S.player.rings, 'bb', m[0x20bb], S.rand, 'bc', m[0x20bc], S.lastGap);
  const ePots = [0x24b0, 0x24f0, 0x2530].filter((u) => m[u] === 2).map((u) => m[u + 6]).sort((a, b) => a - b).join();
  const rPots = S.pots.filter((p) => S.hwPx(p.x) >= 2 && S.hwPx(p.x) < 256).map((p) => S.hwPx(p.x)).sort((a, b) => a - b).join();
  if (ePots !== rPots && (globalThis.potWarned = (globalThis.potWarned || 0) + 1) < 6) { console.log('POTS differ at', f, ePots, '/', rPots, 'cam', engCam(), S.cam, 'speed', ((m[0x20b1] << 8) | m[0x20b2]).toString(16), S.c.speed, 'fine', ((m[0x2204] << 8) | m[0x2205]).toString(16), S.fine.toString(16)); }
  const bad = (f > 40 && engScore() !== S.player.score && !globalThis.scoreWarned && (globalThis.scoreWarned = f)) || Math.abs(ec - rc) > 0.01 || ey !== ry || eRings.join() !== rRings.join();
  if (bad || f % 200 === 0) {
    if (globalThis.scoreWarned === f) console.log("SCORE", engScore(), S.player.score);
    console.log(`${f}: cam ${ec.toFixed(2)}/${rc.toFixed(2)} y ${ey.toString(16)}/${ry.toString(16)} rings [${eRings.map((x) => x.toString(16))}] / [${rRings.map((x) => x.toString(16))}] state ${m[0x2800]}/${S.state}`);
    if (bad && ++diffs > 12) break;
  }
  if (process.env.SC && f > 236 && f < 250) console.log(f, 'eng score', engScore(), 'remake', S.player.score, [...m.slice(0x20a0, 0x20ac)].map((x) => x.toString(16)).join(' '), '2022', m[0x2022], '2021', m[0x2021], 'q', m[0x2018].toString(16), m[0x2019].toString(16), m[0x201a].toString(16), m[0x201b].toString(16));
  if (f % 200 === 0) console.log('   score', engScore(), S.player.score, 'bonus', S.bonus, 'pots', S.pots.map((p) => (S.hwPx(p.x) & 0xff).toString(16)), [0x24b0, 0x24f0, 0x2530].filter((u) => m[u] === 2).map((u) => m[u + 6].toString(16)));
  if (S.state !== 'play' || m[0x2800] !== 1) { console.log('end at', f, 'engine state', m[0x2800], 'remake', S.state); break; }
}
