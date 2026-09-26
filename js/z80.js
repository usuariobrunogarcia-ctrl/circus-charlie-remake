/*
 * Zilog Z80 CPU core.
 *
 * bus interface:
 *   bus.read(addr), bus.write(addr, v), bus.in(port), bus.out(port, v)
 *   bus.irqAck() -> called when a maskable interrupt is accepted
 */
(function (root) {
  'use strict';

  const FC = 0x01, FN = 0x02, FPV = 0x04, FX = 0x08, FH = 0x10, FY = 0x20, FZ = 0x40, FS = 0x80;

  // precomputed flag tables
  const SZ = new Uint8Array(256), SZP = new Uint8Array(256), PARITY = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let p = 0;
    for (let b = 0; b < 8; b++) if (i & (1 << b)) p++;
    PARITY[i] = (p & 1) ? 0 : FPV;
    SZ[i] = (i ? (i & FS) : FZ) | (i & (FX | FY));
    SZP[i] = SZ[i] | PARITY[i];
  }

  // base cycle tables
  const CYC = [
    4,10,7,6,4,4,7,4,4,11,7,6,4,4,7,4,
    8,10,7,6,4,4,7,4,12,11,7,6,4,4,7,4,
    7,10,16,6,4,4,7,4,7,11,16,6,4,4,7,4,
    7,10,13,6,11,11,10,4,7,11,13,6,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    7,7,7,7,7,7,4,7,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    4,4,4,4,4,4,7,4,4,4,4,4,4,4,7,4,
    5,10,10,10,10,11,7,11,5,10,10,0,10,17,7,11,
    5,10,10,11,10,11,7,11,5,4,10,11,10,0,7,11,
    5,10,10,19,10,11,7,11,5,4,10,4,10,0,7,11,
    5,10,10,4,10,11,7,11,5,6,10,4,10,0,7,11
  ];

  class Z80 {
    constructor(bus) {
      this.bus = bus;
      this.reset();
      this.icount = 0;
      this.totalCycles = 0;
      this.irqLine = false;
    }

    reset() {
      this.a = 0xff; this.f = 0xff;
      this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
      this.a_ = 0; this.f_ = 0; this.b_ = 0; this.c_ = 0; this.d_ = 0; this.e_ = 0; this.h_ = 0; this.l_ = 0;
      this.ix = 0xffff; this.iy = 0xffff;
      this.sp = 0xffff; this.pc = 0;
      this.i = 0; this.r = 0;
      this.iff1 = 0; this.iff2 = 0; this.im = 0;
      this.halted = false;
      this.eiDelay = false;
      this.nmiPending = false;
    }

    setIRQ(state) { this.irqLine = !!state; }

    // helpers
    rd(a) { return this.bus.read(a & 0xffff); }
    wr(a, v) { this.bus.write(a & 0xffff, v & 0xff); }
    rd16(a) { return this.rd(a) | (this.rd(a + 1) << 8); }
    wr16(a, v) { this.wr(a, v); this.wr(a + 1, v >> 8); }
    fetch() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
    fetch16() { const v = this.rd16(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
    push(v) { this.sp = (this.sp - 2) & 0xffff; this.wr16(this.sp, v); }
    pop() { const v = this.rd16(this.sp); this.sp = (this.sp + 2) & 0xffff; return v; }
    incR() { this.r = (this.r & 0x80) | ((this.r + 1) & 0x7f); }

    get bc() { return (this.b << 8) | this.c; }
    set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
    get de() { return (this.d << 8) | this.e; }
    set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
    get hl() { return (this.h << 8) | this.l; }
    set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
    get af() { return (this.a << 8) | this.f; }
    set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xff; }

    // 8 bit register access by index (0=B..7=A, 6 = (HL)) -- 6 handled by caller
    getR(i) {
      switch (i) {
        case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e;
        case 4: return this.h; case 5: return this.l; case 6: return this.rd(this.hl); default: return this.a;
      }
    }
    setR(i, v) {
      v &= 0xff;
      switch (i) {
        case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break;
        case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wr(this.hl, v); break; default: this.a = v; break;
      }
    }

    // ALU
    add8(v, c) {
      const a = this.a, r = a + v + c;
      this.f = SZ[r & 0xff] | ((r >> 8) & FC) | ((a ^ v ^ r) & FH) | ((((a ^ ~v) & (a ^ r)) & 0x80) ? FPV : 0);
      this.a = r & 0xff;
    }
    sub8(v, c) {
      const a = this.a, r = a - v - c;
      this.f = SZ[r & 0xff] | ((r >> 8) & FC) | FN | ((a ^ v ^ r) & FH) | ((((a ^ v) & (a ^ r)) & 0x80) ? FPV : 0);
      this.a = r & 0xff;
    }
    cp8(v) {
      const a = this.a, r = a - v;
      this.f = (SZ[r & 0xff] & ~(FX | FY)) | (v & (FX | FY)) | ((r >> 8) & FC) | FN | ((a ^ v ^ r) & FH) | ((((a ^ v) & (a ^ r)) & 0x80) ? FPV : 0);
    }
    and8(v) { this.a &= v; this.f = SZP[this.a] | FH; }
    or8(v) { this.a = (this.a | v) & 0xff; this.f = SZP[this.a]; }
    xor8(v) { this.a = (this.a ^ v) & 0xff; this.f = SZP[this.a]; }
    alu(op, v) {
      switch (op) {
        case 0: this.add8(v, 0); break;
        case 1: this.add8(v, this.f & FC); break;
        case 2: this.sub8(v, 0); break;
        case 3: this.sub8(v, this.f & FC); break;
        case 4: this.and8(v); break;
        case 5: this.xor8(v); break;
        case 6: this.or8(v); break;
        default: this.cp8(v); break;
      }
    }
    inc8(v) {
      const r = (v + 1) & 0xff;
      this.f = (this.f & FC) | SZ[r] | (r === 0x80 ? FPV : 0) | ((r & 0x0f) === 0 ? FH : 0);
      return r;
    }
    dec8(v) {
      const r = (v - 1) & 0xff;
      this.f = (this.f & FC) | FN | SZ[r] | (r === 0x7f ? FPV : 0) | ((r & 0x0f) === 0x0f ? FH : 0);
      return r;
    }
    add16(a, b) {
      const r = a + b;
      this.f = (this.f & (FS | FZ | FPV)) | (((a ^ b ^ r) >> 8) & FH) | ((r >> 16) & FC) | ((r >> 8) & (FX | FY));
      return r & 0xffff;
    }
    adc16(v) {
      const hl = this.hl, r = hl + v + (this.f & FC);
      this.f = (((hl ^ r ^ v) >> 8) & FH) | ((r >> 16) & FC) | ((r >> 8) & (FS | FX | FY)) | ((r & 0xffff) ? 0 : FZ) |
        ((((v ^ hl ^ 0x8000) & (v ^ r)) & 0x8000) ? FPV : 0);
      this.hl = r & 0xffff;
    }
    sbc16(v) {
      const hl = this.hl, r = hl - v - (this.f & FC);
      this.f = (((hl ^ r ^ v) >> 8) & FH) | FN | ((r >> 16) & FC) | ((r >> 8) & (FS | FX | FY)) | ((r & 0xffff) ? 0 : FZ) |
        ((((v ^ hl) & (hl ^ r)) & 0x8000) ? FPV : 0);
      this.hl = r & 0xffff;
    }

    // CB rotations
    rot(op, v) {
      let r, c;
      switch (op) {
        case 0: c = v >> 7; r = ((v << 1) | c) & 0xff; break;            // RLC
        case 1: c = v & 1; r = ((v >> 1) | (c << 7)) & 0xff; break;       // RRC
        case 2: c = v >> 7; r = ((v << 1) | (this.f & FC)) & 0xff; break; // RL
        case 3: c = v & 1; r = ((v >> 1) | ((this.f & FC) << 7)) & 0xff; break; // RR
        case 4: c = v >> 7; r = (v << 1) & 0xff; break;                   // SLA
        case 5: c = v & 1; r = ((v >> 1) | (v & 0x80)) & 0xff; break;     // SRA
        case 6: c = v >> 7; r = ((v << 1) | 1) & 0xff; break;             // SLL
        default: c = v & 1; r = v >> 1; break;                            // SRL
      }
      this.f = SZP[r] | c;
      return r;
    }

    cond(cc) {
      switch (cc) {
        case 0: return !(this.f & FZ);
        case 1: return !!(this.f & FZ);
        case 2: return !(this.f & FC);
        case 3: return !!(this.f & FC);
        case 4: return !(this.f & FPV);
        case 5: return !!(this.f & FPV);
        case 6: return !(this.f & FS);
        default: return !!(this.f & FS);
      }
    }

    // ------------------------------------------------------------ execute
    execute(cycles) {
      this.icount += cycles;
      while (this.icount > 0) {
        let c = 0;
        if (this.nmiPending) {
          this.nmiPending = false;
          this.halted = false;
          this.iff1 = 0;
          this.push(this.pc);
          this.pc = 0x66;
          c = 11;
        } else if (this.irqLine && this.iff1 && !this.eiDelay) {
          c = this.takeIRQ();
        } else if (this.halted) {
          // burn remaining cycles in 4 cycle steps
          const n = Math.max(1, Math.ceil(this.icount / 4));
          c = n * 4;
          for (let k = 0; k < n; k++) this.incR();
        } else {
          this.eiDelay = false;
          c = this.step();
        }
        this.icount -= c;
        this.totalCycles += c;
      }
    }

    takeIRQ() {
      this.halted = false;
      this.iff1 = this.iff2 = 0;
      const vec = this.bus.irqAck ? this.bus.irqAck() : 0xff;
      this.incR();
      if (this.im === 2) {
        this.push(this.pc);
        this.pc = this.rd16(((this.i << 8) | (vec & 0xff)) & 0xffff);
        return 19;
      }
      if (this.im === 1) {
        this.push(this.pc);
        this.pc = 0x38;
        return 13;
      }
      // IM 0: assume RST instruction on the bus
      this.push(this.pc);
      this.pc = vec & 0x38;
      return 13;
    }

    step() {
      this.incR();
      const op = this.fetch();
      let c = CYC[op];
      switch (op) {
        case 0x00: break;
        case 0x01: this.bc = this.fetch16(); break;
        case 0x02: this.wr(this.bc, this.a); break;
        case 0x03: this.bc = (this.bc + 1) & 0xffff; break;
        case 0x04: this.b = this.inc8(this.b); break;
        case 0x05: this.b = this.dec8(this.b); break;
        case 0x06: this.b = this.fetch(); break;
        case 0x07: { const cy = this.a >> 7; this.a = ((this.a << 1) | cy) & 0xff; this.f = (this.f & (FS | FZ | FPV)) | cy | (this.a & (FX | FY)); break; }
        case 0x08: { let t = this.a; this.a = this.a_; this.a_ = t; t = this.f; this.f = this.f_; this.f_ = t; break; }
        case 0x09: this.hl = this.add16(this.hl, this.bc); break;
        case 0x0a: this.a = this.rd(this.bc); break;
        case 0x0b: this.bc = (this.bc - 1) & 0xffff; break;
        case 0x0c: this.c = this.inc8(this.c); break;
        case 0x0d: this.c = this.dec8(this.c); break;
        case 0x0e: this.c = this.fetch(); break;
        case 0x0f: { const cy = this.a & 1; this.a = ((this.a >> 1) | (cy << 7)) & 0xff; this.f = (this.f & (FS | FZ | FPV)) | cy | (this.a & (FX | FY)); break; }
        case 0x10: { const o = this.fetch(); this.b = (this.b - 1) & 0xff; if (this.b) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; c = 13; } break; }
        case 0x11: this.de = this.fetch16(); break;
        case 0x12: this.wr(this.de, this.a); break;
        case 0x13: this.de = (this.de + 1) & 0xffff; break;
        case 0x14: this.d = this.inc8(this.d); break;
        case 0x15: this.d = this.dec8(this.d); break;
        case 0x16: this.d = this.fetch(); break;
        case 0x17: { const cy = this.a >> 7; this.a = ((this.a << 1) | (this.f & FC)) & 0xff; this.f = (this.f & (FS | FZ | FPV)) | cy | (this.a & (FX | FY)); break; }
        case 0x18: { const o = this.fetch(); this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; break; }
        case 0x19: this.hl = this.add16(this.hl, this.de); break;
        case 0x1a: this.a = this.rd(this.de); break;
        case 0x1b: this.de = (this.de - 1) & 0xffff; break;
        case 0x1c: this.e = this.inc8(this.e); break;
        case 0x1d: this.e = this.dec8(this.e); break;
        case 0x1e: this.e = this.fetch(); break;
        case 0x1f: { const cy = this.a & 1; this.a = ((this.a >> 1) | ((this.f & FC) << 7)) & 0xff; this.f = (this.f & (FS | FZ | FPV)) | cy | (this.a & (FX | FY)); break; }
        case 0x20: case 0x28: case 0x30: case 0x38: {
          const o = this.fetch();
          if (this.cond((op >> 3) & 3)) { this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff; c = 12; }
          break;
        }
        case 0x21: this.hl = this.fetch16(); break;
        case 0x22: this.wr16(this.fetch16(), this.hl); break;
        case 0x23: this.hl = (this.hl + 1) & 0xffff; break;
        case 0x24: this.h = this.inc8(this.h); break;
        case 0x25: this.h = this.dec8(this.h); break;
        case 0x26: this.h = this.fetch(); break;
        case 0x27: this.daa(); break;
        case 0x29: this.hl = this.add16(this.hl, this.hl); break;
        case 0x2a: this.hl = this.rd16(this.fetch16()); break;
        case 0x2b: this.hl = (this.hl - 1) & 0xffff; break;
        case 0x2c: this.l = this.inc8(this.l); break;
        case 0x2d: this.l = this.dec8(this.l); break;
        case 0x2e: this.l = this.fetch(); break;
        case 0x2f: this.a ^= 0xff; this.f = (this.f & (FS | FZ | FPV | FC)) | FH | FN | (this.a & (FX | FY)); break;
        case 0x31: this.sp = this.fetch16(); break;
        case 0x32: this.wr(this.fetch16(), this.a); break;
        case 0x33: this.sp = (this.sp + 1) & 0xffff; break;
        case 0x34: this.wr(this.hl, this.inc8(this.rd(this.hl))); break;
        case 0x35: this.wr(this.hl, this.dec8(this.rd(this.hl))); break;
        case 0x36: this.wr(this.hl, this.fetch()); break;
        case 0x37: this.f = (this.f & (FS | FZ | FPV)) | FC | (this.a & (FX | FY)); break;
        case 0x39: this.hl = this.add16(this.hl, this.sp); break;
        case 0x3a: this.a = this.rd(this.fetch16()); break;
        case 0x3b: this.sp = (this.sp - 1) & 0xffff; break;
        case 0x3c: this.a = this.inc8(this.a); break;
        case 0x3d: this.a = this.dec8(this.a); break;
        case 0x3e: this.a = this.fetch(); break;
        case 0x3f: this.f = ((this.f & (FS | FZ | FPV | FC)) | ((this.f & FC) << 4) | (this.a & (FX | FY))) ^ FC; break;
        case 0x76: this.halted = true; break;
        case 0xc0: case 0xc8: case 0xd0: case 0xd8: case 0xe0: case 0xe8: case 0xf0: case 0xf8:
          if (this.cond((op >> 3) & 7)) { this.pc = this.pop(); c = 11; }
          break;
        case 0xc1: this.bc = this.pop(); break;
        case 0xd1: this.de = this.pop(); break;
        case 0xe1: this.hl = this.pop(); break;
        case 0xf1: this.af = this.pop(); break;
        case 0xc2: case 0xca: case 0xd2: case 0xda: case 0xe2: case 0xea: case 0xf2: case 0xfa: {
          const t = this.fetch16();
          if (this.cond((op >> 3) & 7)) this.pc = t;
          break;
        }
        case 0xc3: this.pc = this.fetch16(); break;
        case 0xc4: case 0xcc: case 0xd4: case 0xdc: case 0xe4: case 0xec: case 0xf4: case 0xfc: {
          const t = this.fetch16();
          if (this.cond((op >> 3) & 7)) { this.push(this.pc); this.pc = t; c = 17; }
          break;
        }
        case 0xc5: this.push(this.bc); break;
        case 0xd5: this.push(this.de); break;
        case 0xe5: this.push(this.hl); break;
        case 0xf5: this.push(this.af); break;
        case 0xc6: case 0xce: case 0xd6: case 0xde: case 0xe6: case 0xee: case 0xf6: case 0xfe:
          this.alu((op >> 3) & 7, this.fetch());
          break;
        case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff:
          this.push(this.pc); this.pc = op & 0x38;
          break;
        case 0xc9: this.pc = this.pop(); break;
        case 0xcb: c = this.opCB(); break;
        case 0xcd: { const t = this.fetch16(); this.push(this.pc); this.pc = t; break; }
        case 0xd3: { const p = this.fetch(); this.bus.out((this.a << 8) | p, this.a); break; }
        case 0xd9: {
          let t;
          t = this.b; this.b = this.b_; this.b_ = t; t = this.c; this.c = this.c_; this.c_ = t;
          t = this.d; this.d = this.d_; this.d_ = t; t = this.e; this.e = this.e_; this.e_ = t;
          t = this.h; this.h = this.h_; this.h_ = t; t = this.l; this.l = this.l_; this.l_ = t;
          break;
        }
        case 0xdb: { const p = this.fetch(); this.a = this.bus.in((this.a << 8) | p) & 0xff; break; }
        case 0xdd: c = this.opXY(0); break;
        case 0xe3: { const t = this.rd16(this.sp); this.wr16(this.sp, this.hl); this.hl = t; break; }
        case 0xe9: this.pc = this.hl; break;
        case 0xeb: { let t = this.d; this.d = this.h; this.h = t; t = this.e; this.e = this.l; this.l = t; break; }
        case 0xed: c = this.opED(); break;
        case 0xf3: this.iff1 = this.iff2 = 0; break;
        case 0xf9: this.sp = this.hl; break;
        case 0xfb: this.iff1 = this.iff2 = 1; this.eiDelay = true; break;
        case 0xfd: c = this.opXY(1); break;
        default:
          if (op >= 0x40 && op < 0x80) {
            // LD r,r'
            this.setR((op >> 3) & 7, this.getR(op & 7));
          } else if (op >= 0x80 && op < 0xc0) {
            this.alu((op >> 3) & 7, this.getR(op & 7));
          }
          break;
      }
      return c;
    }

    daa() {
      let a = this.a, cf = this.f & FC, hf = this.f & FH, nf = this.f & FN;
      let diff = 0;
      if (hf || (a & 0x0f) > 9) diff = 6;
      if (cf || a > 0x99) { diff |= 0x60; cf = FC; }
      const lo = a & 0x0f;
      let h;
      if (nf) h = hf && lo < 6 ? FH : 0;
      else h = lo > 9 ? FH : 0;
      a = nf ? (a - diff) & 0xff : (a + diff) & 0xff;
      this.a = a;
      this.f = SZP[a] | cf | h | nf;
    }

    opCB() {
      this.incR();
      const op = this.fetch();
      const r = op & 7, y = (op >> 3) & 7;
      let v = this.getR(r);
      let c = r === 6 ? 15 : 8;
      switch (op >> 6) {
        case 0: this.setR(r, this.rot(y, v)); break;
        case 1: // BIT
          this.f = (this.f & FC) | FH | (SZP[v & (1 << y)] & ~(FX | FY)) | (v & (FX | FY));
          if (r === 6) c = 12;
          break;
        case 2: this.setR(r, v & ~(1 << y)); break;
        default: this.setR(r, v | (1 << y)); break;
      }
      return c;
    }

    // DD / FD prefixed
    opXY(which) {
      this.incR();
      const op = this.fetch();
      let xy = which ? this.iy : this.ix;
      const setXY = (v) => { if (which) this.iy = v & 0xffff; else this.ix = v & 0xffff; };
      const disp = () => { const d = this.fetch(); return (xy + ((d << 24) >> 24)) & 0xffff; };
      let c;
      switch (op) {
        case 0x09: setXY(this.add16(xy, this.bc)); return 15;
        case 0x19: setXY(this.add16(xy, this.de)); return 15;
        case 0x21: setXY(this.fetch16()); return 14;
        case 0x22: this.wr16(this.fetch16(), xy); return 20;
        case 0x23: setXY(xy + 1); return 10;
        case 0x24: setXY((this.inc8(xy >> 8) << 8) | (xy & 0xff)); return 8;
        case 0x25: setXY((this.dec8(xy >> 8) << 8) | (xy & 0xff)); return 8;
        case 0x26: setXY((this.fetch() << 8) | (xy & 0xff)); return 11;
        case 0x29: setXY(this.add16(xy, xy)); return 15;
        case 0x2a: setXY(this.rd16(this.fetch16())); return 20;
        case 0x2b: setXY(xy - 1); return 10;
        case 0x2c: setXY((xy & 0xff00) | this.inc8(xy & 0xff)); return 8;
        case 0x2d: setXY((xy & 0xff00) | this.dec8(xy & 0xff)); return 8;
        case 0x2e: setXY((xy & 0xff00) | this.fetch()); return 11;
        case 0x34: { const a = disp(); this.wr(a, this.inc8(this.rd(a))); return 23; }
        case 0x35: { const a = disp(); this.wr(a, this.dec8(this.rd(a))); return 23; }
        case 0x36: { const a = disp(); this.wr(a, this.fetch()); return 19; }
        case 0x39: setXY(this.add16(xy, this.sp)); return 15;
        case 0xcb: {
          const a = disp();
          const op2 = this.fetch();
          const r = op2 & 7, y = (op2 >> 3) & 7;
          let v = this.rd(a), res;
          switch (op2 >> 6) {
            case 0: res = this.rot(y, v); break;
            case 1:
              this.f = (this.f & FC) | FH | (SZP[v & (1 << y)] & ~(FX | FY)) | ((a >> 8) & (FX | FY));
              return 20;
            case 2: res = v & ~(1 << y); break;
            default: res = v | (1 << y); break;
          }
          this.wr(a, res);
          if (r !== 6) this.setR(r, res);
          return 23;
        }
        case 0xe1: setXY(this.pop()); return 14;
        case 0xe3: { const t = this.rd16(this.sp); this.wr16(this.sp, xy); setXY(t); return 23; }
        case 0xe5: this.push(xy); return 15;
        case 0xe9: this.pc = xy; return 8;
        case 0xf9: this.sp = xy; return 10;
      }
      // LD r,(IX+d) / LD (IX+d),r / ALU (IX+d) and IXH/IXL variants
      if (op >= 0x40 && op < 0x80 && op !== 0x76) {
        const dst = (op >> 3) & 7, src = op & 7;
        if (src === 6) { const a = disp(); this.setR(dst, this.rd(a)); return 19; }
        if (dst === 6) { const a = disp(); this.wr(a, this.getR(src)); return 19; }
        // undocumented IXH/IXL
        const get = (i) => i === 4 ? (xy >> 8) : i === 5 ? (xy & 0xff) : this.getR(i);
        const v = get(src);
        if (dst === 4) setXY((v << 8) | (xy & 0xff));
        else if (dst === 5) setXY((xy & 0xff00) | v);
        else this.setR(dst, v);
        return 8;
      }
      if (op >= 0x80 && op < 0xc0) {
        const src = op & 7;
        let v;
        if (src === 6) { v = this.rd(disp()); c = 19; }
        else if (src === 4) { v = xy >> 8; c = 8; }
        else if (src === 5) { v = xy & 0xff; c = 8; }
        else { v = this.getR(src); c = 8; }
        this.alu((op >> 3) & 7, v);
        return c;
      }
      // anything else: behave as unprefixed opcode
      this.pc = (this.pc - 1) & 0xffff;
      return 4 + this.step();
    }

    opED() {
      this.incR();
      const op = this.fetch();
      switch (op) {
        case 0x40: case 0x48: case 0x50: case 0x58: case 0x60: case 0x68: case 0x70: case 0x78: {
          const v = this.bus.in(this.bc) & 0xff;
          const r = (op >> 3) & 7;
          if (r !== 6) this.setR(r, v);
          this.f = (this.f & FC) | SZP[v];
          return 12;
        }
        case 0x41: case 0x49: case 0x51: case 0x59: case 0x61: case 0x69: case 0x71: case 0x79: {
          const r = (op >> 3) & 7;
          this.bus.out(this.bc, r === 6 ? 0 : this.getR(r));
          return 12;
        }
        case 0x42: this.sbc16(this.bc); return 15;
        case 0x52: this.sbc16(this.de); return 15;
        case 0x62: this.sbc16(this.hl); return 15;
        case 0x72: this.sbc16(this.sp); return 15;
        case 0x4a: this.adc16(this.bc); return 15;
        case 0x5a: this.adc16(this.de); return 15;
        case 0x6a: this.adc16(this.hl); return 15;
        case 0x7a: this.adc16(this.sp); return 15;
        case 0x43: this.wr16(this.fetch16(), this.bc); return 20;
        case 0x53: this.wr16(this.fetch16(), this.de); return 20;
        case 0x63: this.wr16(this.fetch16(), this.hl); return 20;
        case 0x73: this.wr16(this.fetch16(), this.sp); return 20;
        case 0x4b: this.bc = this.rd16(this.fetch16()); return 20;
        case 0x5b: this.de = this.rd16(this.fetch16()); return 20;
        case 0x6b: this.hl = this.rd16(this.fetch16()); return 20;
        case 0x7b: this.sp = this.rd16(this.fetch16()); return 20;
        case 0x44: case 0x4c: case 0x54: case 0x5c: case 0x64: case 0x6c: case 0x74: case 0x7c: {
          const v = this.a; this.a = 0; this.sub8(v, 0); return 8;
        }
        case 0x45: case 0x55: case 0x5d: case 0x65: case 0x6d: case 0x75: case 0x7d:
          this.iff1 = this.iff2; this.pc = this.pop(); return 14;
        case 0x4d: this.iff1 = this.iff2; this.pc = this.pop(); return 14; // RETI
        case 0x46: case 0x4e: case 0x66: case 0x6e: this.im = 0; return 8;
        case 0x56: case 0x76: this.im = 1; return 8;
        case 0x5e: case 0x7e: this.im = 2; return 8;
        case 0x47: this.i = this.a; return 9;
        case 0x4f: this.r = this.a; return 9;
        case 0x57: this.a = this.i; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FPV : 0); return 9;
        case 0x5f: this.a = this.r; this.f = (this.f & FC) | SZ[this.a] | (this.iff2 ? FPV : 0); return 9;
        case 0x67: { // RRD
          const m = this.rd(this.hl);
          this.wr(this.hl, ((this.a << 4) | (m >> 4)) & 0xff);
          this.a = (this.a & 0xf0) | (m & 0x0f);
          this.f = (this.f & FC) | SZP[this.a];
          return 18;
        }
        case 0x6f: { // RLD
          const m = this.rd(this.hl);
          this.wr(this.hl, ((m << 4) | (this.a & 0x0f)) & 0xff);
          this.a = (this.a & 0xf0) | (m >> 4);
          this.f = (this.f & FC) | SZP[this.a];
          return 18;
        }
        case 0xa0: case 0xb0: case 0xa8: case 0xb8: { // LDI LDIR LDD LDDR
          const v = this.rd(this.hl);
          this.wr(this.de, v);
          const inc = (op & 8) ? -1 : 1;
          this.hl = (this.hl + inc) & 0xffff;
          this.de = (this.de + inc) & 0xffff;
          this.bc = (this.bc - 1) & 0xffff;
          const n = (v + this.a) & 0xff;
          this.f = (this.f & (FS | FZ | FC)) | (this.bc ? FPV : 0) | (n & FX) | ((n << 4) & FY);
          if ((op & 0x10) && this.bc) { this.pc = (this.pc - 2) & 0xffff; return 21; }
          return 16;
        }
        case 0xa1: case 0xb1: case 0xa9: case 0xb9: { // CPI CPIR CPD CPDR
          const v = this.rd(this.hl);
          const r = (this.a - v) & 0xff;
          const inc = (op & 8) ? -1 : 1;
          this.hl = (this.hl + inc) & 0xffff;
          this.bc = (this.bc - 1) & 0xffff;
          const h = (this.a ^ v ^ r) & FH;
          const n = (r - (h ? 1 : 0)) & 0xff;
          this.f = (this.f & FC) | FN | (SZ[r] & ~(FX | FY)) | h | (this.bc ? FPV : 0) | (n & FX) | ((n << 4) & FY);
          if ((op & 0x10) && this.bc && r !== 0) { this.pc = (this.pc - 2) & 0xffff; return 21; }
          return 16;
        }
        case 0xa2: case 0xb2: case 0xaa: case 0xba: { // INI INIR IND INDR
          const v = this.bus.in(this.bc) & 0xff;
          this.wr(this.hl, v);
          const inc = (op & 8) ? -1 : 1;
          this.hl = (this.hl + inc) & 0xffff;
          this.b = (this.b - 1) & 0xff;
          this.f = SZ[this.b] | FN;
          if ((op & 0x10) && this.b) { this.pc = (this.pc - 2) & 0xffff; return 21; }
          return 16;
        }
        case 0xa3: case 0xb3: case 0xab: case 0xbb: { // OUTI OTIR OUTD OTDR
          const v = this.rd(this.hl);
          this.b = (this.b - 1) & 0xff;
          this.bus.out(this.bc, v);
          const inc = (op & 8) ? -1 : 1;
          this.hl = (this.hl + inc) & 0xffff;
          this.f = SZ[this.b] | FN;
          if ((op & 0x10) && this.b) { this.pc = (this.pc - 2) & 0xffff; return 21; }
          return 16;
        }
      }
      return 8;
    }
  }

  root.CC = root.CC || {};
  root.CC.Z80 = Z80;
})(typeof window !== 'undefined' ? window : globalThis);
