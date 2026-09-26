// 6809 disassembler with Konami-1 decryption. node tools/dis6809.js <start> <end>
const { loadRomDir } = require('./env');
const P1 = {}, P2 = {}, P3 = {};
function def(t, op, name, mode) { t[op] = [name, mode]; }
const rmw = ['NEG', null, null, 'COM', 'LSR', null, 'ROR', 'ASR', 'ASL', 'ROL', 'DEC', null, 'INC', 'TST', 'JMP', 'CLR'];
rmw.forEach((n, i) => { if (!n) return; def(P1, i, n, 'dir'); def(P1, 0x60 + i, n, 'idx'); def(P1, 0x70 + i, n, 'ext'); if (n !== 'JMP') { def(P1, 0x40 + i, n + 'A', 'inh'); def(P1, 0x50 + i, n + 'B', 'inh'); } });
const inh = { 0x12: 'NOP', 0x13: 'SYNC', 0x19: 'DAA', 0x1d: 'SEX', 0x39: 'RTS', 0x3a: 'ABX', 0x3b: 'RTI', 0x3d: 'MUL', 0x3f: 'SWI' };
for (const k in inh) def(P1, +k, inh[k], 'inh');
def(P1, 0x16, 'LBRA', 'rel16'); def(P1, 0x17, 'LBSR', 'rel16'); def(P1, 0x1a, 'ORCC', 'imm8'); def(P1, 0x1c, 'ANDCC', 'imm8');
def(P1, 0x1e, 'EXG', 'tfr'); def(P1, 0x1f, 'TFR', 'tfr'); def(P1, 0x3c, 'CWAI', 'imm8');
const br = ['BRA', 'BRN', 'BHI', 'BLS', 'BCC', 'BCS', 'BNE', 'BEQ', 'BVC', 'BVS', 'BPL', 'BMI', 'BGE', 'BLT', 'BGT', 'BLE'];
br.forEach((n, i) => { def(P1, 0x20 + i, n, 'rel8'); if (i) def(P2, 0x20 + i, 'L' + n, 'rel16'); });
def(P1, 0x30, 'LEAX', 'idx'); def(P1, 0x31, 'LEAY', 'idx'); def(P1, 0x32, 'LEAS', 'idx'); def(P1, 0x33, 'LEAU', 'idx');
def(P1, 0x34, 'PSHS', 'psh'); def(P1, 0x35, 'PULS', 'psh'); def(P1, 0x36, 'PSHU', 'psh'); def(P1, 0x37, 'PULU', 'psh');
const hiA = ['SUBA', 'CMPA', 'SBCA', 'SUBD', 'ANDA', 'BITA', 'LDA', 'STA', 'EORA', 'ADCA', 'ORA', 'ADDA', 'CMPX', 'JSR', 'LDX', 'STX'];
const hiB = ['SUBB', 'CMPB', 'SBCB', 'ADDD', 'ANDB', 'BITB', 'LDB', 'STB', 'EORB', 'ADCB', 'ORB', 'ADDB', 'LDD', 'STD', 'LDU', 'STU'];
const modes = ['imm', 'dir', 'idx', 'ext'];
for (let m = 0; m < 4; m++) for (let i = 0; i < 16; i++) {
  const w = [3, 0xc, 0xe].includes(i);
  def(P1, 0x80 + m * 16 + i, hiA[i], m === 0 ? (w ? 'imm16' : 'imm8') : modes[m]);
  def(P1, 0xc0 + m * 16 + i, hiB[i], m === 0 ? (w ? 'imm16' : 'imm8') : modes[m]);
}
def(P1, 0x8d, 'BSR', 'rel8'); delete P1[0x87]; delete P1[0xc7]; delete P1[0x8f]; delete P1[0xcd]; delete P1[0xcf];
for (let m = 0; m < 4; m++) {
  def(P2, 0x83 + m * 16, 'CMPD', m ? modes[m] : 'imm16'); def(P2, 0x8c + m * 16, 'CMPY', m ? modes[m] : 'imm16');
  def(P2, 0x8e + m * 16, 'LDY', m ? modes[m] : 'imm16'); if (m) def(P2, 0x8f + m * 16, 'STY', modes[m]);
  def(P2, 0xce + m * 16, 'LDS', m ? modes[m] : 'imm16'); if (m) def(P2, 0xcf + m * 16, 'STS', modes[m]);
  def(P3, 0x83 + m * 16, 'CMPU', m ? modes[m] : 'imm16'); def(P3, 0x8c + m * 16, 'CMPS', m ? modes[m] : 'imm16');
}
def(P2, 0x3f, 'SWI2', 'inh'); def(P3, 0x3f, 'SWI3', 'inh');
const REGS = ['D', 'X', 'Y', 'U', 'S', 'PC', '?', '?', 'A', 'B', 'CC', 'DP'];
const hex = (v, n) => '$' + v.toString(16).toUpperCase().padStart(n, '0');
function key(a) { return [0x22, 0x82, 0, 0, 0, 0, 0, 0, 0x28, 0x88][a & 0xa] ; }
function disasm(mem, pc) {
  const start = pc;
  const op8 = () => { const v = mem[pc] ^ ({ 0: 0x22, 2: 0x82, 8: 0x28, 10: 0x88 })[pc & 0xa]; pc = (pc + 1) & 0xffff; return v; };
  const b8 = () => { const v = mem[pc]; pc = (pc + 1) & 0xffff; return v; };
  const w16 = () => { const v = (mem[pc] << 8) | mem[(pc + 1) & 0xffff]; pc = (pc + 2) & 0xffff; return v; };
  let op = op8(), tab = P1, pre = '';
  if (op === 0x10) { tab = P2; op = op8(); } else if (op === 0x11) { tab = P3; op = op8(); }
  const d = tab[op];
  let txt, target = null;
  if (!d) txt = 'FCB ' + hex(op, 2);
  else {
    const [n, mode] = d;
    let arg = '';
    switch (mode) {
      case 'inh': break;
      case 'imm8': arg = '#' + hex(b8(), 2); break;
      case 'imm16': arg = '#' + hex(w16(), 4); break;
      case 'dir': arg = '<' + hex(b8(), 2); break;
      case 'ext': { const v = w16(); arg = hex(v, 4); target = v; break; }
      case 'rel8': { const o = b8(); target = (pc + ((o << 24) >> 24)) & 0xffff; arg = hex(target, 4); break; }
      case 'rel16': { const o = w16(); target = (pc + o) & 0xffff; arg = hex(target, 4); break; }
      case 'tfr': { const p = b8(); arg = REGS[p >> 4] + ',' + REGS[p & 15]; break; }
      case 'psh': { const p = b8(); const nm = ['CC', 'A', 'B', 'DP', 'X', 'Y', (n.endsWith('S') ? 'U' : 'S'), 'PC']; arg = nm.filter((_, i) => p & (1 << i)).join(','); break; }
      case 'idx': {
        const pb = b8(); const r = 'XYUS'[(pb >> 5) & 3];
        if (!(pb & 0x80)) { let o = pb & 0x1f; if (o & 0x10) o -= 32; arg = o + ',' + r; break; }
        let s;
        switch (pb & 15) {
          case 0: s = ',' + r + '+'; break; case 1: s = ',' + r + '++'; break; case 2: s = ',-' + r; break; case 3: s = ',--' + r; break;
          case 4: s = ',' + r; break; case 5: s = 'B,' + r; break; case 6: s = 'A,' + r; break;
          case 8: { const o = b8(); s = ((o << 24) >> 24) + ',' + r; break; }
          case 9: { const o = w16(); s = hex(o, 4) + ',' + r; break; }
          case 11: s = 'D,' + r; break;
          case 12: { const o = b8(); s = hex((pc + ((o << 24) >> 24)) & 0xffff, 4) + ',PCR'; break; }
          case 13: { const o = w16(); s = hex((pc + o) & 0xffff, 4) + ',PCR'; break; }
          case 15: s = hex(w16(), 4); break;
          default: s = '???';
        }
        arg = (pb & 0x10) ? '[' + s + ']' : s;
        break;
      }
    }
    txt = n + (arg ? ' ' + arg : '');
  }
  const bytes = [];
  for (let a = start; a !== pc; a = (a + 1) & 0xffff) bytes.push(mem[a].toString(16).padStart(2, '0'));
  return { pc, txt, bytes, target };
}
module.exports = { disasm };
if (require.main === module) {
  const roms = loadRomDir();
  let pc = parseInt(process.argv[2], 16); const end = parseInt(process.argv[3], 16);
  while (pc < end) {
    const d = disasm(roms.main, pc);
    console.log(pc.toString(16).toUpperCase().padStart(4, '0') + ': ' + d.bytes.join(' ').padEnd(15) + d.txt);
    pc = d.pc;
  }
}
