/*
 * Stage 5 - HORSE. Charlie rides a horse and jumps over the springboards
 * (drawn with tiles) that come from the left.
 *
 * This stage keeps its state in the direct page:
 *   $20B0 jumping            $20B1 horse speed (-1, -2 or -3 pixels per frame)
 *   $20B2/$20B3 gallop animation      $20B4 vertical speed (16 bit, 8.8)
 *   $20B6 bounced this frame $20B7 Charlie's height   $20B8 bounces in a row
 *   $20B9/$20BA death sequence       $20BB   $20BC goal animation
 *   $20BD-$20C2 end of stage (podium drawn with tiles)
 * Sprites are written straight into the object area 0x2590-0x26BF
 * (Charlie 0x2680-0x26BF, horse 0x2620-0x267F), springboards live at 0x2900.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;
  // VRAM pointer one column to the right on the rotated screen (wraps inside 0x3400-0x37FF)
  const vramStep = (d, k) => { d = (d - k) & 0xffff; return ((((d >> 8) & 3) + 0x34) << 8) | (d & 0xff); };
  // "ASL m; CMPA m; LSR m": compares A with m*2 and clears bit 7 of m. Returns the carry.
  function cmpDouble(m, addr, a) {
    const v = (m[addr] << 1) & 0xff;
    m[addr] = v >> 1;
    return a < v;
  }

  G.stage5_A083 = function () {
    const m = this.m;
    const s = m[0x2800];
    if (s === 0) { this.s5Init_A16F(); return; }
    if (s === 1) { this.s5Play_A260(); return; }
    const a = m[0x20b9];
    if (!a) return;
    if (a === 1) { this.s5Fall_A0C9(); return; }
    m[0x20ba] = (m[0x20ba] - 1) & 0xff;
    if (m[0x20ba]) return;
    this.s5Restart_A09A();
  };

  /** After a death: back to the last checkpoint. */
  G.s5Restart_A09A = function () {
    const m = this.m;
    let a = 0;
    for (let x = 0x2900; x < 0x2980; x += 16) if (m[x] >= 2) a--;
    m[0x2208] = (a + m[0x2208]) & 0xff;
    a = m[0x2203];
    if (a) {
      a--;
      if (a >= 0x12) a = 0x11;
      m[0x2203] = a;
    }
    m[0x2006] = (m[0x2006] + 2) & 0xff;
    m[0x2005] = 0;
  };

  G.s5HorseStep = function () {
    const m = this.m;
    m[0x20b3] = (m[0x20b3] + 1) & 3;
    const a = this.rom8(0xef40 + m[0x20b3]);
    m[0x267e] = a;
    m[0x266e] = (a + 1) & 0xff;
    m[0x265e] = (a + 2) & 0xff;
    m[0x264e] = (a + 3) & 0xff;
    m[0x263e] = (a + 4) & 0xff;
    m[0x262e] = (a + 5) & 0xff;
  };

  G.s5CharlieCodes = function (a, withAttr, b) {
    const m = this.m;
    for (let i = 0; i < 4; i++) {
      const at = 0x26be - i * 16;
      m[at] = (a + i) & 0xff;
      if (withAttr) m[at + 1] = b;
    }
  };

  G.s5HorseX = function (a) {
    const m = this.m;
    m[0x2676] = a; m[0x2646] = a;
    a = (a + 0x10) & 0xff; m[0x2666] = a; m[0x2636] = a;
    a = (a + 0x10) & 0xff; m[0x2656] = a; m[0x2626] = a;
    return a;
  };

  G.s5HorseClear = function () {
    const m = this.m;
    m[0x2676] = 0; m[0x2666] = 0; m[0x2656] = 0; m[0x2646] = 0; m[0x2636] = 0; m[0x2626] = 0;
  };

  /** Charlie falls off the horse. */
  G.s5Fall_A0C9 = function () {
    const m = this.m;
    let d = (this.r16(0x20b4) + 0x18) & 0xffff;
    this.w16(0x20b4, d);
    d = (d + this.r16(0x26b4)) & 0xffff;
    let a = d >> 8;
    if (a >= 0xb0) {
      m[0x26be] = 0x31; m[0x26ae] = 0x32; m[0x269e] = 0x33; m[0x268e] = 0x34;
      m[0x26b4] = 0xb0; m[0x26a4] = 0xb0; m[0x2694] = 0xc0; m[0x2684] = 0xc0;
      m[0x20ba] = 0x38;
      this.music_BC13();
      m[0x20b9]++;
      return;
    }
    this.w16(0x26b4, d);
    m[0x26a4] = a;
    a = (a + 0x10) & 0xff;
    m[0x2694] = a; m[0x2684] = a;
    if (m[0x20bd] >= 3) {
      a = m[0x2676];
      if (!a) return;
      a = (a + 0x18) & 0xff;
      if (a >= m[0x20c2]) return;
    }
    a = this.s5HorseX(((-m[0x20b1]) + m[0x2676]) & 0xff);
    if (((a - m[0x20b2]) & 0xff) < 0x0a) return;
    m[0x20b2] = (m[0x20b2] + 0x0a) & 0xff;
    this.s5HorseStep();
  };

  G.s5Init_A16F = function () {
    const m = this.m;
    m.fill(0, 0x20b0, 0x20c4);
    m[0x26b4] = 0x9c; m[0x26a4] = 0x9c;
    m[0x2694] = 0xac; m[0x2684] = 0xac;
    m[0x20b7] = 0xb0;
    m[0x2674] = 0xb0; m[0x2664] = 0xb0; m[0x2654] = 0xb0;
    m[0x2644] = 0xc0; m[0x2634] = 0xc0; m[0x2624] = 0xc0;
    m[0x2614] = 0xe0; m[0x2604] = 0xe0; m[0x25f4] = 0xe0;
    m[0x26b6] = 0x30; m[0x2696] = 0x30;
    m[0x26a6] = 0x40; m[0x2686] = 0x40;
    this.s5HorseX(0x2c);
    m[0x2616] = 0x28; m[0x2606] = 0x38; m[0x25f6] = 0x48;
    this.s5CharlieCodes(0, true, 0);
    let a = this.rom8(0xef40);
    for (let i = 0; i < 6; i++) { m[0x267e - i * 16] = (a + i) & 0xff; m[0x267f - i * 16] = 0; }
    const x = 0xef9b + s8((m[0x2203] * 3) & 0xff);
    m[0x261e] = this.rom8(x); m[0x261f] = 0;
    m[0x260e] = this.rom8(x + 1); m[0x260f] = 0;
    m[0x25fe] = this.rom8(x + 2); m[0x25ff] = 0;
    m.fill(0, 0x2900, 0x2980);
    m[0x2900] = 1;
    m[0x2901] = 8;
    m[0x220b] &= 0xfe;
    this.bonusInit_BC5A();
    if (m[0x2203]) this.music_BC35(); else this.music_BBF1();
    m[0x2203] = (m[0x2203] - 1) & 0xff;
    m[0x2800]++;
  };

  G.s5Input = function () {
    const m = this.m;
    const x = 0x2032 + s8(m[0x2008]);
    const a = m[x];
    let b = 0xff;
    if (!(a & 1)) { b = 0xfe; if (a & 2) b = 0xfd; }
    m[0x20b1] = b;
    return x;
  };

  G.s5Play_A260 = function () {
    const m = this.m;
    this.demoInput_691D();
    if (this.s5Goal_A7C4()) return;
    this.bonusTick_BCA8();
    if (this.s5AA3C()) return;
    this.backgroundAnim_BE86();
    this.blinkStep_BB54();
    m[0x20b6] = 0;
    for (let u = 0x2900; u < 0x2980; u += 16) {
      if (m[u] && this.s5Board_A444(u)) return;
    }
    if (m[0x20b6]) this.w16(0x20b4, (0xffe8 - this.r16(0x20b4)) & 0xffff);

    if (m[0x20b0]) {
      let a = m[0x20bc];
      if (a) {
        a = (a + 1) & 0xff;
        m[0x20bc] = a;
        if (!(a & 7) && a < 0x38) {
          const b = a === 0x28 ? 0xc0 : 0;
          const x = 0xeeee + (a >> 1);
          for (let i = 0; i < 4; i++) { m[0x26be - i * 16] = this.rom8(x + i); m[0x26bf - i * 16] = b; }
        }
      }
      let d = (this.r16(0x20b4) + 0x18) & 0xffff;
      this.w16(0x20b4, d);
      d = (d + this.r16(0x26b4)) & 0xffff;
      this.w16(0x26b4, d);
      a = d >> 8;
      m[0x26a4] = a;
      a = (a + 0x10) & 0xff;
      m[0x2694] = a; m[0x2684] = a;
      a = (a + 4) & 0xff;
      m[0x20b7] = a;
      if (!m[0x20bc] && a === 0xb0) {
        this.s5CharlieCodes((m[0x20b3] << 2) & 0xff, false);
        m[0x20b8] = (m[0x20b8] - 1) & 0xff;
        if (m[0x20b8]) { m[0x220a]++; m[0x20b8] = 0; }
        m[0x20b0] = 0;
      }
    } else {
      const x = this.s5Input();
      const a = ((~m[x]) | m[x + 3]) & 0x10;
      if (a) this.s5CharlieCodes((m[0x20b3] << 2) & 0xff, false);
      else {
        m[0x20b0]++;
        this.w16(0x20b4, 0xfd00);
        let c = 0x29;
        if (m[0x20bd] >= 2) { m[0x20bc]++; c = this.rom8(0xeeee); }
        this.s5CharlieCodes(c, false);
        this.sound_BBB0();
      }
    }

    // A365: the horse gallops
    if (m[0x20bd] >= 3 && m[0x20c2] <= 0x40) this.s5HorseClear();
    else if (((m[0x20b2] - m[0x2204]) & 0xff) >= 0x0a) {
      m[0x20b2] = (m[0x20b2] - 0x0a) & 0xff;
      this.s5HorseStep();
    }
    // A3B8: scroll
    const sum = m[0x20b1] + m[0x2204];
    const b = sum & 0xff;
    m[0x2204] = b;
    if (sum <= 0xff) {
      m[0x2203]++;
      if (m[0x2203] === 0x11) {
        for (let x = 0x2900; x < 0x2980; x += 16) if (m[x] === 1) m[x] = 0;
        m[0x20bd]++;
      }
    } else {
      // audience rows: the heads change with the scroll
      let t = -1;
      let c = (b + 0x58) & 0xff;
      if (c < 0x10) t = 0;
      else if ((c -= 0x10) < 0x10) t = 1;
      else if ((c - 0x10) < 3) t = 2;
      if (t >= 0) {
        const x = 0x25fe + t * 16;
        const i = ((m[0x2203] * 3) + 5 - t) & 0xff;
        m[x] = this.rom8(0xef9b + s8(i));
      }
    }
    // A3FF
    const v = m[0x20b1];
    for (let x = 0x2901; x < 0x2981; x += 16) {
      m[x] = (m[x] + v) & 0xff;
      m[x + 7] = (m[x + 7] + v) & 0xff;
    }
    let a = (v + m[0x2616]) & 0xff;
    m[0x2616] = a;
    m[0x2606] = (a + 0x10) & 0xff;
    m[0x25f6] = (a + 0x20) & 0xff;
    m[0x20c2] = (v + m[0x20c2]) & 0xff;
  };

  /** Springboards: 1 = choose the next one, 2 = being drawn, 3 = active, leaving the screen. */
  G.s5Board_A444 = function (u) {
    const m = this.m;
    const st = m[u];
    if (st === 1) { this.s5BoardNew_A488(u); return false; }
    if (st === 2) { this.s5BoardDraw_A52B(u); return false; }
    if (this.s5Collide_A5CC(u)) return true;
    if (((m[0x2204] - m[u + 5]) & 0xff) > 8) return false;
    m[u + 5] = (m[u + 5] - 8) & 0xff;
    let x = 0xef4c;
    let a = (0x19 - m[u + 4]) & 0xff;
    const y = (this.r16(u + 6) - 1) & 0xffff;
    do {
      m[(y + s8(a)) & 0xffff] = this.rom8(--x);
      a = (a - 1) & 0xff;
    } while (!(a & 0x80));
    this.w16(u + 6, vramStep(y, 0x1f));
    m[u + 3] = (m[u + 3] - 1) & 0xff;
    if (!m[u + 3]) { m[u] = 0; m[0x220b] = 2; }
    return false;
  };

  G.s5BoardNew_A488 = function (u) {
    const m = this.m;
    if (m[u + 1] >= 3) return;
    let a = 0x10;
    if (m[0x2022]) {
      a = (m[0x202f] & 0x60) >> 1;
      const b = (((m[0x2212] - 1) & 0xff) << 4) & 0xff;
      a = (a + b) & 0xff;
    }
    a = (a + m[0x2208]) & 0xff;
    if (a >= 0x68) a = (a & 7) + 0x60;
    let x = 0xf6f2 + a;
    if (m[0x220b] === 1) {
      const y = (u & 0xff00) | (((u & 0xff) + 0x10) & 0x70);
      m[u + 4] = m[y + 4];
      m[u + 2] = 7; m[u + 3] = 7;
      m[u + 12] = 0x25;
      m[u + 10] = 0x1e; m[u + 11] = 0x21;
      x += 104;
    } else {
      let b = this.rom8(x);
      m[u + 2] = b;
      m[u + 3] = 7;
      b = ((((b - 1) & 0xff) << 2) + 9) & 0xff;
      m[u + 11] = b;
      b = (b - 3) & 0xff;
      m[u + 10] = b;
      m[u + 12] = (b + 7) & 0xff;
      x += 104;
      m[u + 4] = this.rom8(x);
    }
    x += 104;
    const b = m[0x2204];
    m[u + 5] = b;
    const d = (b & 0xf8) << 2;
    m[u + 6] = ((d >> 8) + 0x34) & 0xff;
    m[u + 7] = ((d & 0xff) + m[u + 4]) & 0xff;
    const y = (u & 0xff00) | (((u & 0xff) - 0x10) & 0x70);
    a = this.rom8(x);
    if (!m[0x220b]) { m[0x220b]++; a = 0x34; }
    m[y]++;
    m[y + 1] = a;
    m[u]++;
    m[0x2208]++;
  };

  G.s5BoardDraw_A52B = function (u) {
    const m = this.m;
    if (((m[u + 5] - m[0x2204]) & 0xff) < 8) return;
    m[u + 5] = (m[u + 5] - 8) & 0xff;
    let x = this.r16(u + 6);
    const n = m[u + 3], top = m[u + 2];
    if (!(n > top)) {
      const t = (m[u + 4] - 0x12) & 0xff;
      const y = 0xef4e + s8((t << 3) & 0xff);
      let b;
      if (n === 1) b = 0;
      else if (n === 2) b = 1;
      else {
        const a = (n + 1) & 0xff;
        if (a === top) b = 2;
        else b = a < top ? 3 : 1;
      }
      const w = this.rom16(y + b * 2);
      m[x] = w >> 8; m[x + 1] = w & 0xff;
      if (n === 1 || ((n + 1) & 0xff) === top) {
        let a = (7 - t) & 0xff;
        x = (x + s8(a)) & 0xffff;
        let yy = 0xef71;
        a = (a - 2) & 0xff;
        do {
          x = (x - 1) & 0xffff;
          m[x] = this.rom8(--yy);
          a = (a - 1) & 0xff;
        } while (a);
        x = (x - 2) & 0xffff;
      }
    }
    let d = vramStep(x, 0x20);
    this.w16(u + 6, d);
    m[u + 3] = (m[u + 3] - 1) & 0xff;
    if (m[u + 3]) return;
    d = (d + 0xcce0) & 0xffff;
    d = ((((d >> 8) & 3) + 0x34) << 8) | (d & 0xff);
    this.w16(u + 6, d);
    m[u + 8] = (m[u + 2] << 2) & 0xff;
    m[u + 8] = ((m[u + 5] & 7) + 0xf3 - m[u + 5] + m[0x2204] - m[u + 8]) & 0xff;
    m[u + 9] = ((m[u + 4] + 1) << 3) & 0xff;
    m[u + 3] = 7;
    m[u + 5] = (m[u + 5] + 0x38) & 0xff;
    m[u]++;
  };

  /** Charlie against a springboard. Returns true when he dies (the frame ends there). */
  G.s5Collide_A5CC = function (u) {
    const m = this.m;
    if (m[0x20b0]) {
      if (((m[u + 8] - m[u + 11] - 0x48) & 0xff) < 3) {
        m[0x26be] = 0x19; m[0x26ae] = 0x1a; m[0x269e] = 0x1b; m[0x268e] = 0x1c;
      }
      let top = false;
      if (cmpDouble(m, u + 10, (m[u + 8] - 0x40 + m[u + 10]) & 0xff) &&
          ((m[u + 9] - m[0x20b7] - 0x0d) & 0xff) < 4) top = true;
      if (top) {
        if (m[0x20b4] & 0x80) return this.s5Hit_A745(u);
        this.s5Bounce(u);
        return false;
      }
      // A6D3
      if (!cmpDouble(m, u + 11, (m[u + 8] - 0x40 + m[u + 11]) & 0xff)) return false;
      if (((m[u + 9] - m[0x20b7] - 0x11) & 0xff) < 4) { this.s5BoardFrame_A6F2(u, 0x51, 0x00); return false; }
    }
    // A729
    if (!cmpDouble(m, u + 10, (m[u + 8] - 0x40 + m[u + 10]) & 0xff)) return false;
    if (((m[u + 9] - m[0x20b7] + 0x12) & 0xff) >= 0x24) return false;
    return this.s5Hit_A745(u);
  };

  G.s5Hit_A745 = function (u) {
    const m = this.m;
    const a = (0x40 + m[0x20b7] - m[u + 8] - m[u + 9] + m[u + 12]) & 0xff;
    if (!cmpDouble(m, u + 12, a)) return false;
    this.s5Die_A75E();
    return true;
  };

  G.s5FallSprites = function () {
    const m = this.m;
    m[0x25e4] = 0x52; m[0x25d4] = 0x52; m[0x25c4] = 0x52;
    m[0x25b4] = 0x5a; m[0x25a4] = 0x5a; m[0x2594] = 0x5a;
    m[0x25e6] = 0x30; m[0x25d6] = 0x40; m[0x25c6] = 0x50;
    m[0x25b6] = 0x90; m[0x25a6] = 0xa0; m[0x2596] = 0xb0;
  };

  G.s5Die_A75E = function () {
    const m = this.m;
    this.s5FallSprites();
    m[0x25ee] = 0x16; m[0x25be] = 0x16;
    m[0x25de] = 0x17; m[0x25ae] = 0x17;
    m[0x25ce] = 0x18; m[0x259e] = 0x18;
    this.w16(0x20b4, 0);
    m[0x26b5] = 0;
    m[0x2800]++;
    m[0x20b9]++;
    m[0x20b2] = (0x2c - m[0x20b2] + m[0x2204]) & 0xff;
    this.soundStop_BBA1();
    this.sound_BBC8();
  };

  /** Bounce on a springboard: score doubles with every bounce in a row. */
  G.s5Bounce = function (u) {
    const m = this.m;
    m[0x20b6]++;
    this.s5BoardFrame_A6F2(u, 0x55, 0x03);
    this.s5CharlieCodes(0x29, false);
    let t = (m[0x20b1] - m[0x20b8]) & 0xff;
    let a = this.rom8(0xf002 + s8((m[u + 2] - 1) & 0xff));
    const bi = ((m[u + 4] - 0x12) << 1) & 0xff;
    let r = CC.bcdAdd(a, this.rom8(0xf008 + s8(bi)), 0);
    a = r & 0xff;
    let b = (this.rom8(0xf008 + s8((bi + 1) & 0xff)) + (r >> 8)) & 0xff;
    m[0x20aa] = a; m[0x20ab] = b;
    for (;;) {
      t = (t + 1) & 0xff;
      if (!t) break;
      r = CC.bcdAdd(a, m[0x20aa], 0);
      a = r & 0xff;
      b = CC.bcdAdd(b, m[0x20ab], r >> 8) & 0xff;
      m[0x20aa] = a; m[0x20ab] = b;
    }
    m[0x20a9] = 0;
    m[0x20aa] = b;
    m[0x20ab] = a;
    this.queueTask_6114(0x02, 0x00);
    // points shown on the springboard
    let y = vramStep(this.r16(u + 6), 0x41);
    a = m[0x20aa] >> 4;
    if (a) m[y] = a;
    y = vramStep(y, 0x20);
    a = m[0x20aa];
    if (a) m[y] = a & 0x0f;
    y = vramStep(y, 0x20);
    m[y] = m[0x20ab] >> 4;
    y = vramStep(y, 0x20);
    m[y] = 0;
    m[0x20b8]++;
    this.s5Input();
    this.sound_BBCC();
    this.blinkStart_BB28();
  };

  /** Springboard tiles: pressed (0x55) or touched (0x51). */
  G.s5BoardFrame_A6F2 = function (u, a0, b0) {
    const m = this.m;
    m[u + 13] = a0;
    m[u + 14] = this.rom8(0xef66 + b0 + s8((m[u + 4] - 0x12) & 0xff));
    let x = this.r16(u + 6);
    for (let a = 7; a !== 1; a--) {
      let b = m[u + 13];
      if (!(a > m[u + 2])) {
        if (a === m[u + 2] || a === 2) { m[x + 1] = b; b = (b - 1) & 0xff; }
        else b = m[u + 14];
        m[x] = b;
      }
      x = vramStep(x, 0x20);
    }
  };

  // ------------------------------------------------------------ end of stage
  /** Returns true when the rest of the frame is skipped. */
  G.s5Goal_A7C4 = function () {
    const m = this.m;
    const st = m[0x20bd];
    if (!st) return false;
    if (st === 1) { this.s5GoalStart_A867(); return false; }
    if (st === 2) { this.s5GoalDraw_A88C(); return false; }
    if (st === 3) return this.s5GoalLand_A8F5();
    m[0x287f] = 2;
    this.blinkStep_BB54();
    m[0x20bc] = (m[0x20bc] + 1) & 0xff;
    if (!m[0x20bc]) { m[0x2006]++; m[0x2005] = 0; return true; }
    let a = m[0x20bc] & 0x0e;
    const w = this.rom16(0xf178 + a);
    let b = w & 0xff;
    m[0x25ef] = w >> 8; m[0x25df] = w >> 8; m[0x25cf] = w >> 8;
    m[0x25bf] = b; m[0x25af] = b; m[0x259f] = b;
    if (!m[0x220a]) {
      // the bonus life sign drops
      const x = 0x2560;
      a = m[0x20bc];
      if (!(a & 7)) {
        b = (((a & 0x18) >> 2) + 0x44) & 0xff;
        if (b === 0x4a) b = 0x46;
        m[x + 30] = b;
        b = (b + 1) & 0xff;
        m[x + 46] = b;
      }
      a = (-a) & 0xff;
      m[x + 38] = a;
      a = (a - 0x10) & 0xff;
      m[x + 22] = a;
      a = (a + 8) & 0xff;
      if (a >= m[x]) {
        if (a === m[x]) {
          m[0x2200]++;
          this.queueTask_6114(0x03, b);
          this.sound_BBE9();
          a = 0;
        }
        m[x + 6] = a;
      }
    }
    a = m[0x20bc];
    if (!(a & 0x1f)) this.s5CharlieCodes((((a & 0x20) >> 3) + 0xad) & 0xff, false);
    return true;
  };

  G.s5GoalStart_A867 = function () {
    const m = this.m;
    if (m[0x2203] !== 0x12) return;
    if (((m[0x2204] + 0x20) & 0xff) >= 3) return;
    m[0x20be] = 8;
    const b = m[0x2204];
    m[0x20bf] = b;
    this.w16(0x20c0, (((b & 0xf8) << 2) + 0x3415) & 0xffff);
    m[0x20bd]++;
  };

  G.s5GoalDraw_A88C = function () {
    const m = this.m;
    if (((m[0x20bf] - m[0x2204]) & 0xff) < 8) return;
    m[0x20bf] = (m[0x20bf] - 8) & 0xff;
    const x = 0xf1fb + s8((((m[0x20be] - 1) & 0xff) * 6) & 0xff);
    const y = this.r16(0x20c0);
    for (let i = 0; i < 6; i++) m[y + i] = this.rom8(x + i);
    for (let i = 0; i < 4; i++) m[(y + 0xfc01 + i) & 0xffff] = 0;
    let d = vramStep(y, 0x20);
    this.w16(0x20c0, d);
    m[0x20be]--;
    if (m[0x20be]) return;
    d = (d + 0xcd00) & 0xffff;
    this.w16(0x20c0, ((((d >> 8) & 3) + 0x34) << 8) | (d & 0xff));
    m[0x20c2] = ((m[0x20bf] & 7) + 0xd8 - m[0x20bf] + m[0x2204]) & 0xff;
    m[0x20be] = 8;
    m[0x20bf] = (m[0x20bf] + 0x40) & 0xff;
    m[0x20bd]++;
  };

  G.s5GoalLand_A8F5 = function () {
    const m = this.m;
    const h = m[0x20b7];
    if (((m[0x20c2] - 0x24) & 0xff) < 0x38 && h >= 0xa1) { this.s5GoalReached_A97C(); return true; }
    let fall = h >= 0xc4;
    if (!fall && h >= 0xa1 && ((m[0x20c2] - 0x16) & 0xff) < 0x54) fall = true;
    if (fall) {
      // missed the podium
      this.s5HorseClear();
      for (let x = 0x3016; x < 0x3400; x += 32) { m[x] = 0x10; m[x + 1] = 0x10; m[x + 2] = 0x10; m[x + 3] = 0x10; }
      this.s5Die_A75E();
      return true;
    }
    if (!m[0x20be]) return false;
    if (((m[0x2204] - m[0x20bf]) & 0xff) > 8) return false;
    m[0x20bf] = (m[0x20bf] - 8) & 0xff;
    const x = this.r16(0x20c0);
    for (let i = 0; i < 4; i++) m[(x + 0xfc01 + i) & 0xffff] = 0x10;
    for (let i = 0; i < 6; i++) m[x + i] = this.rom8(0xef48 + i);
    this.w16(0x20c0, vramStep(x, 0x20));
    m[0x20be]--;
    return false;
  };

  G.s5GoalReached_A97C = function () {
    const m = this.m;
    m[0x26b4] = 0x8d; m[0x26a4] = 0x8d;
    m[0x2694] = 0x9d; m[0x2684] = 0x9d;
    this.s5CharlieCodes(0xad, false);
    this.s5HorseClear();
    this.s5FallSprites();
    for (let i = 0; i < 6; i++) m[0x25ee - i * 16] = 0x10 + i;
    m[0x287d] = 0x11; m[0x287e] = 0x02;
    this.music_BC3F();
    if (!m[0x220a]) {
      const x = 0x2560;
      let a = m[0x2200];
      if (a >= 5) a = 4;
      m[x] = ((a << 4) + 8) & 0xff;
      m[x + 4] = 0x38;
      m[x + 20] = 0x28; m[x + 36] = 0x28;
      this.w16(x + 14, 0x4ea0);
      this.w16(x + 30, 0x4420);
      this.w16(x + 46, 0x4520);
    }
    m[0x20bc] = 0;
    m[0x20bd]++;
  };

  /** Returns true when the rest of the frame is skipped. */
  G.s5AA3C = function () {
    const a = this.m[0x20bb];
    if (!a) return false;
    if (a === 1) return true;
    this.s5Restart_A09A();
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
