// Code/data coverage of the main CPU program.  node tools/trace.js <out.json> [framesPerStage]
const { CC, loadRomDir } = require('./env');
const fs = require('fs');
const out = process.argv[2] || 'coverage.json';
const FR = +process.argv[3] || 20000;
const roms = loadRomDir();
const code = new Uint8Array(0x10000);   // 1 = instruction start
const data = new Uint8Array(0x10000);   // 1 = read as data
const ijump = {};                       // pc -> set of targets for indirect jumps / computed
const calls = {};                       // target -> count
let seed = 5;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function instrument(m) {
  const cpu = m.cpu;
  const origStep = cpu.step.bind(cpu);
  let curPc = 0;
  cpu.step = function () {
    curPc = this.pc;
    code[curPc] = 1;
    const r = origStep();
    return r;
  };
  const origRead = m.cpu.bus.read;
  m.cpu.bus.read = (a) => { if (a >= 0x6000 && (cpu.pc < 0xcc40 || cpu.pc > 0xcc70)) data[a] = 1; return origRead(a); };
  // track control transfers: after each step compare pc with sequential expectation is expensive;
  // instead record the destination of every step whose pc jumps far
  const origStep2 = cpu.step;
  cpu.step = function () {
    const from = this.pc;
    const r = origStep2.call(this);
    const to = this.pc;
    const op = m.opcodes[from];
    // indexed/extended JMP/JSR: 0x6e 0x7e 0xad 0xbd 0x0e 0x9d  (decrypted opcode values)
    if (op === 0x6e || op === 0xad || op === 0x9d || op === 0x0e || op === 0x35 || op === 0x39 || op === 0x3b) {
      if (op === 0x6e || op === 0xad) { (ijump[from] = ijump[from] || {})[to] = 1; }
    }
    if (op === 0xbd || op === 0xad || op === 0x9d || op === 0x8d || op === 0x17) calls[to] = (calls[to] || 0) + 1;
    return r;
  };
}

function session(stage, frames, cheat) {
  const m = new CC.CircusCharlie(roms);
  instrument(m);
  const seq = [];
  for (let i = 0; i < 420; i++) seq.push({});
  if (stage > 0) {
    for (let i = 0; i < 6; i++) seq.push({ start1: 1 });
    for (let i = 0; i < 60; i++) seq.push({});
    for (let s = 1; s < stage; s++) { for (let i = 0; i < 6; i++) seq.push({ right: 1 }); for (let i = 0; i < 20; i++) seq.push({}); }
    for (let i = 0; i < 6; i++) seq.push({ button: 1 });
  }
  let hold = {}, left = 0;
  for (let f = 0; f < frames; f++) {
    let inp;
    if (f < seq.length || stage === 0) inp = seq[f] || {};
    else {
      if (left-- <= 0) { const x = rnd(); hold = { right: x < 0.6, left: x > 0.85, button: rnd() < 0.3 }; left = 3 + Math.floor(rnd() * 30); }
      inp = hold;
    }
    m.setInputs(inp);
    if (cheat && f > seq.length) m.mem[0x2200] = 3;
    m.runFrame(false);
  }
  return m;
}
session(0, 12000, false);                 // attract mode
for (let st = 1; st <= 6; st++) { session(st, FR, true); session(st, 6000, false); console.error('stage', st); }
// service mode
{ const m = new CC.CircusCharlie(roms); instrument(m); m.setInputs({ service: 1 }); for (let f = 0; f < 3000; f++) m.runFrame(false); }
const toList = (arr) => { const l = []; for (let i = 0; i < arr.length; i++) if (arr[i]) l.push(i); return l; };
fs.writeFileSync(out, JSON.stringify({ code: toList(code), data: toList(data), ijump, calls }));
console.error('code bytes', toList(code).length, 'data bytes', toList(data).length, 'subs', Object.keys(calls).length);
