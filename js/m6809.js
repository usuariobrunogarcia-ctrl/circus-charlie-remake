/*
 * Motorola 6809 CPU core (with support for the Konami-1 opcode encryption
 * through the bus.readOp() callback).
 *
 * bus interface:
 *   bus.read(addr)        -> byte   (data / operand reads)
 *   bus.write(addr, val)
 *   bus.readOp(addr)      -> byte   (opcode fetches, may be decrypted)
 */
(function (root) {
  'use strict';

  const CC_C = 0x01, CC_V = 0x02, CC_Z = 0x04, CC_N = 0x08,
        CC_I = 0x10, CC_H = 0x20, CC_F = 0x40, CC_E = 0x80;

  class M6809 {
    constructor(bus) {
      this.bus = bus;
      this.a = 0; this.b = 0; this.x = 0; this.y = 0; this.u = 0; this.s = 0;
      this.pc = 0; this.dp = 0; this.cc = CC_I | CC_F;
      this.irqLine = false; this.firqLine = false; this.nmiPending = false;
      this.cwai = false; this.syncing = false;
      this.icount = 0;
      this.totalCycles = 0;
      this.extra = 0;
      this.ea = 0;
    }

    reset() {
      this.dp = 0;
      this.cc = CC_I | CC_F;
      this.cwai = false; this.syncing = false;
      this.nmiPending = false;
      this.pc = this.read16(0xfffe);
    }

    setIRQ(state) { this.irqLine = !!state; }
    setFIRQ(state) { this.firqLine = !!state; }

    // ---------------------------------------------------------------- memory
    read16(addr) {
      return ((this.bus.read(addr & 0xffff) << 8) | this.bus.read((addr + 1) & 0xffff));
    }
    write16(addr, v) {
      this.bus.write(addr & 0xffff, (v >> 8) & 0xff);
      this.bus.write((addr + 1) & 0xffff, v & 0xff);
    }
    fetch8() {
      const v = this.bus.read(this.pc);
      this.pc = (this.pc + 1) & 0xffff;
      return v;
    }
    fetch16() {
      const v = (this.bus.read(this.pc) << 8) | this.bus.read((this.pc + 1) & 0xffff);
      this.pc = (this.pc + 2) & 0xffff;
      return v;
    }
    fetchOp() {
      const v = this.bus.readOp(this.pc);
      this.pc = (this.pc + 1) & 0xffff;
      return v;
    }
    pushS8(v) { this.s = (this.s - 1) & 0xffff; this.bus.write(this.s, v & 0xff); }
    pushS16(v) { this.pushS8(v); this.pushS8(v >> 8); }
    pullS8() { const v = this.bus.read(this.s); this.s = (this.s + 1) & 0xffff; return v; }
    pullS16() { const h = this.pullS8(); return (h << 8) | this.pullS8(); }
    pushU8(v) { this.u = (this.u - 1) & 0xffff; this.bus.write(this.u, v & 0xff); }
    pushU16(v) { this.pushU8(v); this.pushU8(v >> 8); }
    pullU8() { const v = this.bus.read(this.u); this.u = (this.u + 1) & 0xffff; return v; }
    pullU16() { const h = this.pullU8(); return (h << 8) | this.pullU8(); }

    get d() { return (this.a << 8) | this.b; }
    set d(v) { this.a = (v >> 8) & 0xff; this.b = v & 0xff; }

    // ------------------------------------------------------ addressing modes
    eaDir() { return (this.dp << 8) | this.fetch8(); }
    eaExt() { return this.fetch16(); }

    getIReg(pb) {
      switch ((pb >> 5) & 3) {
        case 0: return this.x;
        case 1: return this.y;
        case 2: return this.u;
        default: return this.s;
      }
    }
    setIReg(pb, v) {
      v &= 0xffff;
      switch ((pb >> 5) & 3) {
        case 0: this.x = v; break;
        case 1: this.y = v; break;
        case 2: this.u = v; break;
        default: this.s = v; break;
      }
    }

    eaIdx() {
      const pb = this.fetch8();
      let ea, r;
      if (!(pb & 0x80)) {
        let off = pb & 0x1f;
        if (off & 0x10) off -= 0x20;
        this.extra += 1;
        return (this.getIReg(pb) + off) & 0xffff;
      }
      switch (pb & 0x0f) {
        case 0x00: r = this.getIReg(pb); ea = r; this.setIReg(pb, r + 1); this.extra += 2; break;
        case 0x01: r = this.getIReg(pb); ea = r; this.setIReg(pb, r + 2); this.extra += 3; break;
        case 0x02: r = (this.getIReg(pb) - 1) & 0xffff; this.setIReg(pb, r); ea = r; this.extra += 2; break;
        case 0x03: r = (this.getIReg(pb) - 2) & 0xffff; this.setIReg(pb, r); ea = r; this.extra += 3; break;
        case 0x04: ea = this.getIReg(pb); break;
        case 0x05: ea = this.getIReg(pb) + ((this.b << 24) >> 24); this.extra += 1; break;
        case 0x06: ea = this.getIReg(pb) + ((this.a << 24) >> 24); this.extra += 1; break;
        case 0x08: { const o = this.fetch8(); ea = this.getIReg(pb) + ((o << 24) >> 24); this.extra += 1; break; }
        case 0x09: { const o = this.fetch16(); ea = this.getIReg(pb) + o; this.extra += 4; break; }
        case 0x0b: ea = this.getIReg(pb) + this.d; this.extra += 4; break;
        case 0x0c: { const o = this.fetch8(); ea = this.pc + ((o << 24) >> 24); this.extra += 1; break; }
        case 0x0d: { const o = this.fetch16(); ea = this.pc + o; this.extra += 5; break; }
        case 0x0f: ea = this.fetch16(); this.extra += 2; break;
        default: ea = 0; break;
      }
      ea &= 0xffff;
      if (pb & 0x10) {
        ea = this.read16(ea);
        this.extra += 3;
      }
      return ea;
    }

    // ------------------------------------------------------------ ALU helpers
    nz8(r) {
      this.cc = (this.cc & ~(CC_N | CC_Z)) | (r & 0x80 ? CC_N : 0) | ((r & 0xff) === 0 ? CC_Z : 0);
    }
    nz16(r) {
      this.cc = (this.cc & ~(CC_N | CC_Z)) | (r & 0x8000 ? CC_N : 0) | ((r & 0xffff) === 0 ? CC_Z : 0);
    }
    ld8(v) { this.cc &= ~CC_V; this.nz8(v); return v; }
    ld16(v) { this.cc &= ~CC_V; this.nz16(v); return v; }

    add8(a, m, c) {
      const r = a + m + c;
      let cc = this.cc & ~(CC_H | CC_N | CC_Z | CC_V | CC_C);
      if ((a ^ m ^ r) & 0x10) cc |= CC_H;
      if (r & 0x80) cc |= CC_N;
      if ((r & 0xff) === 0) cc |= CC_Z;
      if ((a ^ r) & (m ^ r) & 0x80) cc |= CC_V;
      if (r & 0x100) cc |= CC_C;
      this.cc = cc;
      return r & 0xff;
    }
    sub8(a, m, c) {
      const r = a - m - c;
      let cc = this.cc & ~(CC_N | CC_Z | CC_V | CC_C);
      if (r & 0x80) cc |= CC_N;
      if ((r & 0xff) === 0) cc |= CC_Z;
      if ((a ^ m) & (a ^ r) & 0x80) cc |= CC_V;
      if (r & 0x100) cc |= CC_C;
      this.cc = cc;
      return r & 0xff;
    }
    add16(a, m) {
      const r = a + m;
      let cc = this.cc & ~(CC_N | CC_Z | CC_V | CC_C);
      if (r & 0x8000) cc |= CC_N;
      if ((r & 0xffff) === 0) cc |= CC_Z;
      if ((a ^ r) & (m ^ r) & 0x8000) cc |= CC_V;
      if (r & 0x10000) cc |= CC_C;
      this.cc = cc;
      return r & 0xffff;
    }
    sub16(a, m) {
      const r = a - m;
      let cc = this.cc & ~(CC_N | CC_Z | CC_V | CC_C);
      if (r & 0x8000) cc |= CC_N;
      if ((r & 0xffff) === 0) cc |= CC_Z;
      if ((a ^ m) & (a ^ r) & 0x8000) cc |= CC_V;
      if (r & 0x10000) cc |= CC_C;
      this.cc = cc;
      return r & 0xffff;
    }

    // read-modify-write ops
    rmw(fn, m) {
      let r, cc = this.cc;
      switch (fn) {
        case 0x0: case 0x1: // NEG
          r = (-m) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V | CC_C);
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          if (m === 0x80) cc |= CC_V;
          if (r !== 0) cc |= CC_C;
          break;
        case 0x2: // XNC (undocumented) - behave like NEG/COM depending on carry
          if (cc & CC_C) { this.cc = cc; return this.rmw(0x3, m); }
          return this.rmw(0x0, m);
        case 0x3: // COM
          r = (~m) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V);
          cc |= CC_C;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0x4: case 0x5: // LSR
          r = m >> 1;
          cc &= ~(CC_N | CC_Z | CC_C);
          if (m & 1) cc |= CC_C;
          if (r === 0) cc |= CC_Z;
          break;
        case 0x6: // ROR
          r = ((cc & CC_C) << 7) | (m >> 1);
          cc &= ~(CC_N | CC_Z | CC_C);
          if (m & 1) cc |= CC_C;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0x7: // ASR
          r = (m & 0x80) | (m >> 1);
          cc &= ~(CC_N | CC_Z | CC_C);
          if (m & 1) cc |= CC_C;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0x8: // ASL
          r = (m << 1) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V | CC_C);
          if (m & 0x80) cc |= CC_C;
          if ((m ^ (m << 1)) & 0x80) cc |= CC_V;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0x9: // ROL
          r = ((m << 1) | (cc & CC_C)) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V | CC_C);
          if (m & 0x80) cc |= CC_C;
          if ((m ^ (m << 1)) & 0x80) cc |= CC_V;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0xa: case 0xb: // DEC
          r = (m - 1) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V);
          if (m === 0x80) cc |= CC_V;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0xc: // INC
          r = (m + 1) & 0xff;
          cc &= ~(CC_N | CC_Z | CC_V);
          if (m === 0x7f) cc |= CC_V;
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0xd: // TST
          r = m;
          cc &= ~(CC_N | CC_Z | CC_V);
          if (r & 0x80) cc |= CC_N;
          if (r === 0) cc |= CC_Z;
          break;
        case 0xf: // CLR
          r = 0;
          cc &= ~(CC_N | CC_V | CC_C);
          cc |= CC_Z;
          break;
        default:
          r = m;
      }
      this.cc = cc;
      return r;
    }

    // 8 bit ALU ops for 0x80..0xff ; fn = low nibble
    alu8(fn, reg, m) {
      switch (fn) {
        case 0x0: return this.sub8(reg, m, 0);                       // SUB
        case 0x1: this.sub8(reg, m, 0); return reg;                   // CMP
        case 0x2: return this.sub8(reg, m, this.cc & CC_C);           // SBC
        case 0x4: return this.ld8(reg & m);                           // AND
        case 0x5: this.ld8(reg & m); return reg;                      // BIT
        case 0x6: return this.ld8(m);                                 // LD
        case 0x8: return this.ld8(reg ^ m);                           // EOR
        case 0x9: return this.add8(reg, m, this.cc & CC_C);           // ADC
        case 0xa: return this.ld8(reg | m);                           // OR
        case 0xb: return this.add8(reg, m, 0);                        // ADD
      }
      return reg;
    }

    branchCond(op) {
      const cc = this.cc;
      switch (op & 0x0f) {
        case 0x0: return true;
        case 0x1: return false;
        case 0x2: return !(cc & (CC_C | CC_Z));
        case 0x3: return !!(cc & (CC_C | CC_Z));
        case 0x4: return !(cc & CC_C);
        case 0x5: return !!(cc & CC_C);
        case 0x6: return !(cc & CC_Z);
        case 0x7: return !!(cc & CC_Z);
        case 0x8: return !(cc & CC_V);
        case 0x9: return !!(cc & CC_V);
        case 0xa: return !(cc & CC_N);
        case 0xb: return !!(cc & CC_N);
        case 0xc: return !(((cc & CC_N) >> 3) ^ ((cc & CC_V) >> 1));
        case 0xd: return !!(((cc & CC_N) >> 3) ^ ((cc & CC_V) >> 1));
        case 0xe: return !(cc & CC_Z) && !(((cc & CC_N) >> 3) ^ ((cc & CC_V) >> 1));
        default:  return !!(cc & CC_Z) || !!(((cc & CC_N) >> 3) ^ ((cc & CC_V) >> 1));
      }
    }

    readReg(code) {
      switch (code & 0x0f) {
        case 0: return this.d;
        case 1: return this.x;
        case 2: return this.y;
        case 3: return this.u;
        case 4: return this.s;
        case 5: return this.pc;
        case 8: return 0xff00 | this.a;
        case 9: return 0xff00 | this.b;
        case 10: return (this.cc << 8) | this.cc;
        case 11: return (this.dp << 8) | this.dp;
        default: return 0xffff;
      }
    }
    writeReg(code, v) {
      v &= 0xffff;
      switch (code & 0x0f) {
        case 0: this.d = v; break;
        case 1: this.x = v; break;
        case 2: this.y = v; break;
        case 3: this.u = v; break;
        case 4: this.s = v; break;
        case 5: this.pc = v; break;
        case 8: this.a = v & 0xff; break;
        case 9: this.b = v & 0xff; break;
        case 10: this.cc = v & 0xff; break;
        case 11: this.dp = v & 0xff; break;
      }
    }

    pushAll() {
      this.pushS16(this.pc);
      this.pushS16(this.u);
      this.pushS16(this.y);
      this.pushS16(this.x);
      this.pushS8(this.dp);
      this.pushS8(this.b);
      this.pushS8(this.a);
      this.pushS8(this.cc);
    }

    // ---------------------------------------------------------- interrupts
    checkInterrupts() {
      if (this.nmiPending) {
        this.nmiPending = false;
        if (!this.cwai) { this.cc |= CC_E; this.pushAll(); }
        this.cwai = false;
        this.cc |= CC_I | CC_F;
        this.pc = this.read16(0xfffc);
        return 19;
      }
      if (this.firqLine && !(this.cc & CC_F)) {
        if (this.cwai) {
          // entire state was already pushed
        } else {
          this.cc &= ~CC_E;
          this.pushS16(this.pc);
          this.pushS8(this.cc);
        }
        this.cwai = false;
        this.cc |= CC_I | CC_F;
        this.pc = this.read16(0xfff6);
        return 10;
      }
      if (this.irqLine && !(this.cc & CC_I)) {
        if (!this.cwai) { this.cc |= CC_E; this.pushAll(); }
        this.cwai = false;
        this.cc |= CC_I;
        this.pc = this.read16(0xfff8);
        return 19;
      }
      return 0;
    }

    // ------------------------------------------------------------ execute
    execute(cycles) {
      this.icount += cycles;
      while (this.icount > 0) {
        if (this.syncing) {
          if (this.irqLine || this.firqLine || this.nmiPending) {
            this.syncing = false;
          } else {
            this.totalCycles += this.icount;
            this.icount = 0;
            break;
          }
        }
        let c = this.checkInterrupts();
        if (c) { this.icount -= c; this.totalCycles += c; continue; }
        if (this.cwai) { this.totalCycles += this.icount; this.icount = 0; break; }
        c = this.step();
        this.icount -= c;
        this.totalCycles += c;
      }
    }

    step() {
      this.extra = 0;
      const op = this.fetchOp();
      let ea, m, r;
      if (op < 0x80) {
        switch (op >> 4) {
          case 0x0: // direct RMW
            ea = this.eaDir();
            if (op === 0x0e) { this.pc = ea; return 3; }
            m = this.bus.read(ea);
            r = this.rmw(op & 0x0f, m);
            if ((op & 0x0f) !== 0x0d) this.bus.write(ea, r);
            return 6;
          case 0x1:
            return this.op1x(op);
          case 0x2: { // branches
            const o = this.fetch8();
            if (this.branchCond(op)) this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff;
            return 3;
          }
          case 0x3:
            return this.op3x(op);
          case 0x4: // A inherent
            if ((op & 0x0f) === 0x0e) return 2; // illegal
            this.a = this.rmw(op & 0x0f, this.a);
            return 2;
          case 0x5:
            if ((op & 0x0f) === 0x0e) return 2;
            this.b = this.rmw(op & 0x0f, this.b);
            return 2;
          case 0x6:
            ea = this.eaIdx();
            if (op === 0x6e) { this.pc = ea; return 3 + this.extra; }
            m = this.bus.read(ea);
            r = this.rmw(op & 0x0f, m);
            if ((op & 0x0f) !== 0x0d) this.bus.write(ea, r);
            return 6 + this.extra;
          case 0x7:
            ea = this.eaExt();
            if (op === 0x7e) { this.pc = ea; return 4; }
            m = this.bus.read(ea);
            r = this.rmw(op & 0x0f, m);
            if ((op & 0x0f) !== 0x0d) this.bus.write(ea, r);
            return 7;
        }
        return 2;
      }
      return this.opHigh(op);
    }

    op1x(op) {
      switch (op) {
        case 0x10: return this.page2();
        case 0x11: return this.page3();
        case 0x12: return 2; // NOP
        case 0x13: this.syncing = true; return 4; // SYNC
        case 0x16: { const o = this.fetch16(); this.pc = (this.pc + o) & 0xffff; return 5; } // LBRA
        case 0x17: { const o = this.fetch16(); this.pushS16(this.pc); this.pc = (this.pc + o) & 0xffff; return 9; } // LBSR
        case 0x19: { // DAA
          let cf = 0;
          const msn = this.a & 0xf0, lsn = this.a & 0x0f;
          if (lsn > 0x09 || (this.cc & CC_H)) cf |= 0x06;
          if (msn > 0x80 && lsn > 0x09) cf |= 0x60;
          if (msn > 0x90 || (this.cc & CC_C)) cf |= 0x60;
          const t = cf + this.a;
          this.cc &= ~(CC_V);
          if (t & 0x100) this.cc |= CC_C;
          this.a = t & 0xff;
          this.nz8(this.a);
          return 2;
        }
        case 0x1a: this.cc |= this.fetch8(); return 3; // ORCC
        case 0x1c: this.cc &= this.fetch8(); return 3; // ANDCC
        case 0x1d: // SEX
          this.a = (this.b & 0x80) ? 0xff : 0;
          this.nz16(this.d);
          return 2;
        case 0x1e: { // EXG
          const pb = this.fetch8();
          const r1 = this.readReg(pb >> 4), r2 = this.readReg(pb);
          this.writeReg(pb, r1);
          this.writeReg(pb >> 4, r2);
          return 8;
        }
        case 0x1f: { // TFR
          const pb = this.fetch8();
          this.writeReg(pb, this.readReg(pb >> 4));
          return 6;
        }
      }
      return 2;
    }

    op3x(op) {
      switch (op) {
        case 0x30: this.x = this.eaIdx(); this.cc = (this.cc & ~CC_Z) | (this.x === 0 ? CC_Z : 0); return 4 + this.extra;
        case 0x31: this.y = this.eaIdx(); this.cc = (this.cc & ~CC_Z) | (this.y === 0 ? CC_Z : 0); return 4 + this.extra;
        case 0x32: this.s = this.eaIdx(); return 4 + this.extra;
        case 0x33: this.u = this.eaIdx(); return 4 + this.extra;
        case 0x34: { // PSHS
          const pb = this.fetch8(); let n = 0;
          if (pb & 0x80) { this.pushS16(this.pc); n += 2; }
          if (pb & 0x40) { this.pushS16(this.u); n += 2; }
          if (pb & 0x20) { this.pushS16(this.y); n += 2; }
          if (pb & 0x10) { this.pushS16(this.x); n += 2; }
          if (pb & 0x08) { this.pushS8(this.dp); n++; }
          if (pb & 0x04) { this.pushS8(this.b); n++; }
          if (pb & 0x02) { this.pushS8(this.a); n++; }
          if (pb & 0x01) { this.pushS8(this.cc); n++; }
          return 5 + n;
        }
        case 0x35: { // PULS
          const pb = this.fetch8(); let n = 0;
          if (pb & 0x01) { this.cc = this.pullS8(); n++; }
          if (pb & 0x02) { this.a = this.pullS8(); n++; }
          if (pb & 0x04) { this.b = this.pullS8(); n++; }
          if (pb & 0x08) { this.dp = this.pullS8(); n++; }
          if (pb & 0x10) { this.x = this.pullS16(); n += 2; }
          if (pb & 0x20) { this.y = this.pullS16(); n += 2; }
          if (pb & 0x40) { this.u = this.pullS16(); n += 2; }
          if (pb & 0x80) { this.pc = this.pullS16(); n += 2; }
          return 5 + n;
        }
        case 0x36: { // PSHU
          const pb = this.fetch8(); let n = 0;
          if (pb & 0x80) { this.pushU16(this.pc); n += 2; }
          if (pb & 0x40) { this.pushU16(this.s); n += 2; }
          if (pb & 0x20) { this.pushU16(this.y); n += 2; }
          if (pb & 0x10) { this.pushU16(this.x); n += 2; }
          if (pb & 0x08) { this.pushU8(this.dp); n++; }
          if (pb & 0x04) { this.pushU8(this.b); n++; }
          if (pb & 0x02) { this.pushU8(this.a); n++; }
          if (pb & 0x01) { this.pushU8(this.cc); n++; }
          return 5 + n;
        }
        case 0x37: { // PULU
          const pb = this.fetch8(); let n = 0;
          if (pb & 0x01) { this.cc = this.pullU8(); n++; }
          if (pb & 0x02) { this.a = this.pullU8(); n++; }
          if (pb & 0x04) { this.b = this.pullU8(); n++; }
          if (pb & 0x08) { this.dp = this.pullU8(); n++; }
          if (pb & 0x10) { this.x = this.pullU16(); n += 2; }
          if (pb & 0x20) { this.y = this.pullU16(); n += 2; }
          if (pb & 0x40) { this.s = this.pullU16(); n += 2; }
          if (pb & 0x80) { this.pc = this.pullU16(); n += 2; }
          return 5 + n;
        }
        case 0x39: this.pc = this.pullS16(); return 5; // RTS
        case 0x3a: this.x = (this.x + this.b) & 0xffff; return 3; // ABX
        case 0x3b: { // RTI
          this.cc = this.pullS8();
          if (this.cc & CC_E) {
            this.a = this.pullS8(); this.b = this.pullS8(); this.dp = this.pullS8();
            this.x = this.pullS16(); this.y = this.pullS16(); this.u = this.pullS16();
            this.pc = this.pullS16();
            return 15;
          }
          this.pc = this.pullS16();
          return 6;
        }
        case 0x3c: { // CWAI
          const m = this.fetch8();
          this.cc &= m;
          this.cc |= CC_E;
          this.pushAll();
          this.cwai = true;
          return 20;
        }
        case 0x3d: { // MUL
          const r = this.a * this.b;
          this.d = r;
          this.cc &= ~(CC_Z | CC_C);
          if ((r & 0xffff) === 0) this.cc |= CC_Z;
          if (r & 0x80) this.cc |= CC_C;
          return 11;
        }
        case 0x3f: // SWI
          this.cc |= CC_E;
          this.pushAll();
          this.cc |= CC_I | CC_F;
          this.pc = this.read16(0xfffa);
          return 19;
      }
      return 2;
    }

    opHigh(op) {
      const mode = (op >> 4) & 3;       // 0 imm, 1 dir, 2 idx, 3 ext
      const isB = (op & 0x40) !== 0;
      const fn = op & 0x0f;
      let ea = 0, base;

      // Base cycle counts: 8bit ops imm 2, dir 4, idx 4, ext 5
      switch (fn) {
        case 0x3: { // SUBD / ADDD
          let m;
          if (mode === 0) { m = this.fetch16(); base = 4; }
          else { ea = this.getEA(mode); m = this.read16(ea); base = mode === 1 ? 6 : mode === 2 ? 6 : 7; }
          if (isB) this.d = this.add16(this.d, m);
          else this.d = this.sub16(this.d, m);
          return base + this.extra;
        }
        case 0x7: { // STA / STB
          if (mode === 0) return 2; // illegal
          ea = this.getEA(mode);
          const v = isB ? this.b : this.a;
          this.ld8(v);
          this.bus.write(ea, v);
          return (mode === 3 ? 5 : 4) + this.extra;
        }
        case 0xc: { // CMPX (A side) / LDD (B side)
          let m;
          if (mode === 0) { m = this.fetch16(); base = isB ? 3 : 4; }
          else { ea = this.getEA(mode); m = this.read16(ea); base = isB ? (mode === 3 ? 6 : 5) : (mode === 3 ? 7 : 6); }
          if (isB) this.d = this.ld16(m);
          else this.sub16(this.x, m);
          return base + this.extra;
        }
        case 0xd: { // BSR/JSR (A side) ; STD (B side)
          if (!isB) {
            if (mode === 0) {
              const o = this.fetch8();
              this.pushS16(this.pc);
              this.pc = (this.pc + ((o << 24) >> 24)) & 0xffff;
              return 7;
            }
            ea = this.getEA(mode);
            this.pushS16(this.pc);
            this.pc = ea;
            return (mode === 3 ? 8 : 7) + this.extra;
          }
          if (mode === 0) return 2;
          ea = this.getEA(mode);
          this.ld16(this.d);
          this.write16(ea, this.d);
          return (mode === 3 ? 6 : 5) + this.extra;
        }
        case 0xe: { // LDX / LDU
          let m;
          if (mode === 0) { m = this.fetch16(); base = 3; }
          else { ea = this.getEA(mode); m = this.read16(ea); base = mode === 3 ? 6 : 5; }
          if (isB) this.u = this.ld16(m); else this.x = this.ld16(m);
          return base + this.extra;
        }
        case 0xf: { // STX / STU
          if (mode === 0) return 2;
          ea = this.getEA(mode);
          const v = isB ? this.u : this.x;
          this.ld16(v);
          this.write16(ea, v);
          return (mode === 3 ? 6 : 5) + this.extra;
        }
        default: {
          let m;
          if (mode === 0) { m = this.fetch8(); base = 2; }
          else { ea = this.getEA(mode); m = this.bus.read(ea); base = mode === 3 ? 5 : 4; }
          if (isB) this.b = this.alu8(fn, this.b, m);
          else this.a = this.alu8(fn, this.a, m);
          return base + this.extra;
        }
      }
    }

    getEA(mode) {
      if (mode === 1) return this.eaDir();
      if (mode === 2) return this.eaIdx();
      return this.eaExt();
    }

    page2() {
      const op = this.fetchOp();
      if (op >= 0x21 && op <= 0x2f) { // long branches
        const o = this.fetch16();
        if (this.branchCond(op)) { this.pc = (this.pc + o) & 0xffff; return 6; }
        return 5;
      }
      if (op === 0x3f) { // SWI2
        this.cc |= CC_E;
        this.pushAll();
        this.pc = this.read16(0xfff4);
        return 20;
      }
      if (op < 0x80) return 2;
      const mode = (op >> 4) & 3;
      const fn = op & 0x4f;
      let ea, m;
      switch (fn) {
        case 0x03: // CMPD
          if (mode === 0) { m = this.fetch16(); this.sub16(this.d, m); return 5; }
          ea = this.getEA(mode); m = this.read16(ea); this.sub16(this.d, m);
          return (mode === 3 ? 8 : 7) + this.extra;
        case 0x0c: // CMPY
          if (mode === 0) { m = this.fetch16(); this.sub16(this.y, m); return 5; }
          ea = this.getEA(mode); m = this.read16(ea); this.sub16(this.y, m);
          return (mode === 3 ? 8 : 7) + this.extra;
        case 0x0e: // LDY
          if (mode === 0) { this.y = this.ld16(this.fetch16()); return 4; }
          ea = this.getEA(mode); this.y = this.ld16(this.read16(ea));
          return (mode === 3 ? 7 : 6) + this.extra;
        case 0x0f: // STY
          if (mode === 0) return 2;
          ea = this.getEA(mode); this.ld16(this.y); this.write16(ea, this.y);
          return (mode === 3 ? 7 : 6) + this.extra;
        case 0x4e: // LDS
          if (mode === 0) { this.s = this.ld16(this.fetch16()); return 4; }
          ea = this.getEA(mode); this.s = this.ld16(this.read16(ea));
          return (mode === 3 ? 7 : 6) + this.extra;
        case 0x4f: // STS
          if (mode === 0) return 2;
          ea = this.getEA(mode); this.ld16(this.s); this.write16(ea, this.s);
          return (mode === 3 ? 7 : 6) + this.extra;
      }
      return 2;
    }

    page3() {
      const op = this.fetchOp();
      if (op === 0x3f) { // SWI3
        this.cc |= CC_E;
        this.pushAll();
        this.pc = this.read16(0xfff2);
        return 20;
      }
      if (op < 0x80 || (op & 0x40)) return 2;
      const mode = (op >> 4) & 3;
      const fn = op & 0x0f;
      let ea, m, reg;
      if (fn === 0x03) reg = this.u;
      else if (fn === 0x0c) reg = this.s;
      else return 2;
      if (mode === 0) { m = this.fetch16(); this.sub16(reg, m); return 5; }
      ea = this.getEA(mode); m = this.read16(ea); this.sub16(reg, m);
      return (mode === 3 ? 8 : 7) + this.extra;
    }
  }

  root.CC = root.CC || {};
  root.CC.M6809 = M6809;
})(typeof window !== 'undefined' ? window : globalThis);
