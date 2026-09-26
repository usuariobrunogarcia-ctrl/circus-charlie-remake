/*
 * TI SN76489A PSG, modelled after MAME's sn76496 device
 * (feedback mask 0x10000, white noise taps 0x04/0x08, clock divider 8).
 *
 * tick() advances the chip by one "divided clock" (= input clock / 16) and
 * returns the current output level in the range 0..1.
 */
(function (root) {
  'use strict';

  const FEEDBACK = 0x10000, TAP1 = 0x04, TAP2 = 0x08;

  const VOL = new Float32Array(16);
  (function () {
    let out = 0.25;
    for (let i = 0; i < 15; i++) { VOL[i] = out; out /= 1.258925412; }
    VOL[15] = 0;
  })();

  class SN76489A {
    constructor() { this.reset(); }

    reset() {
      this.reg = new Int32Array(8);
      this.lastReg = 0;
      this.period = new Int32Array([0x400, 0x400, 0x400, 0]);
      this.count = new Int32Array(4);
      this.output = new Int32Array(4);
      this.volume = new Float32Array(4);
      for (let i = 0; i < 8; i += 2) { this.reg[i] = 0; this.reg[i + 1] = 0; }
      for (let i = 0; i < 4; i++) this.volume[i] = VOL[this.reg[i * 2 + 1]];
      this.rng = FEEDBACK;
      this.output[3] = this.rng & 1;
    }

    write(data) {
      let r;
      if (data & 0x80) {
        r = (data & 0x70) >> 4;
        this.lastReg = r;
        this.reg[r] = (this.reg[r] & 0x3f0) | (data & 0x0f);
      } else {
        r = this.lastReg;
      }
      const c = r >> 1;
      switch (r) {
        case 0: case 2: case 4:
          if ((data & 0x80) === 0) this.reg[r] = (this.reg[r] & 0x0f) | ((data & 0x3f) << 4);
          this.period[c] = this.reg[r] !== 0 ? this.reg[r] : 0x400;
          if (r === 4 && (this.reg[6] & 3) === 3) this.period[3] = this.period[2] << 1;
          break;
        case 1: case 3: case 5: case 7:
          this.volume[c] = VOL[data & 0x0f];
          if ((data & 0x80) === 0) this.reg[r] = (this.reg[r] & 0x3f0) | (data & 0x0f);
          break;
        case 6: {
          if ((data & 0x80) === 0) this.reg[r] = (this.reg[r] & 0x3f0) | (data & 0x0f);
          const n = this.reg[6];
          this.period[3] = ((n & 3) === 3) ? (this.period[2] << 1) : (1 << (5 + (n & 3)));
          this.rng = FEEDBACK;
          break;
        }
      }
    }

    tick() {
      const count = this.count, output = this.output, period = this.period;
      for (let i = 0; i < 3; i++) {
        if (--count[i] <= 0) {
          output[i] ^= 1;
          count[i] = period[i];
        }
      }
      if (--count[3] <= 0) {
        const t1 = (this.rng & TAP1) !== 0;
        const t2 = ((this.rng & TAP2) !== 0) && ((this.reg[6] & 4) !== 0);
        if (t1 !== t2) {
          this.rng = (this.rng >> 1) | FEEDBACK;
        } else {
          this.rng >>= 1;
        }
        output[3] = this.rng & 1;
        count[3] = period[3];
      }
      const v = this.volume;
      return (output[0] ? v[0] : 0) + (output[1] ? v[1] : 0) + (output[2] ? v[2] : 0) + (output[3] ? v[3] : 0);
    }
  }

  root.CC = root.CC || {};
  root.CC.SN76489A = SN76489A;
})(typeof window !== 'undefined' ? window : globalThis);
