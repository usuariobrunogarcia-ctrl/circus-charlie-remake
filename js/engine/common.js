/*
 * Common routines: screen wipe, colour blinking, sound requests, bonus timer,
 * background animations, stage select screen, stage clear bonus, high score
 * table and name entry, play time counter, boot helpers.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;

  // ------------------------------------------------------------ screen wipe
  /** "Curtain" wipe: moves the two halves of the playfield apart, one tile per frame. */
  G.clearScreenStep_BA63 = function () {
    const m = this.m;
    if (m[0x2009] === 0x17) {
      for (let x = 0x2800; x < 0x2900; x++) m[x] = 0;
      for (let x = 0x2400; x < 0x2800; x++) m[x] = 0;
      m[0x2009]--;
      return;
    }
    let stepOdd = 0xcc2a, stepEven = 0xcc16;
    let b = m[0x203a];
    if (m[0x2008]) {
      stepOdd = (((~0xcc) & 0xff) << 8) | 0xea;
      stepEven = (((~0xcc) & 0xff) << 8) | 0xd6;
      b = (-b) & 0xff;
    }
    let u = (((b & 0xf8) << 2) + 0x3414) & 0xffff;
    if (m[0x2009] & 1) {
      let x = u + 1;
      for (let n = 0; n < 32; n++) {
        for (let i = 0; i < 10; i++) {
          u--; x--;
          m[x] = m[u];
          m[x - 0x400] = m[u - 0x400];
        }
        m[u] = 0x10; m[u - 0x400] = 0x10;
        let d = (u + stepOdd) & 0xffff;
        d = ((((d >> 8) & 3) + 0x34) << 8) | (d & 0xff);
        u = d; x = u + 1;
      }
      m[0x2009]--;
      if (!m[0x2009]) {
        m[0x203a] = 0; m[0x2204] = 0; m[0x2205] = 0; m[0x2284] = 0; m[0x2285] = 0; m[0x2304] = 0;
      }
      return;
    }
    u += 2;
    let x = u - 1;
    for (let n = 0; n < 32; n++) {
      for (let i = 0; i < 10; i++) {
        m[x - 0x400] = m[u - 0x400];
        m[x] = m[u];
        u++; x++;
      }
      m[x] = 0x10; m[x - 0x400] = 0x10;
      let d = (u + stepEven) & 0xffff;
      d = ((((d >> 8) & 3) + 0x34) << 8) | (d & 0xff);
      u = d; x = u - 1;
    }
    m[0x2009]--;
  };

  // ------------------------------------------------------------ colour blink
  G.blinkStart_BB28 = function () {
    this.m[0x287f] = 1;
    this.m[0x287e] = 1;
    this.blinkSet_BB31(0);
  };

  G.blinkSet_BB31 = function (a) {
    const m = this.m;
    m[0x287d] = a;
    const color = this.rom8(0xd625 + s8(a));
    let x = m[0x2201] === 5 ? 0x3018 : 0x300d;
    for (; x < 0x3400; x += 32) { m[x - 1] = color; m[x] = color; m[x + 1] = color; }
  };

  G.blinkStep_BB54 = function () {
    const m = this.m;
    const a = m[0x287f];
    if (!a) return;
    m[0x287e] = (m[0x287e] - 1) & 0xff;
    if (m[0x287e]) return;
    m[0x287e] = a;
    this.blinkSet_BB31((m[0x287d] + 1) & 3);
    if (m[0x287d]) return;
    let n = m[0x287f] + 1;
    if (n === 6) n = 0;
    m[0x287f] = n;
  };

  // ------------------------------------------------------------ sound requests
  /** Queues a sound command (music is muted in the demo, like on the arcade). */
  G.sound_BB7B = function (a) {
    const m = this.m;
    if (m[0x2003] !== 3 && !m[0x2022]) {
      if (!(m[0x202f] & 0x80)) return;           // demo sounds off
      if (a < 0x40) return;                      // only effects in the demo
    }
    this.soundQueue_BB8E(a);
  };

  G.soundQueue_BB8E = function (a) {
    let x = this.r16(0x201c);
    this.m[x] = a;
    x++;
    if (x >= 0x2160) x = 0x2140;
    this.w16(0x201c, x);
  };

  G.soundStop_BBA1 = function () { this.soundQueue_BB8E(0x00); };
  G.sound_BBA8 = function () { this.sound_BB7B(0x42); };
  G.sound_BBAC = function () { this.sound_BB7B(0x43); };
  G.sound_BBB0 = function () { this.sound_BB7B(0x44); };
  G.sound_BBB4 = function () { this.sound_BB7B(0x45); };
  G.sound_BBBC = function () { this.sound_BB7B(0x47); };
  G.sound_BBC0 = function () { this.sound_BB7B(0x48); };
  G.sound_BBC4 = function () { this.sound_BB7B(0x49); };
  G.sound_BBC8 = function () { this.sound_BB7B(0x4a); };
  G.sound_BBCC = function () { this.sound_BB7B(0x4b); };
  G.sound_BBD0 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x4c); this.sound_BB7B(0x4d); };
  G.sound_BBE1 = function () { this.sound_BB7B(0x4f); };
  G.sound_BBE5 = function () { this.sound_BB7B(0x50); };
  G.sound_BBE9 = function () { this.sound_BB7B(0x51); };
  G.sound_BBED = function () { this.sound_BB7B(0x52); };
  G.music_BBF1 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x13); };
  G.music_BBF8 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x14); };
  G.music_BC01 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x15); };
  G.music_BC0A = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x16); };
  G.music_BC13 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x4f); this.sound_BB7B(0x17); };
  G.music_BC35 = function () { this.sound_BB7B(0x1c); };
  G.music_BC3A = function () { this.sound_BB7B(0x1d); };
  G.music_BC3F = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x80); };
  G.music_BC48 = function () { this.sound_BB7B(0x00); this.sound_BB7B(0x81); };
  G.previewInit2_BC3A = G.music_BC3A;

  // ------------------------------------------------------------ bonus timer
  /** Initialises the BONUS countdown (4 BCD digits at 0x227C) for the stage. */
  G.bonusInit_BC5A = function () {
    const m = this.m;
    m[0x2276] = 0;
    const st = m[0x2201];
    const x = (st === 0 || st >= 4) ? this.bonusValueA_BDFA() : this.bonusValueB_BE51();
    if (!m[0x2258]) m[0x2258]++;
    let y = 0x227c;
    for (let i = 0; i < 2; i++) {
      const v = this.rom8(x + i);
      m[y++] = v >> 4;
      m[y++] = v & 0x0f;
    }
    for (let i = 0, a = 0x3363; i < 4; i++, a -= 32) m[a] = 0x11;
    m[0x2263] = 0x40;
  };

  G.bonusTable_BE7B = function () { return 0xfbf0 + ((this.m[0x2201] << 1) & 0xff); };

  G.bonusValueA_BDFA = function () {
    const m = this.m;
    const y = this.bonusTable_BE7B();
    let b = m[0x2203];
    if (m[0x2201] === 4) b = (s8(b) >> 1) & 0xff;
    if (m[0x2201] === 0) {
      if (b === 0) return m[0x2258] ? 0xfc02 : y;
      if (b < 2) return 0xfc02;
      if (b < 4) return 0xfc04;
      return 0xfc06;
    }
    if (b === 0) return m[0x2258] ? 0xfbfc : y;
    if (b < 2) return 0xfbfc;
    if (b < 4) return 0xfbfe;
    return 0xfc00;
  };

  G.bonusValueB_BE51 = function () {
    const m = this.m;
    const y = this.bonusTable_BE7B();
    const b = m[0x2203];
    if (b === 0) return m[0x2258] ? 0xfc08 : y;
    if (b < 0xfc) return 0xfc0c;
    if (b < 0xfe) return 0xfc0a;
    return 0xfc08;
  };

  /** Called every frame while playing: counts the BONUS down and kills Charlie when it runs out. */
  G.bonusTick_BCA8 = function () {
    const m = this.m;
    if (((m[0x227c] << 8) | m[0x227d]) < 0x0005) {
      if (((m[0x227d] << 8) | m[0x227e]) >= 0x0409 && m[0x227f] >= 9) {
        this.bonusLowHook_BCC1();
      }
      this.fillColumn_C628((m[0x2264] & 0x10) ? 0x11 : 0x07, 0x3363, 4);
    }
    m[0x2264] = (m[0x2264] + 1) & 0xff;
    const st = m[0x2201];
    const u = 0xfc0e + s8(st);
    if (m[0x2276]) { m[0x2276]--; return; }
    let lbl = 0xbd21;
    if (st === 3) {
      if (m[0x28d4] === 0x20) { this.bonusDecrement_BD63(); this.bonusDecrement_BD63(); m[0x2276] = 0; lbl = 0xbd26; }
      else if (m[0x28d4] === 0x15) { this.bonusDecrement_BD63(); m[0x2276] = 0; lbl = 0xbd26; }
      else if (m[0x28d4] === 0x10) { m[0x2276] = 0; lbl = 0xbd26; }
    }
    if (lbl === 0xbd21) m[0x2276] = this.rom8(u);
    if ((st === 1 || st === 2 || st === 3) && m[0x2402] === 4) return;
    // draw the 4 digits
    for (let i = 0, x = 0x3763; i < 4; i++, x -= 32) m[x] = m[0x227c + i];
    if (this.bonusNonZero_BDE9() === 1) { this.bonusDecrement_BD63(); return; }
    this.bonusOut_BDA2();
  };

  // BONUS at 0499: "hurry up" music of the stage (JSR [FBE4 + 2*stage])
  G.bonusLowHook_BCC1 = function () {
    this.sound_BB7B([0x18, 0x19, 0x1a, 0x19, 0x18, 0x1b][this.m[0x2201]]);
  };

  G.bonusDecrement_BD63 = function () {
    const m = this.m;
    let x = 0x2280;
    x--;
    let a = (m[x] - 1) & 0xff;
    if (a === 0) {
      m[x] = 0;
      if (this.bonusNonZero_BDE9() === 1) return;
      this.bonusOut_BDA2();
      return;
    }
    if (a !== 0xff) { m[x] = a; return; }
    for (let i = 0; i < 3; i++) {
      m[x] = 9;
      x--;
      a = (m[x] - 1) & 0xff;
      if (a !== 0xff) { m[x] = a; return; }
    }
  };

  G.bonusNonZero_BDE9 = function () {
    const m = this.m;
    if (m[0x227c] | m[0x227d]) return 1;
    if (m[0x227e] | m[0x227f]) return 1;
    return 0;
  };

  // the BONUS reached zero: after a short delay Charlie loses a life
  G.bonusOut_BDA2 = function () {
    const m = this.m;
    const st = m[0x2201];
    if (!m[0x2263]) {
      if (st >= 4 || st === 0) this.bonusKill_BDC9(2);
      return;
    }
    const a = m[0x2263];
    m[0x2263]--;
    if (a !== 2) return;
    if (st >= 4 || st === 0) { this.music_BC13(); this.bonusKill_BDC9(1); return; }
    if (st === 2) m[0x240a] = 0;
    this.bonusKill_BDC9(7);
  };

  G.bonusKill_BDC9 = function (a) {
    const x = this.rom16(0xfbd8 + ((this.m[0x2201] << 1) & 0xff));
    this.m[x] = a;
  };

  // ------------------------------------------------------------ background
  /** Animated scenery: blimp, flags and the audience colours. */
  G.backgroundAnim_BE86 = function () {
    const m = this.m;
    if (!m[0x225a]) { m[0x225a] = 0x30; m[0x225b]++; this.animBlimp_BEC2(); }
    else m[0x225a]--;
    if (!m[0x225c]) { m[0x225c] = 0x20; m[0x225d]++; this.animFlags_BEFB(); }
    else m[0x225c]--;
    if (!m[0x225e]) { m[0x225e] = 0x10; this.animAudience_BF3B(); }
    else m[0x225e]--;
  };

  G.animBlimp_BEC2 = function () {
    const u = (this.m[0x225b] & 1) ? 0xfc14 : 0xfc30;
    this.m[0x2259] = 4;
    this.drawTileRows_BEE0(u, 0x34e1, 0x30);
  };

  // rows of tiles terminated by 0xFF, $2259 rows
  G.drawTileRows_BEE0 = function (u, x, color) {
    const m = this.m;
    for (;;) {
      const a = this.rom8(u++);
      if (a !== 0xff) { m[x] = a; m[x - 0x400] = color; x -= 32; continue; }
      x = (x + 0xc1) & 0xffff;
      m[0x2259]--;
      if (!m[0x2259]) return;
    }
  };

  G.animFlags_BEFB = function () {
    const m = this.m;
    const st = m[0x2201];
    const color = (st === 1 || st === 5) ? 0x38 : 0x30;
    let u;
    if (m[0x225d] & 1) u = 0xfc4f;
    else if (m[0x225d] & 2) u = 0xfc4c;
    else u = 0xfc52;
    m[0x2259] = 1;
    this.drawTileRows_BEE0(u, 0x35e0, color);
  };

  G.animAudience_BF3B = function () {
    const m = this.m;
    const saved = this.r16(0x2900);
    let a = m[0x225f];
    if (a === 3) m[0x225f] = 0; else m[0x225f]++;
    a |= 0x10;
    const column = (y, end) => { this.w16(0x2900, end); for (; y !== end; y -= 32) m[y] = a; };
    column(0x33a5, 0x3025);
    column(0x3389, 0x3049);
    for (let y = 0x33a6; y !== 0x33aa; y++) m[y] = a;
    for (let y = 0x3046; y !== 0x304a; y++) m[y] = a;
    this.w16(0x2900, saved);
  };

  // ------------------------------------------------------------ stage select
  /** Static part of the "CHOOSE THE SCREEN" menu. */
  G.previewInit_BF93 = function () {
    const m = this.m;
    let a = 0;
    do {
      m[0x2259] = 6;
      const a2 = (a << 1) & 0xff;
      let x = this.rom16(0xfc79 + s8(a2));
      let y = this.rom16((0xfd3c + s8(a2)) & 0xffff);
      a = ((s8(a2) >> 1) + 1) & 0xff;
      m[x] = a;
      do {
        x -= 32;
        m[x] = this.rom8(y++);
        m[x - 0x400] = this.rom8(y++);
        m[0x2259]--;
      } while (m[0x2259]);
    } while (a !== 6);
    for (let i = 0; i < 6; i++) {
      if (m[0x220e + i] > 4) {
        let u = this.rom16(0xfc79 + ((i << 1) & 0xff));
        m[0x2259] = 8;
        let x = 0xfd33;
        do {
          m[u] = (this.rom8(x++) - 0x30) & 0xff;
          m[u - 0x400] = 0x10;
          u -= 32;
          m[0x2259]--;
        } while (m[0x2259]);
      }
    }
    this.queueTask_6114(0x00, 0x21);
    this.drawPairs_C059(0x37ac, 0xfc9c);
    this.drawPairs_C059(0x37b5, 0xfcb7);
    this.drawPairs_C059(0x37bf, 0xfccf);
    this.drawRowPairs_C081(0x37ac, 0xfce7);
    this.drawRowPairs_C081(0x368c, 0xfcf9);
    this.drawRowPairs_C081(0x354c, 0xfcf9);
    this.drawRowPairs_C081(0x344c, 0xfd0b);
    m[0x3395] = 0x20; m[0x3295] = 0x20; m[0x3155] = 0x20; m[0x3075] = 0x20;
  };

  G.drawPairs_C059 = function (y, x) {
    const m = this.m;
    for (;;) {
      m[0x2259] = this.rom8(x++);
      const a = this.rom8(x), b = this.rom8(x + 1);
      x += 2;
      if (a === 0xff) return;
      if (b === 0xfe) { m[y] = a; y -= 32; continue; }
      do {
        m[y] = a; y -= 32;
        m[y] = b; y -= 32;
        m[0x2259]--;
      } while (m[0x2259]);
    }
  };

  G.drawRowPairs_C081 = function (y, x) {
    const m = this.m;
    for (;;) {
      m[0x2259] = this.rom8(x++);
      const a = this.rom8(x), b = this.rom8(x + 1);
      x += 2;
      if (a === 0xff) return;
      if (a === 0x10) { y++; continue; }
      do {
        m[y++] = a; m[y++] = b;
        m[0x2259]--;
      } while (m[0x2259]);
    }
  };

  /** Stage select menu, every frame. */
  G.preview_C0A0 = function () {
    const m = this.m;
    this.fillColumn_C334(0x3673, 0xff, 9);
    this.drawColumns_C346(0x3512, 0xfd1d);
    this.fillColumn_C334(0x3537, 0xc0, 7);
    this.objCodes_C31C(0xfc85, 7, 0x2400);
    for (let u = 0x240f, i = 0; i < 0x30; i++, u += 16) m[u] = 0;
    const grid = (ay, ax, u, n) => {
      m[0x20f7] = 0; m[0x2259] = n; this.objRowsY_C2C3(ay, u);
      m[0x20f7] = 0; m[0x2259] = n; this.objRowsX_C2E3(ax, u);
    };
    grid(0x20, 0x88, 0x2400, 3);
    grid(0x80, 0x78, 0x2460, 2);
    grid(0x28, 0xd8, 0x24a0, 2);
    grid(0x68, 0xd8, 0x24e0, 3);
    m[0x2259] = 8;
    let a = 0xb6, b = 0xd4;
    for (let u = 0x2550; m[0x2259]; u += 16) {
      m[u + 4] = a; m[u + 6] = b;
      a = (a + 4) & 0xff; b = (b - 4) & 0xff;
      m[0x2259]--;
    }
    for (let u = 0x2460, i = 0; i < 4; i++, u += 16) m[u + 15] = 6;
    for (let y = 0x2550, i = 0; i < 7; i++, y += 16) m[y + 15] = 1;
    m[0x2254] = m[0x2256];
    m[0x2259] = 0;
    this.stageChoice_C2FB(m[0x2256], 0xc1a0);
    // joystick edge: left / right
    const x = 0x2032 + s8(m[0x2008]);
    let e = ((~m[x]) & 0xff) | m[x + 3];
    e &= 3;
    if (e !== 3) {
      this.sound_BBED();
      m[0x2259] = 0;
      if (e === 2) this.stageChoice_C2FB(m[0x2256] === 0 ? 5 : m[0x2256] - 1, 0xc1d7);
      else this.stageChoice_C2FB(m[0x2256] === 5 ? 0 : m[0x2256] + 1, 0xc1f6);
    }
    // button edge: choose
    const bt = (((~m[x]) & 0xff) | m[x + 3]) & 0x10;
    if (!bt) { this.sound_BBD0(); this.previewEnd_C213(); return; }
    this.previewCursor_C22F();
  };

  G.previewEnd_C213 = function () {
    const m = this.m;
    const a = m[0x2256];
    if (m[0x2251] && m[0x2255]) m[0x2301] = a; else m[0x2281] = a;
    m[0x2201] = a;
    m[0x2255]++;
  };

  G.previewCursor_C22F = function () {
    const m = this.m;
    const u = 0x2600;
    const st = m[0x2256];
    const a2 = (st << 1) & 0xff;
    m[0x2259] = a2;
    const y = 0xfc6d + s8(a2);
    let x = 0xfc55 + s8((a2 << 1) & 0xff);
    let a = this.rom8(y), b = this.rom8(y + 1);
    m[u + 4] = a; m[u + 20] = a; m[u + 6] = b; m[u + 38] = b;
    a = (a + 0x10) & 0xff; b = (b + 0x10) & 0xff;
    m[u + 36] = a; m[u + 52] = a; m[u + 22] = b; m[u + 54] = b;
    m[u + 14] = this.rom8(x); m[u + 30] = this.rom8(x + 1);
    x += 2;
    m[u + 46] = this.rom8(x); m[u + 62] = this.rom8(x + 1);
    if (m[0x2259] === 4) {
      m[u + 15] = 0x20; m[u + 47] = 0x20; m[u + 31] = 0xa0; m[u + 63] = 0xa0;
    } else {
      m[u + 15] = 0; m[u + 31] = 0; m[u + 47] = 0; m[u + 63] = 0;
    }
    let yy = this.rom16(0xfc79 + s8(m[0x2259]));
    m[yy - 0x400] = (m[0x2270] & 1) ? 7 : 0;
    if (m[0x2254] !== m[0x2256]) {
      yy = this.rom16(0xfc79 + s8((m[0x2254] << 1) & 0xff));
      m[yy - 0x400] = 0;
    }
  };

  G.objRowsY_C2C3 = function (a, u) {
    const m = this.m;
    for (;;) {
      let b = m[0x2259];
      do { m[u + 6] = a; u += 16; a = (a + 0x10) & 0xff; b--; } while (b & 0xff);
      if (m[0x20f7]) return;
      b = m[0x2259];
      do { a = (a - 0x10) & 0xff; b--; } while (b & 0xff);
      m[0x20f7]++;
    }
  };

  G.objRowsX_C2E3 = function (a, u) {
    const m = this.m;
    for (;;) {
      let b = m[0x2259];
      do { m[u + 4] = a; u += 16; b--; } while (b & 0xff);
      if (m[0x20f7]) return;
      a = (a + 0x10) & 0xff;
      m[0x20f7]++;
    }
  };

  // selects stage a; stages whose table entry is >= 5 are skipped
  G.stageChoice_C2FB = function (a, next) {
    const m = this.m;
    for (;;) {
      const tbl = this.rom16(0xfd27);
      const b = this.rom8(tbl + s8(a));
      m[0x2259]++;
      if (b < 5) { m[0x2256] = a; return; }
      if (m[0x2259] === 6) {
        this.fillColumn_C334(0x3536, 0x10, 7);
        m[0x2256] = 5;
        return;
      }
      // JMP ,Y : continue in the same direction
      if (next === 0xc1d7) a = a === 0 ? 5 : a - 1;
      else a = a === 5 ? 0 : a + 1;
    }
  };

  G.objCodes_C31C = function (y, b, u) {
    const m = this.m;
    for (;;) {
      const a = this.rom8(y++);
      m[u + 14] = a; u += 16;
      if (a === 0x55) {
        do { m[u + 14] = a; u += 16; b = (b - 1) & 0xff; } while (b);
      }
      if (a === 0xff) return;
    }
  };

  G.fillColumn_C334 = function (x, a, b) {
    do { this.m[x] = a; x -= 32; b = (b - 1) & 0xff; } while (b);
    return x;
  };

  G.drawColumns_C346 = function (x, y) {
    for (let b = 2; ;) {
      for (;;) {
        const a = this.rom8(y++);
        if (a === 0xff) break;
        this.m[x] = a; x -= 32;
      }
      b--;
      if (!b) return;
      x += 0x81;
    }
  };

  // ------------------------------------------------------------ stage clear bonus
  G.stageClearInit_C363 = function () {
    this.m[0x2258] = 0;
    this.m[0x2277] = 0xff;
    this.stageClearBonus_C36B();
  };

  G.stageClearBonus_C36B = function () {
    const m = this.m;
    const a = m[0x2277];
    if (a < 0x3f) { this.clearBonusEnd_C46F(); return; }
    if (a === 0x3f || a < 0x80) { this.clearBonusText_C4A3(); return; }
    if (a < 0xc0) { this.clearBonusTable_C564(); return; }
    if (a === 0xff) {
      m[0x2277]--;
      this.queueTask_6114(0x00, 0x0f);
      return;
    }
    // easter egg (never reached in normal play)
    if (((m[0x227c] << 8) | m[0x227d]) === 0x0405 && ((m[0x227e] << 8) | m[0x227f]) === 0x0007 &&
        m[0x2201] === 1 && m[0x2042]) {
      let u = 0x3682;
      for (let i = 0, x = 0xef71; i < 12; i++, u -= 32) m[u] = this.rom8(x++) & 0x3f;
    }
    if (m[0x2090] === 5 && ((m[0x227c] << 8) | m[0x227d]) === 0x0406) {
      m[0x20a9] = 1; m[0x20aa] = 0; m[0x20ab] = 0;
      this.queueTask_6114(0x02, 0x00);
    }
    if (!(m[0x2277] & 7)) this.sound_BBA8();
    // counts the bonus down into the score (animated digits)
    let x = 0x34ed, u = 0x3703;
    for (let i = 0; i < 3; i++) {
      let v = m[x]; if (!v) v = 0x0a; m[x] = v - 1;
      v = m[u]; if (!v) v = 0x0a; m[u] = v - 1;
      x += 32; u += 32;
    }
    const top = m[x];
    const t = m[0x2277];
    if (t === 0xc0 || t === 0xe0) {
      if (top !== m[0x227c]) {
        m[x]++;
        if (m[u]) { m[u]--; m[0x2277] = 0xfe; return; }
      }
      // copy the final digits
      let p = 0x2280;
      for (;;) {
        p--;
        m[p]++;
        if (m[p] === 0x0a) { m[p] = 0; continue; }
        break;
      }
      x = 0x34ed;
      let y = 0x3703;
      u = 0x2280;
      for (let i = 0; i < 4; i++) { m[x] = m[--u]; x += 32; }
      for (let i = 0; i < 4; i++) { m[y] = 0; y += 32; }
      m[0x2277] = 0xbf;
      return;
    }
    m[0x2277]--;
  };

  G.clearBonusEnd_C46F = function () {
    const m = this.m;
    m[0x2278]--;
    if (m[0x2278] !== 0x80) return;
    m[0x2277]--;
    if (m[0x2277] !== 0x3d) return;
    let x = 0x37ab;
    for (;;) {
      for (let i = 0; i < 0x14; i++) { m[x - 0x400] = 0x10; m[x] = 0x10; x++; }
      if (x === 0x343f) {
        m[0x2005]++;
        m[0x227a] = 0; m[0x2279] = 0; m[0x2900] = 0;
        return;
      }
      x -= 52;
    }
  };

  G.clearBonusText_C4A3 = function () {
    const m = this.m;
    let b = m[0x227c];
    if (b < 5) {
      b = ((b + 1) << 1) & 0xff;
      if (m[0x227d] < 5) b--;
    } else b = 0x0a;
    b = (-(b - 0x0b)) & 0xff;
    let a = m[0x2277];
    let lbl;
    if (a >= 0x78) {
      m[0x2278] = a;
      if ((a & 1) === 1) { a = 0; lbl = 0xc4f5; }
      else { a = b === 1 ? 7 : 1; lbl = 0xc4f5; }
    } else if (a === 0x3f) {
      lbl = 0xc53b;
    } else if (a === 0x40) {
      a = b === 1 ? 7 : 1;
      m[0x2277] = 0x3f;
      lbl = 0xc4f5;
    } else lbl = 0xc50d;

    if (lbl === 0xc53b) {
      b = (b - 1) & 0xff;
      if (!b) this.queueTask_6114(0x02, 0x13);
      else {
        b = (b - 1) & 0xff;
        const xx = 0xfd87 + ((b << 1) & 0xff);
        m[0x20aa] = this.rom8(xx); m[0x20ab] = this.rom8(xx + 1);
        m[0x20a9] = 0;
        this.queueTask_6114(0x02, 0x00);
      }
      this.sound_BBA8();
      m[0x2277] = 0x3e; m[0x2278] = 0x0a;
      return;
    }
    if (lbl === 0xc4f5) {
      this.fillColumn_C628(a, 0x32f0 + b, 0x10);
      if (m[0x2277] < 0x41) return;
      m[0x2277] = (m[0x2277] - 8) & 0xff;
    }
    // C50D
    m[0x2277]--;
    if (m[0x2277] !== 0x60) return;
    const t = m[0x2278];
    if (t === 0x79) {
      if (t === 0x40) { m[0x2277] = 0x3f; return; }
      m[0x2277] = 0x40; m[0x2278] = 0x40;
      return;
    }
    if (t < 0x79) return;
    m[0x2277] = t - 1;
  };

  G.clearBonusTable_C564 = function () {
    const m = this.m;
    this.queueTask_6114(0x00, 0x10);
    let x = 0xfda7, u = 0x36f1;
    for (;;) {
      [x, u] = this.textRow_C5D9(x, u, 9);
      if (u === 0x35da) break;
      u = (u + 0x121) & 0xffff;
    }
    u = 0x32f1;
    for (let y = 10; ;) {
      u = this.fillRow_C5E6(0xfe35, u, 0x10);
      y--;
      if (!y) break;
      u = (u + 0x201) & 0xffff;
    }
    this.textRow_C5D9(0xfe29, 0x3591, 5);
    x = 0xfe01; u = 0x3572;
    for (;;) {
      [x, u] = this.textRow_C5D9(x, u, 4);
      if (u === 0x34fa) break;
      u = (u + 0x81) & 0xffff;
    }
    m[0x2277] = 0x7f;
  };

  G.textRow_C5D9 = function (x, u, b) {
    do { this.m[u] = (this.rom8(x++) - 0x30) & 0xff; u -= 32; b--; } while (b);
    return [x, u];
  };

  G.fillRow_C5E6 = function (x, u, b) {
    const v = this.rom8(x);
    do { this.m[u] = v; u -= 32; b--; } while (b);
    return u;
  };

  /** Colour (0, 7 or 13) of b cells in a column. */
  G.fillColumn_C628 = function (a, x, b) {
    if (a === 7) a = 0x0d;
    else if (a !== 0) a = 7;
    do { this.m[x] = a; x -= 32; b = (b - 1) & 0xff; } while (b);
  };

  // ------------------------------------------------------------ high scores
  G.highScoreCheck_C642 = function () {
    this.m[0x2270] = 8;
    this.m[0x2277] = 0xff;
    this.m[0x2262] = 0x10;
  };

  /** Copies the default high score table (7 entries of 7 bytes) to RAM. */
  G.defaultRanking_C652 = function () {
    let x = 0xfe86, u = 0x2160;
    for (;;) {
      for (let b = 7; b; b--) {
        const a = this.rom8(x++);
        this.m[u++] = a;
        if (a === 0xfe) return;
      }
    }
  };

  /** Game over: checks the ranking and runs the name entry. */
  G.gameOverNameEntry_C669 = function () {
    const m = this.m;
    if ((m[0x31c3] & 0x0f) === m[0x32de]) {
      // integrity check of the original board: rewrites a text with the ROM copy
      let u = 0xfebb, x = 0x21de, a;
      do {
        a = this.rom8(u++);
        m[x + 0x1500] = a;
        m[x + 0x1100] = 1;
        x -= 32;
      } while (((a + 1) & 0xff) !== 0);
    }
    if (!m[0x2270]) { this.nameEntryEnd_C842(); return; }
    if (m[0x2270] !== 8 || m[0x2277] !== 0xff) { this.nameEntry_C74D(); return; }
    // first call: find the position of the score in the table
    this.w16(0x2268, m[0x2008] ? 0x1002 : 0x1001);   // input port used to enter the name
    let u = m[0x2021] ? 0x20a3 : 0x20a0;
    for (let i = 0; i < 3; i++) m[0x2265 + i] = m[u + i];
    u = 0x2160;
    for (;;) {
      this.w16(0x226e, u);
      const e = (m[u] << 8) | m[u + 1];
      const sc = (m[0x2265] << 8) | m[0x2266];
      if (e < sc || (e === sc && m[u + 2] <= m[0x2267])) break;
      u += 7;
      if (u === 0x2191) { this.nameEntryEnd_C842(); return; }
    }
    // new entry: shift the lower entries down
    this.music_BC01();
    const pos = this.r16(0x226e);
    let x = 0x2191, d = 0x2198;
    for (;;) {
      for (let b = 0; b < 7; b++) m[d + b] = m[x + b];
      x -= 7; d -= 7;
      if (d === pos) break;
    }
    for (let i = 0; i < 3; i++) m[pos + i] = m[0x2265 + i];
    this.w16(0x226a, pos + 3);
    this.queueTask_6114(0x04, 0x00);
    let off = (pos - 0x2160) & 0xff, rank = 0;
    while (off) { rank++; off = (off - 7) & 0xff; }
    this.w16(0x226c, (0x354e + s8((rank << 1) & 0xff) + 0x160) & 0xffff);
    for (let i = 0; i < 3; i++) m[pos + 3 + i] = 0x41;       // "AAA"
    this.nameEntry_C74D();
  };

  G.readPort = function (a) {
    switch (a) {
      case 0x1000: return this.in.system;
      case 0x1001: return this.in.p1;
      case 0x1002: return this.in.p2;
      case 0x1400: return this.in.dsw1;
      case 0x1800: return this.in.dsw2;
      default: return 0xff;
    }
  };

  G.nameEntry_C74D = function () {
    const m = this.m;
    if (m[0x2270] < 2) { this.nameEntryTimer_C82F(); return; }
    if (this.r16(0x226e) === 0x2191) { this.nameEntryDone_C861(); return; }
    m[this.r16(0x226e) + 6] = m[0x2247];
    // blinking cursor
    const t = m[0x2277] & 0x18;
    if (t === 0 || t === 0x10) {
      const a = t === 0 ? 1 : 0;
      if (m[0x2261] === 1) m[0x2261] = 0;
      else this.fillColumn_C628(a, (this.r16(0x226c) - 0x400) & 0xffff, 1);
    }
    // letter selection with the joystick (every 16 frames)
    let x = this.r16(0x226a);
    let u = this.r16(0x226c);
    const port = this.r16(0x2268);
    let b = m[x];
    if ((m[0x2277] & 0x0f) === 0) {
      const inp = this.readPort(port);
      if (!(inp & 1)) { b = (m[x] + 1) & 0xff; if (b === 0x5c) b = 0x40; }
      else if (!(inp & 2)) { b = (m[x] - 1) & 0xff; if (b === 0x3f) b = 0x5b; }
    }
    m[x] = b;
    m[u] = (b - 0x30) & 0xff;
    // the button (released after a press) confirms the letter
    const btn = this.readPort(port) & 0x10;
    if (m[0x2262]) {
      if (!btn) m[0x2262] = 0;
      this.nameEntryTimer_C82F();
      return;
    }
    if (!btn) { this.nameEntryTimer_C82F(); return; }
    u = (u - 32) & 0xffff;
    const hi = (u >> 8) & 0x0f, lo = u & 0xf0;
    if (hi === 6 && (lo === 0x40 || lo === 0x50)) {
      this.w16(0x226c, (this.r16(0x226c) - 32) & 0xffff);
      this.nameEntryColor_C84F();
      this.nameEntryDone_C861();
      return;
    }
    x++;
    m[u] = (m[x] - 0x30) & 0xff;
    this.w16(0x226a, x);
    this.w16(0x226c, u);
    this.nameEntryColor_C84F();
    m[0x2261] = 1;
    m[0x2270] = 7;
    m[0x2262] = 0x10;
    this.nameEntryTimer_C82F();
  };

  G.nameEntryTimer_C82F = function () {
    const m = this.m;
    if (((m[0x2277] - 1) & 0xff) === 0) {
      if (m[0x2270] === 0) { this.nameEntryEnd_C842(); return; }
      m[0x2270]--;
    }
    m[0x2277]--;
  };

  G.nameEntryEnd_C842 = function () {
    const m = this.m;
    m[0x2270] = 0;
    m[0x2277] = 0;
    m[0x200a]--;
    this.soundStop_BBA1();
  };

  G.nameEntryColor_C84F = function () {
    const x = this.r16(0x226c);
    this.m[x - 0x3e0] = this.m[x - 0x480];
    this.sound_BBC0();
  };

  G.nameEntryDone_C861 = function () {
    this.m[0x2270] = 1;
    this.m[0x2277] = 0x40;
    this.nameEntryTimer_C82F();
  };

  // ------------------------------------------------------------ misc
  /** Play time counter (seconds / minutes, BCD) for the bookkeeping. */
  G.gameCommon_C888 = function () {
    const m = this.m;
    if (!m[0x2280] && !m[0x2300]) { m[0x2275] = 0; return; }
    m[0x2275]++;
    if (m[0x2275] < 0x3d) return;
    m[0x2275] = 0;
    let x = m[0x2021] ? 0x2273 : 0x2271;
    let a = m[x];
    if (a >= 0x59) { m[x++] = 0; a = m[x]; }
    m[x] = CC.bcdAdd(a, 1, 0) & 0xff;
  };

  G.gameOverStats_C8C8 = function () { };

  /** Boot: crosshatch test pattern. */
  G.crosshatch_C95D = function () {
    const m = this.m;
    this.out.coin1 = 0; this.out.coin2 = 0;
    this.soundStop_BBA1();
    let x = 0x3400, y = 0x3000;
    for (let r = 0; r < 16; r++) {
      for (let i = 0; i < 32; i++) {
        m[x++] = 0xee; m[x++] = 0xef;
        m[y] = 0x10; y++;
        m[y + 31] = 0x90;
      }
      y += 32;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
