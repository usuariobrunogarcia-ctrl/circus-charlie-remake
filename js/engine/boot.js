/*
 * Power on: initialisation done by the original program at 0x6000 (after the
 * RAM/ROM test), the top part of the screen (0x6127) and the "PUSH ENTER" text.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;

  /** Returns a copy of the program ROM with the texts asking for ENTER instead of coins. */
  CC.patchRomForEnter = function (rom) {
    const mem = rom.slice();
    const text = (s) => Array.from(s, (ch) => ch === ' ' ? 0x40 : ch.charCodeAt(0));
    const find = (pat, from) => {
      for (let a = from; a <= mem.length - pat.length; a++) {
        let ok = true;
        for (let i = 0; i < pat.length; i++) if (mem[a + i] !== pat[i]) { ok = false; break; }
        if (ok) return a;
      }
      return -1;
    };
    const free = find(text('FREE PLAY').concat([0x3f]), 0xc000);
    if (free > 0) {
      const rec = free - 3;
      let ptr = -1;
      for (let a = 0x6000; a < 0xffff; a++) if (mem[a] === rec >> 8 && mem[a + 1] === (rec & 0xff)) { ptr = a; break; }
      const space = 0xff44;
      if (ptr > 0) {
        [mem[rec], (mem[rec + 1] + 0x20) & 0xff, mem[rec + 2]].concat(text('PUSH ENTER'), [0x3f]).forEach((v, i) => { mem[space + i] = v; });
        mem[ptr] = space >> 8; mem[ptr + 1] = space & 0xff;
      }
    }
    const pst = find(text('PRESS START BUTTON'), 0xc000);
    if (pst > 0) text('  PUSH ENTER KEY  ').forEach((v, i) => { mem[pst + i] = v; });
    return mem;
  };

  /** Initialises RAM like the original program does after the power on tests. */
  G.boot = function () {
    const m = this.m;
    m.fill(0, 0x2000, 0x4000);
    m[0x2003] = 0;
    for (let a = 0x3000; a < 0x3800; a++) m[a] = 0x10;
    this.out.scroll = 0;
    this.w16(0x2018, 0x2100); this.w16(0x201a, 0x2100);
    for (let a = 0x2100; a < 0x2140; a++) m[a] = 0xff;
    this.w16(0x201c, 0x2140); this.w16(0x201e, 0x2140);
    m[0x202e] = (~this.in.dsw1) & 0xff;
    m[0x202f] = (~this.in.dsw2) & 0xff;
    m[0x2030] = 0;
    let a = (m[0x202e] & 0x0f) << 1;
    m[0x2027] = this.rom8(0xccad + a); m[0x2028] = this.rom8(0xccae + a);
    if (!(m[0x2027] | m[0x2028])) m[0x2040]++;
    a = (m[0x202e] & 0xf0) >> 3;
    m[0x202c] = this.rom8(0xccad + a); m[0x202d] = this.rom8(0xccae + a);
    if (!(m[0x202c] | m[0x202d])) m[0x2040]++;
    m[0x200b] = ((m[0x202f] & 0x08) >> 3) + 2;
    m[0x200c] = m[0x200b] + 5;
    this.out.flip = 0;
    this.queueTask_6114(0x00, 0x0a);
    if (m[0x2040]) this.queueTask_6114(0x00, 0x06);
    m[0x20a6] = 0x01; m[0x20a7] = 0x98; m[0x20a8] = 0x30;
    this.defaultRanking_C652();
    this.drawTop_6127();
    this.out.irqMask = 1;
  };

  // blimp, tent, ferris wheel... (RLE rows from tables 0xD6B8 and 0xD5E5)
  G.drawTop_6127 = function () {
    const m = this.m;
    this.drawTopRows_6155(0x37e0, 0xd6b8);
    let x = 0x33e0;
    for (let r = 0; r < 0x20; r++) { for (let i = 0; i < 5; i++) m[x++] = 0x20; x -= 37; }
    x = 0x31e1;
    for (let r = 0; r < 8; r++) { for (let i = 0; i < 4; i++) m[x++] = 0xa0; x -= 36; }
    this.drawTopRows_6155(0x37e5, 0xd5e5);
  };

  G.drawTopRows_6155 = function (x, table) {
    const m = this.m;
    for (let count = 0x20; count; count--) {
      let u = this.rom16(table + ((count << 1) & 0xff));
      let left = 5;
      while (left) {
        const a = this.rom8(u++);
        if (a === 0x10) {
          let b = this.rom8(u++);
          for (;;) {
            m[x++] = a;
            if (!--left) break;
            b = (b - 1) & 0xff;
            if (!b) break;
          }
        } else { m[x++] = a; left--; }
      }
      x -= 37;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
