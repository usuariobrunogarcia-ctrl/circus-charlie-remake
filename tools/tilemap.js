// Dumps the whole 256x256 tilemap (display orientation, unscrolled) of the
// rewritten engine while a bot plays a stage. The visible window is framed in red.
//   node tools/tilemap.js <stage 1-6> <outdir> [frames] [every]
const { CC, loadRomDir, savePng } = require('./engine-env');
const scripts = require('./scripts');
const st = +process.argv[2] || 1;
const out = process.argv[3] || '.';
const FRAMES = +process.argv[4] || 3000;
const EVERY = +process.argv[5] || 500;
const roms = loadRomDir();
const gfx = new CC.Graphics(roms);
const game = new CC.Game(CC.patchRomForEnter(roms.main));
game.in.dsw1 = 0; game.in.dsw2 = 0x03 | 0x08 | 0x40;
game.boot();
const script = scripts.playStage(st, 5);
const sprBuf = new Uint8Array(256);

function dump(name) {
  const W = 256, H = 256;
  const buf = new Uint32Array(W * H);
  const vram = game.m.subarray(0x3400), cram = game.m.subarray(0x3000);
  for (let ti = 0; ti < 1024; ti++) {
    const attr = cram[ti], code = vram[ti] + ((attr & 0x20) << 3);
    const px = gfx.charRGBA(code, attr & 15);
    const R = ti >> 5, C = ti & 31, x0 = 248 - 8 * R, y0 = 8 * C;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sx = attr & 0x80 ? 7 - x : x, sy = attr & 0x40 ? 7 - y : y;
      const o = (sy * 8 + sx) * 4;
      buf[(y0 + y) * W + x0 + x] = (255 << 24) | (px[o + 2] << 16) | (px[o + 1] << 8) | px[o];
    }
  }
  // visible window: display x in [0,224) maps to tilemap u = x + 16 - scroll
  const s = game.out.scroll;
  for (const edge of [0, 224]) {
    const u = (edge + 16 - s) & 255;
    for (let y = 80; y < 256; y++) buf[y * W + u] = 0xff0000ff;
  }
  savePng(`${out}/${name}.png`, W, H, buf);
}

for (let f = 0; f < FRAMES; f++) {
  const i = script(f);
  let sys = 0xff, p1 = 0xff;
  if (i.start1) sys &= ~0x08;
  if (i.left) p1 &= ~1;
  if (i.right) p1 &= ~2;
  if (i.button) p1 &= ~0x10;
  game.in.system = sys; game.in.p1 = p1; game.in.p2 = p1;
  const bank = game.out.spriteBank ? 0x3900 : 0x3800;
  sprBuf.set(game.m.subarray(bank, bank + 256));
  if (f > 700 && game.m[0x2003] === 2) game.m[0x2200] = 3;
  try { game.tick(); } catch (e) { if (!(e instanceof CC.Game.Todo)) throw e; }
  if (f > 700 && f % EVERY === 0) dump(`tm${st}_${String(f).padStart(5, '0')}`);
}
