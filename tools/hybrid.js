// Hybrid verification: at every vblank interrupt the emulator state is copied
// into the JS engine, the engine runs one frame and its RAM is compared with
// the emulator's RAM at the next interrupt.
//   node tools/hybrid.js <script> [arg] [frames] [--cheat] [--stop]
const { CC, loadRomDir } = require('./engine-env');
if (process.env.PRE) require(process.env.PRE);
const scripts = require('./scripts');
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const pos = args.filter(a => !a.startsWith('--'));
const script = pos[0] === 'stage' ? scripts.playStage(+pos[1] || 1, +pos[3] || 7) : scripts.attract();
const FRAMES = +pos[2] || 3000;
const roms = loadRomDir();
const emu = new CC.CircusCharlie(roms);
const game = new CC.Game(emu.mem.slice ? emu.origMain || emu.mem : emu.mem);
game.rom = emu.mem; // patched program ROM image (texts "PUSH ENTER")

const IGNORE = (a) => (a >= 0x2fc0 && a < 0x3000) || (flags.has('--cheat') && a === 0x2200);
let snap = null, pending = null;
const stats = { frames: 0, ok: 0, diff: 0, todo: new Map(), diffAddr: new Map() };
let shown = 0;
function take() {
  return {
    ram: emu.mem.slice(0x2000, 0x4000), sys: emu.inSystem, p1: emu.inP1, p2: emu.inP2,
    dsw1: emu.dsw1, dsw2: emu.dsw2, scroll: emu.scroll, bank: emu.latch[5], snd: [], frame: emu.frame,
    // interrupted PC (pushed by the IRQ): main loop idle or running a task?
    ipc: (emu.mem[emu.cpu.s + 10] << 8) | emu.mem[emu.cpu.s + 11],
    qread: (emu.mem[0x201a] << 8) | emu.mem[0x201b],
  };
}
const chk = emu.cpu.checkInterrupts.bind(emu.cpu);
emu.cpu.checkInterrupts = function () {
  const c = chk();
  if (c && this.pc === 0x6414) {
    if (flags.has('--cheat') && emu.frame > 700 && emu.mem[0x2003] === 2) emu.mem[0x2200] = 3;
    const s = take();
    s.busy = !((s.ipc >= 0x60ed && s.ipc <= 0x6113) || s.ipc === 0x6203);
    if (pending) compare(pending, s);
    pending = s;
  }
  return c;
};
const mw = emu.mainWrite.bind(emu);
emu.mainWrite = function (a, v) { if ((a & 0xfc00) === 0x0800 && pending) pending.snd.push(v); mw(a, v); };

function compare(s0, s1) {
  stats.frames++;
  game.m.fill(0, 0x2000, 0x4000);
  game.m.set(s0.ram, 0x2000);
  game.in.system = s0.sys; game.in.p1 = s0.p1; game.in.p2 = s0.p2; game.in.dsw1 = s0.dsw1; game.in.dsw2 = s0.dsw2;
  game.soundCommands.length = 0;
  if (s1.busy || s0.busy) { stats.busy = (stats.busy || 0) + 1; return; }
  game.maxTasks = ((s1.qread - s0.qread) & 0x3f) >> 1;
  try {
    game.tick();
  } catch (e) {
    if (e instanceof CC.Game.Todo) { stats.todo.set(e.addr, (stats.todo.get(e.addr) || 0) + 1); return; }
    if (e instanceof TypeError && /is not a function/.test(e.message)) { const k = e.message.split(' ')[0]; stats.todo.set(k, (stats.todo.get(k) || 0) + 1); return; }
    console.log('EXCEPTION frame', s0.frame, e.stack); process.exit(1);
  }
  const diffs = [];
  for (let i = 0; i < 0x2000; i++) {
    const a = 0x2000 + i;
    if (IGNORE(a)) continue;
    if (game.m[a] !== s1.ram[i]) diffs.push(a);
  }
  const extra = [];
  if (game.out.scroll !== s1.scroll) extra.push(`scroll js=${game.out.scroll} emu=${s1.scroll}`);
  if (game.out.spriteBank !== s1.bank) extra.push(`bank js=${game.out.spriteBank} emu=${s1.bank}`);
  if (game.soundCommands.join(',') !== s0.snd.join(',')) extra.push(`sound js=[${game.soundCommands}] emu=[${s0.snd}]`);
  if (!diffs.length && !extra.length) { stats.ok++; return; }
  stats.diff++;
  for (const a of diffs) stats.diffAddr.set(a, (stats.diffAddr.get(a) || 0) + 1);
  if (shown < 5) {
    shown++;
    console.log(`frame ${s0.frame}: ${diffs.length} bytes differ ${extra.join(' ')}`);
    console.log('  ' + diffs.slice(0, 24).map(a => `${a.toString(16)}:js=${game.m[a].toString(16)}/emu=${s1.ram[a - 0x2000].toString(16)}(was ${s0.ram[a - 0x2000].toString(16)})`).join(' '));
  }
  if (flags.has('--stop')) {
    const dump = (base, n) => Array.from(s0.ram.slice(base - 0x2000, base - 0x2000 + n)).map(v => v.toString(16).padStart(2, '0')).join(' ');
    const objs = new Set(diffs.filter(a => a >= 0x2400 && a < 0x2800).map(a => a & 0xffc0));
    console.log('stage', s0.ram[0x201], 'mode', s0.ram[3], s0.ram[4], s0.ram[5], s0.ram[6], '2203/4', s0.ram[0x203].toString(16), s0.ram[0x204].toString(16), '240a', s0.ram[0x40a]);
    for (const o of objs) console.log(o.toString(16) + ': ' + dump(o, 64));
    if (process.env.TRACE) {
      // re-run the frame with a write trace on the differing addresses
      game.m.fill(0, 0x2000, 0x4000); game.m.set(s0.ram, 0x2000);
      const watch = new Set(diffs);
      const real = game.m;
      game.m = new Proxy(real, { set(t, k, v) { const a = +k; if (watch.has(a)) console.log('  write', a.toString(16), '=', (v & 255).toString(16), new Error().stack.split('\n')[2].trim().split(' ')[1]); t[k] = v; return true; }, get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
      try { game.tick(); } catch (e) { console.log(e.message); }
      game.m = real;
    }
    report(); process.exit(1);
  }
}
function report() {
  console.log(`frames compared ${stats.frames}: ok ${stats.ok}, diff ${stats.diff}, busy ${stats.busy || 0}, todo ${[...stats.todo.values()].reduce((a, b) => a + b, 0)}`);
  const todos = [...stats.todo.entries()].sort((a, b) => b[1] - a[1]);
  if (todos.length) console.log('TODO:', todos.slice(0, 30).map(([a, n]) => (typeof a === 'number' ? a.toString(16) : a) + 'x' + n).join(' '));
  const da = [...stats.diffAddr.entries()].sort((a, b) => b[1] - a[1]);
  if (da.length) console.log('most differing:', da.slice(0, 30).map(([a, n]) => a.toString(16) + 'x' + n).join(' '));
}
for (let f = 0; f < FRAMES; f++) {
  emu.setInputs(script(f));
  emu.runFrame(false);
}
report();
