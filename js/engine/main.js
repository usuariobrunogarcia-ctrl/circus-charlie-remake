/*
 * Frame handler, task queue, text printing, score and lives display,
 * title screen.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;

  // 6809 DAA after an 8 bit addition (a + b + carry). Returns (carry << 8) | result.
  function bcdAdd(a, b, c) {
    const r = a + b + c;
    const h = (a ^ b ^ r) & 0x10;
    let cf = 0;
    const res = r & 0xff, carry = r > 0xff;
    const msn = res & 0xf0, lsn = res & 0x0f;
    if (lsn > 9 || h) cf |= 0x06;
    if (msn > 0x80 && lsn > 9) cf |= 0x60;
    if (msn > 0x90 || carry) cf |= 0x60;
    const t = cf + res;
    return ((carry || (t & 0x100)) ? 0x100 : 0) | (t & 0xff);
  }
  CC.bcdAdd = bcdAdd;

  // ------------------------------------------------------------ frame
  /** One video frame: the vblank interrupt handler (0x6414) and the queued tasks. */
  G.tick = function () {
    const m = this.m;
    this.out.irqMask = 0;
    m[0x2014] = (m[0x2014] + 1) & 0xff;           // frame counter
    this.out.spriteBank = m[0x2014] & 1;          // double buffered sprite RAM
    this.irqInputs_642D();
    this.buildSpriteList_658E();
    this.out.irqMask = 1;
    this.runTasks_60ED();
    this.frames++;
  };

  // inputs, start button in free play, sound queue, game mode dispatch
  G.irqInputs_642D = function () {
    const m = this.m;
    this.out.scroll = m[0x203a];                  // scroll register gets last frame's camera
    m[0x203a] = m[0x2204];
    this.out.flip = m[0x2008] & 1;
    m[0x2038] = m[0x2037];
    m[0x2037] = m[0x2034];
    m[0x2034] = m[0x2031];
    m[0x2035] = m[0x2032];
    m[0x2036] = m[0x2033];
    m[0x2031] = (~this.in.system) & 0xff;         // inputs are active low
    m[0x2032] = (~this.in.p1) & 0xff;
    m[0x2033] = (~this.in.p2) & 0xff;
    if (m[0x2003] !== 3) {
      if (m[0x2040]) {
        // free play: a start button begins a game
        if (!m[0x2022] && (m[0x2031] & 0x18)) {
          m[0x2022]++;
          m[0x2003] = 1;
          m[0x2250] = (m[0x2031] & 0x08) ? 0 : 1;   // START1 = one player
          this.startGame_6A14();
        }
      } else {
        this.todo(0x6492);                        // coin handling (the port always runs in free play)
      }
    }
    // one sound command per frame
    let x = this.r16(0x201e);
    if (x !== this.r16(0x201c)) {
      this.soundCommands.push(m[x]);
      x++;
      if (x > 0x215f) x = 0x2140;
      this.w16(0x201e, x);
    }
    switch (m[0x2003]) {
      case 0: this.modeAttract_65CA(); break;
      case 1: this.modeStart_6939(); break;
      case 2: this.modeGame_6C0E(); break;
      case 3: this.todo(0xc91e); break;          // service mode
      default: this.todo(0x6586);
    }
  };

  // copies the 64 object records (0x2400-0x27FF) to the sprite RAM bank being built
  G.buildSpriteList_658E = function () {
    const m = this.m;
    let x = (m[0x2014] & 1) ? 0x3800 : 0x3900;
    const reverse = m[0x28df] !== 0;
    let u = reverse ? 0x27b0 : 0x2400;
    for (;;) {
      m[x] = m[u + 14];
      m[x + 1] = m[u + 15];
      m[x + 2] = m[u + 4];
      m[x + 3] = (-((m[u + 6] + 0x10) & 0xff)) & 0xff;
      x += 4;
      if (!reverse) { u += 16; if (u >= 0x2800) break; } else { u -= 16; if (u < 0x2400) break; }
    }
  };

  // ------------------------------------------------------------ tasks
  /** Adds a task to the queue processed by the main loop (A = task, B = parameter). */
  G.queueTask_6114 = function (a, b) {
    let x = this.r16(0x2018);
    this.m[x] = a & 0xff; this.m[x + 1] = b & 0xff;
    x += 2;
    if (x >= 0x2140) x = 0x2100;
    this.w16(0x2018, x);
  };

  G.runTasks_60ED = function () {
    const m = this.m;
    let limit = this.maxTasks === undefined ? 64 : this.maxTasks;
    for (let guard = 0; guard < limit; guard++) {
      let x = this.r16(0x201a);
      const a = m[x], b = m[x + 1];
      if (a & 0x80) return;                       // 0xFF = empty slot
      m[x] = 0xff; m[x + 1] = 0xff;
      x += 2;
      if (x > 0x213f) x = 0x2100;
      this.w16(0x201a, x);
      switch (a & 0x7f) {
        case 0: this.printString_61C2(b); break;
        case 1: this.drawCredits_6234(); break;
        case 2: this.addScore_6253(b); break;
        case 3: this.drawLives_6325(); break;
        case 4: this.drawRanking_635A(); break;
        case 5: this.drawRoundText_63D5(); break;
        case 6: break;
        default: this.todo(0x6112);
      }
    }
  };

  /** Prints (or erases when bit 7 is set) one of the texts of the string table at 0xCCDB. */
  G.printString_61C2 = function (n) {
    const m = this.m;
    const erase = (n & 0x80) !== 0;
    let u = this.rom16(0xccdb + ((n << 1) & 0xff));
    for (;;) {
      let x = this.rom16(u); u += 2;
      const color = this.rom8(u++);
      for (;;) {
        const ch = this.rom8(u++);
        if (ch === 0x3f) return;                  // '?' ends the text
        if (ch === 0x2f) break;                   // '/' starts a new line (address + colour)
        m[x] = erase ? 0x10 : (ch - 0x30) & 0xff;
        m[x - 0x400] = color;
        x -= 32;
      }
    }
  };

  G.drawCredits_6234 = function () {
    const m = this.m;
    const c = m[0x2002];
    m[0x3488 - 0x400] = 0x10; m[0x3488] = c >> 4;
    m[0x3468 - 0x400] = 0x10; m[0x3468] = c & 0x0f;
  };

  /** Adds points (table 0xD222, entry B) to the current player and handles extra lives / high score. */
  G.addScore_6253 = function (b) {
    const m = this.m;
    if (!m[0x2022]) return;                       // no score during the demo
    let y = this.rom16(0xd222 + ((b << 1) & 0xff));
    let x = 0x20a3 + (m[0x2021] ? 3 : 0);
    let r = bcdAdd(m[x - 1], this.rom8(y - 1), 0); m[x - 1] = r & 0xff;
    r = bcdAdd(m[x - 2], this.rom8(y - 2), r >> 8); m[x - 2] = r & 0xff;
    r = bcdAdd(m[x - 3], this.rom8(y - 3), r >> 8); m[x - 3] = r & 0xff;
    x -= 3;
    if (r & 0x100) {
      m[x] = 0x99; m[x + 1] = 0x99; m[x + 2] = 0x90;
    } else if ((r & 0xff) >= m[0x2202]) {
      // extra life
      m[0x2202] = bcdAdd(m[0x2202], m[0x200c], 0) & 0xff;
      this.sound_BBE9();
      m[0x2200] = (m[0x2200] + 1) & 0xff;
      if (m[0x2200] <= 5) this.drawLifeIcons_6341(m[0x2200]);
    }
    // high score
    const s = (m[x] << 8) | m[x + 1], hi = (m[0x20a6] << 8) | m[0x20a7];
    if (s > hi || (s === hi && m[x + 2] > m[0x20a8])) {
      m[0x20a6] = m[x]; m[0x20a7] = m[x + 1]; m[0x20a8] = m[x + 2];
      this.drawScore_62D9(0x20a6, 0x3647);
    }
    if (m[0x2021]) this.drawScore_62D9(0x20a3, 0x3566);
    else this.drawScore_62D9(0x20a0, 0x3746);
  };

  /** Draws a 6 digit BCD score (the last digit is a fixed '0' on screen) with leading blanks. Returns next VRAM address. */
  G.drawScore_62D9 = function (u, x) {
    const m = this.m;
    const put = (v) => { m[x] = v; x -= 32; };
    const b0 = m[u], b1 = m[u + 1], b2 = m[u + 2];
    if (!b0) { put(0x10); put(0x10); }
    else { put((b0 >> 4) || 0x10); put(b0 & 0x0f); }
    if (!(b0 | b1)) { put(0x10); put(0x10); }
    else { put(((b1 >> 4) === 0 && b0 === 0) ? 0x10 : (b1 >> 4)); put(b1 & 0x0f); }
    put(b2 >> 4);
    return x;
  };

  G.drawLives_6325 = function () {
    const m = this.m;
    let x = 0x3787;
    for (let i = 0; i < 8; i++) { m[x] = 0x10; m[x + 1] = 0x10; x -= 32; }
    let n = m[0x2200];
    if (!n) return;
    if (n > 5) n = 5;
    this.drawLifeIcons_6341(n);
  };

  // draws n-1 "Charlie" icons (2x2 tiles each)
  G.drawLifeIcons_6341 = function (n) {
    const m = this.m;
    let x = 0x3787;
    m[0x2fff] = n; // original keeps the counter in a stack temporary
    for (;;) {
      n = (n - 1) & 0xff;
      if (!n) return;
      m[x] = 0xf4; m[x + 1] = 0xf5;
      m[x - 32] = 0xf6; m[x - 31] = 0xf7;
      x -= 64;
    }
  };

  // "SCORE RANKING" table
  G.drawRanking_635A = function () {
    const m = this.m;
    this.printString_61C2(0x11);
    this.printString_61C2(0x1d);
    this.printString_61C2(0x89);
    m[0x2070] = 7;
    m[0x2071] = 0;
    do {
      const idx = m[0x2071];
      const y = 0xd29c + ((idx << 2) & 0xff);
      let u = this.rom16(y);
      let x = this.rom16(y + 2);
      x = this.drawScore_62D9(u, x);
      m[x] = 0;
      u += 3;
      x = (x + 0xe0 + 0x120) & 0xffff;
      for (let i = 0; i < 3; i++) { m[x] = (m[u++] - 0x30) & 0xff; x -= 32; }
      x -= 128;
      m[x] = m[u] >> 4;
      x -= 32;
      m[x] = m[u] & 0x0f;
      const color = this.rom8(0xd2b8 + idx);
      let yc = 0x32ce + ((idx << 1) & 0xff);
      for (let i = 0; i < 20; i++) { m[yc] = color; yc -= 32; }
      m[0x2071]++;
      m[0x2070]--;
    } while (m[0x2070]);
  };

  G.drawRoundText_63D5 = function () {
    const m = this.m;
    this.printString_61C2(0x15);
    const a = (m[0x2201] + 1) & 0xff;
    m[0x3462 - 0x400] = 4; m[0x3462] = a >> 4;
    m[0x3442 - 0x400] = 4; m[0x3442] = m[0x2201] & 0x0f;
  };

  // ------------------------------------------------------------ attract mode
  G.modeAttract_65CA = function () {
    switch (this.m[0x2004]) {
      case 0: case 2: case 4: case 6: this.clearScreen_699B(); break;
      case 1: this.titleScreen_65D5(); break;
      case 3: this.attractWait_683F(); break;
      case 5: this.attractDemo_685A(); break;
      default: this.todo(0x65ca);
    }
  };

  G.titleScreen_65D5 = function () {
    const m = this.m;
    if (m[0x2005] > 1) { this.titleStars_66F2(); return; }
    this.queueTask_6114(0x00, 0x1d);
    this.queueTask_6114(0x00, 0x24);
    // "CIRCUS CHARLIE" logo: 4 rows of 16 tiles (0x180-0x1BF)
    let x = 0x370b, code = 0x7f;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 16; i++) {
        code = (code + 1) & 0xff;
        m[x] = code; m[x - 0x400] = 0x20; x -= 32;
      }
      x += 0x201;
    }
    let u = 0xd2fb;
    x = 0x36cf;
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 0x12; i++) { m[x] = this.rom8(u++); m[x - 0x400] = 0x20; x -= 32; }
      x += 0x241;
    }
    x = 0x3653;
    m[x] = 0xce; m[x - 32] = 0xcf; m[x - 0xa0] = 0xce; m[x - 0xc0] = 0xcf;
    m[x - 0x400] = 0x20; m[x - 0x420] = 0x20; m[x - 0x4a0] = 0x20; m[x - 0x4c0] = 0x20;
    // star field: 64 objects flying out of the centre
    u = 0xf188;
    x = 0x27f0;
    m[x + 8] = 0;
    let s3 = 0x40, s2 = 0x97, s1 = 0x40;
    do {
      m[x] = (s3 & 3) + 1;
      s1 = (s1 + 0xd5) & 0xff;
      s2 = (s2 ^ s1) & 0xff;
      let d = s2 * 0x5a;
      let a = d >> 8, b = d & 0xff;
      let s4 = b;
      if (b & 0x40) a = ((-a) + 0x5a) & 0xff;
      m[x + 1] = this.rom8(u + ((a << 24) >> 24));
      a = ((-a) + 0x5a) & 0xff;
      a = this.rom8(u + ((a << 24) >> 24));
      d = a * m[x];
      m[x + 2] = d >> 8; m[x + 3] = d & 0xff;
      d = m[x] * m[x + 1];
      m[x] = d >> 8; m[x + 1] = d & 0xff;
      if (((s4 + 0x40) & 0xff) & 0x80) {
        const v = (-((m[x + 2] << 8) | m[x + 3])) & 0xffff;
        m[x + 2] = v >> 8; m[x + 3] = v & 0xff;
      }
      if (s4 & 0x80) {
        const v = (-((m[x] << 8) | m[x + 1])) & 0xffff;
        m[x] = v >> 8; m[x + 1] = v & 0xff;
      }
      const n = s3 & 3;
      m[x + 14] = 0x87;
      m[x + 15] = ((n & 2) << 6) | ((n & 1) << 6);
      m[x + 4] = 0x64; m[x + 6] = 0x78;
      x -= 16;
      s3--;
    } while (s3);
    m[0x2ffd] = s3; m[0x2ffe] = s2; m[0x2fff] = s1;
    // top 5 hardware columns in front of the sprites
    for (let a = 0x3000; a < 0x3400; a += 32) for (let i = 0; i < 5; i++) m[a + i] &= 0xef;
    m[0x2005]++;
    m[0x200a] = 0;
  };

  G.titleStars_66F2 = function () {
    const m = this.m;
    m[0x200a] = (m[0x200a] - 1) & 0xff;
    if (!m[0x200a]) { m[0x2004]++; m[0x2005] = 0; return; }
    this.checkStart_6743();
    for (let x = 0x27f0; x >= 0x2400; x -= 16) {
      let d = ((m[x] << 8) | m[x + 1]) + ((m[x + 4] << 8) | m[x + 5]);
      m[x + 4] = (d >> 8) & 0xff; m[x + 5] = d & 0xff;
      let reset = ((d >> 8) & 0xff) < 0x10;
      if (!reset) {
        d = ((m[x + 2] << 8) | m[x + 3]) + ((m[x + 6] << 8) | m[x + 7]);
        m[x + 6] = (d >> 8) & 0xff; m[x + 7] = d & 0xff;
        reset = ((d >> 8) & 0xff) >= 0xf0;
      }
      if (reset) { m[x + 4] = 0x64; m[x + 6] = 0x78; }
    }
    let a = m[0x27ff + 8] + 1;
    if (a >= 5) a = 0;
    m[0x27ff + 8] = a;
    const color = this.rom8(0xff23 + a);
    m[0x2fff] = color;
    for (let x = 0x27ff, i = 0; i < 64; i++, x -= 16) m[x] = (m[x] & 0xc0) | color;
  };

  G.checkStart_6743 = function () {
    if ((this.in.system & 0x18) === 0) this.todo(0x674a);   // both start buttons held
  };

  G.attractWait_683F = function () {
    const m = this.m;
    if (m[0x2005] <= 1) {
      m[0x2005]++;
      m[0x200a] = 0x80;
      this.queueTask_6114(0x04, 0x00);
      return;
    }
    m[0x200a]--;
    if (!m[0x200a]) { m[0x2004]++; m[0x2005] = 0; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
