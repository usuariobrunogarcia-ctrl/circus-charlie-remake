/*
 * Stage 6 - TRAPEZE. Charlie swings from trapeze to trapeze.
 *
 * Trapezes: 5 records of 48 bytes at 0x2900 (index, turn, 16 bit angle,
 * swing size, length, speed, sin/cos, then 16 x and 16 y rope points).
 * Rope / bar sprites live in 0x2400-0x26FF (3 sprite columns), Charlie at
 * 0x2740-0x277F. The direct page 0x20B0-0x20FF holds the state:
 *   $20B0 flying          $20B5/$20B7 horizontal / vertical speed
 *   $20D1-$20D2 camera offset       $20D9-$20DC trapeze numbers (first, current...)
 *   $20DF-$20E1 goal position       $20E4-$20F2 3 nets (x, VRAM pointer)
 *   $20F9-$20FF scratch
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;
  const neg = (v) => (v & 0x80) !== 0;
  const asr2w = (d) => { d = (d << 16) >> 16; return (d >> 2) & 0xffff; };

  G.stage6_AA49 = function () {
    const s = this.m[0x2800];
    if (s === 0) this.s6Init_AA5B();
    else if (s === 1) this.s6Play_AC09();
    else if (s === 2) this.s6Goal_B833();
    else this.s6Dead_BA30();
  };

  // ------------------------------------------------------------ helpers
  /** Trapeze record whose index is A. */
  G.s6Bar_B5F5 = function (a) {
    a &= 0xff;
    let u = 0x28d0;
    do { u += 48; } while (this.m[u] !== a && u < 0x2a00);
    if (u >= 0x2a00) this.todo(0xb5f5);
    return u;
  };

  G.s6Visible = function (b) {
    const m = this.m;
    b &= 0xff;
    return !neg(b - m[0x20d9]) && b <= m[0x20dc];
  };

  /** New trapeze A in record U (length and speed from the level tables). */
  G.s6BarInit_B49A = function (u, a) {
    const m = this.m;
    a &= 0xff;
    m[u] = a;
    if (!this.s6Visible(a)) a = 0;
    if (a >= 0x68) a = (a & 7) + 0x60;
    const x = 0xf8c6 + a;
    m[u + 8] = this.rom8(x);
    const b = this.rom8(x + 104);
    m[u + 9] = b;
    this.w16(u + 10, this.rom16(0xf0f4 + (((b - 0x20) & 0xff) >> 1)));
    m[u + 1] = 0x01; m[u + 2] = 0x5a;
    m[u + 4] = (s8((0x3c - m[u + 9]) & 0xff) >> 2) & 0xff;
  };

  G.s6Bars_B4D1 = function () {
    const m = this.m;
    for (let u = 0x2900; u < 0x29f0; u += 48) if (this.s6Visible(m[u])) this.s6Swing_B4EA(u);
  };

  G.s6Sin = function (a) {
    if (a > 0x5a) a = (0xb4 - a) & 0xff;
    return this.rom8(0xf188 + s8(a));
  };

  /** Swings a trapeze and computes its 16 rope points. */
  G.s6Swing_B4EA = function (u) {
    const m = this.m;
    let d = (this.r16(u + 2) + this.r16(u + 10)) & 0xffff;
    if ((d >> 8) >= 0xb4) {
      d = (d - 0xb400) & 0xffff;
      m[u + 1]++;
      this.w16(0x20f9, d);
      if (m[u] === m[0x20da] && !(m[u + 1] & 1)) {
        m[u + 4]++;
        if (m[u + 4] >= 0x10) {
          m[u + 4]--;
          if (!m[0x20b0]) this.s6Release_B617();
        }
      }
      d = this.r16(0x20f9);
    }
    this.w16(u + 2, d);
    const hi = (this.s6Sin(d >> 8) * m[u + 8]) >> 8;
    m[u + 12] = this.rom8(0xf188 + s8((0x5a - hi) & 0xff));
    m[u + 13] = this.rom8(0xf188 + s8(hi));
    m[0x20f9] = 0;
    this.w16(0x20fa, (m[u + 12] << 2) & 0xffff);
    const mul2 = m[u + 9] * m[u + 12];
    this.w16(0x20fc, mul2);
    const cur = m[u] === m[0x20da];
    if (cur) {
      this.w16(0x20c1, this.r16(0x20bf));
      this.w16(0x20bf, this.r16(0x20bd));
      this.w16(0x20bd, this.r16(0x20bb));
      this.w16(0x20bb, this.r16(0x20b9));
      this.w16(0x20b9, mul2);
      this.w16(0x20c3, asr2w(mul2 - this.r16(0x20c1)));
    }
    // x points (vertical component)
    d = mul2;
    this.w16(0x20fc, u + 16);
    let x = u + 32;
    d = (((((d >> 8) + 0x50) & 0xff) << 8) | (d & 0xff));
    do {
      m[--x] = d >> 8;
      m[0x20f9]++;
      d = (d - this.r16(0x20fa)) & 0xffff;
    } while ((d >> 8) >= 0x50);
    if (x !== u + 16) {
      d = (d + this.r16(0x20fa)) & 0xffff;
      do { m[--x] = d >> 8; } while (x >= u + 16);
    }
    // y points (horizontal component)
    m[0x20fa] = (0x10 - m[0x20f9]) & 0xff;
    this.w16(0x20fb, (((-m[u + 13]) & 0xffff) << 2) & 0xffff);
    let mul3 = m[u + 9] * m[u + 13];
    x = u + 48;
    m[0x20fd] = mul3 >> 8;
    if (m[u + 1] & 1) {
      mul3 = (-mul3) & 0xffff;
      this.w16(0x20fe, mul3);
      this.w16(0x20fb, (-this.r16(0x20fb)) & 0xffff);
    }
    if (cur) {
      this.w16(0x20cd, this.r16(0x20cb));
      this.w16(0x20cb, this.r16(0x20c9));
      this.w16(0x20c9, this.r16(0x20c7));
      this.w16(0x20c7, this.r16(0x20c5));
      this.w16(0x20c5, mul3);
      this.w16(0x20cf, asr2w(this.r16(0x20cd) - mul3));
    }
    d = mul3;
    do {
      m[--x] = d >> 8;
      d = (d + this.r16(0x20fb)) & 0xffff;
      m[0x20f9]--;
    } while (m[0x20f9]);
    if (m[0x20fa]) {
      d = (d - this.r16(0x20fb)) & 0xffff;
      do { m[--x] = d >> 8; m[0x20fa]--; } while (m[0x20fa]);
    }
  };

  /** Rope colours: segments below the hand position are drawn differently. */
  G.s6RopeColors_B600 = function (x, u) {
    const m = this.m;
    const a = m[u + 4];
    for (m[0x20f9] = 0x0f; m[0x20f9]; m[0x20f9]--) {
      m[x] = a < m[0x20f9] ? 1 : 6;
      x -= 16;
    }
  };

  /** Rope without Charlie: plain sprites. */
  G.s6RopePlain_B3A5 = function (d) {
    const m = this.m;
    let y = 0x2400 + d;
    m[y + 14] = 0x56;
    m[y + 15] = 0;
    for (let i = 0; i < 7; i++) { y -= 16; m[y + 14] = 0x55; }
  };

  /** Rope holding Charlie: body sprites depend on the swing. */
  G.s6RopeCharlie_B3C6 = function (y, u) {
    const m = this.m;
    const a = (this.s6Sin(m[u + 2]) * m[u + 8]) >> 8;
    const lim = [0x52, 0x43, 0x3c, 0x2d, 0x25, 0x1e, 0x07];
    let b = 0;
    while (b < 7 && a < lim[b]) b++;
    if (!(m[u + 1] & 1)) b = (0x0f - b) & 0xff;
    const t = m[y + 6];
    if (!(t > 2) && !(t < 0xfe)) this.todo(0xb40e);   // never taken (t <= 2 is always < 0xFE)
    m[y - 34] = 0x56;
    m[y - 33] = 0;
    m[0x226e] = b;
    b = (b * 6) & 0xff;
    const x = 0xfb78 + s8(b);
    let w = this.rom16(x);
    m[y + 14] = w & 0xff; m[y + 15] = w >> 8;
    w = this.rom16(x + 2);
    m[y - 2] = w & 0xff; m[y - 1] = w >> 8;
    w = this.rom16(x + 4);
    m[y - 18] = w & 0xff; m[y - 17] = w >> 8;
    m[y + 4] = m[y - 12]; m[y + 6] = m[y - 10];
    m[y - 12] = m[y - 44]; m[y - 10] = m[y - 42];
    m[y - 28] = m[y - 92]; m[y - 26] = m[y - 90];
    m[y - 44] = m[y - 92]; m[y - 42] = m[y - 90];
    m[y - 92] = 0; m[y - 76] = 0; m[y - 60] = 0;
    m[y - 90] = 0; m[y - 74] = 0; m[y - 58] = 0;
  };

  /** Lets go of the trapeze. */
  G.s6Release_B617 = function () {
    const m = this.m;
    m[0x20b0]++;
    m[0x20de]++;
    const a = this.rom8(0xef34);
    m[0x2776] = a; m[0x2756] = a;
    m[0x2766] = (a + 0x10) & 0xff; m[0x2746] = (a + 0x10) & 0xff;
    m[0x277e] = 0xf8; m[0x276e] = 0xf9; m[0x275e] = 0xfa; m[0x274e] = 0xfb;
    this.w16(0x20b7, this.r16(0x20c3));
    this.w16(0x20b5, this.r16(0x20cf));
    m[0x2775] = 0;
    m[0x2205] = 0;
    m[0x20d3] = 0; m[0x20e1] = 0; m[0x20e6] = 0; m[0x20eb] = 0; m[0x20f0] = 0;
    this.w16(0x271e, 0xfe00);
    this.w16(0x270e, 0xfe00);
    this.sound_BBB0();
  };

  G.s6GoalTiles_B661 = function () {
    const m = this.m;
    if (((this.r16(0x20df) - 0x19) & 0xffff) >= 0xef) return;
    let x = (this.r16(0x20e2) + 0xfc06) & 0xffff;
    for (let a = 4; a; a--) {
      x += 32;
      if (x >= 0x3400) x = (x + 0xfc00) & 0xffff;
      m[x] = 0x10; m[x + 1] = 0x10; m[x + 2] = 0x10;
    }
  };

  // ------------------------------------------------------------ init
  G.s6Init_AA5B = function () {
    const m = this.m;
    m.fill(0, 0x20b0, 0x2100);
    let a = 0x10;
    if (m[0x2022]) {
      a = (m[0x202f] & 0x60) >> 1;
      const b = (((m[0x2213] - 1) & 0xff) << 4) & 0xff;
      m[0x20f9] = b;
      a = (a + b) & 0xff;
    }
    a = (a + m[0x2208]) & 0xff;
    m[0x20d9] = a; m[0x20db] = a; m[0x20da] = a;
    m[0x20dc] = 0xff;
    const da = m[0x20da];
    this.s6BarInit_B49A(0x2900, da - 2);
    this.s6BarInit_B49A(0x2930, da - 1);
    this.s6BarInit_B49A(0x2960, da);
    this.s6BarInit_B49A(0x2990, da + 1);
    this.s6BarInit_B49A(0x29c0, da + 2);
    this.s6Bars_B4D1();
    m[0x20d2] = (0x34 - m[0x298f]) & 0xff;
    m[0x2904] = 0x0f; m[0x2934] = 0x0f;
    m[0x20df] = 0xc0;
    // nets under the trapezes
    let u = 0x20e4, x = 0x2969;
    let d = (m[0x20d2] + m[x] + 0x2c) & 0xff;
    for (;;) {
      this.w16(0x20f9, d);
      this.w16(u, d & 0xfff8);
      u += 5;
      if (u > 0x20ee) break;
      x += 48;
      d = ((((m[x] << 1) & 0xff) + 0x10) & 0xff) + this.r16(0x20f9);
      d &= 0xffff;
    }
    u -= 5;
    if (m[0x20da] & 1) { m[u] = 0xc0; m[u - 10] = 0xc0; } else m[u - 5] = 0xc0;
    for (; u >= 0x20e4; u -= 5) {
      const dd = ((((-m[0x2203]) & 0xff) << 8) | m[0x2204]) - this.r16(u);
      if ((dd & 0xffff) < 0xfa00) m[u] = 0xc0;
      else this.w16(u + 3, ((((-m[u + 1]) & 0xff) << 2) + 0x341c) & 0xffff);
    }
    for (u = 0x20e4; u <= 0x20ee; u += 5) {
      this.w16(0x20fc, u);
      let xx = 0xf12e;
      m[0x20f9] = 6;
      d = this.r16(u);
      let v = this.r16(u + 3);
      do {
        if (!(d >> 8)) {
          this.w16(0x20fa, d);
          m[v] = this.rom8(xx); m[v + 1] = this.rom8(xx + 1); m[v + 2] = this.rom8(xx + 2);
          d = this.r16(0x20fa);
        }
        d = (d - 8) & 0xffff;
        xx += 3;
        v += 32;
        if (v >= 0x3800) v = (v + 0xfc00) & 0xffff;
        m[0x20f9]--;
      } while (m[0x20f9]);
      u = this.r16(0x20fc);
    }
    m[0x2734] = 0x44; m[0x2724] = 0x54;
    this.w16(0x273e, 0x7020);
    this.w16(0x272e, 0x7820);
    m[0x27e4] = 0xa8; m[0x27d4] = 0xa8; m[0x27c4] = 0xa8;
    m[0x27e6] = 0x68; m[0x27d6] = 0x78; m[0x27c6] = 0x88;
    x = 0xefdd + s8((m[0x2203] * 3) & 0xff);
    m[0x27ee] = this.rom8(x); m[0x27de] = this.rom8(x + 1); m[0x27ce] = this.rom8(x + 2);
    for (x = 0x26fe; x >= 0x240e; x -= 16) m[x] = 0x55;
    m[0x24fe] = 0x56; m[0x25fe] = 0x56; m[0x26fe] = 0x56;
    m[0x2716] = 0x34; m[0x2706] = 0x43;
    m[0x271e] = 0xfe; m[0x270e] = 0xfe;
    m[0x20dd] = 7;
    for (x = 0x32e0; x <= 0x3340; x += 32) { m[x] |= 0x10; m[x + 1] |= 0x10; m[x + 4] |= 0x10; }
    this.bonusInit_BC5A();
    this.music_BC0A();
    m[0x2800]++;
  };

  // ------------------------------------------------------------ play
  G.s6Play_AC09 = function () {
    const m = this.m;
    this.demoInput_691D();
    this.bonusTick_BCA8();
    if (this.s6Timer_BA59()) return;
    this.backgroundAnim_BE86();
    this.blinkStep_BB54();
    this.s6GoalTiles_B661();
    if (!m[0x20b0]) {
      const x = 0x2032 + s8(m[0x2008]);
      const a = m[x];
      m[0x20d7] = a;
      if (!((((~a) & 0xff) | m[x + 3]) & 0x10 | m[0x20dd])) this.s6Release_B617();
      this.s6Scroll_AD62();
      return;
    }
    if (!m[0x20df] && ((m[0x20e0] - 0x3c) & 0xff) <= 0x28 && ((m[0x2774] - 0x68) & 0xff) <= 2) {
      this.s6GoalReached_B68B();
      return;
    }
    // AC38: landing on a net
    if (!neg(m[0x20b7])) {
      let u = 0x20e4;
      while (u < 0x20f3 && m[u]) u += 5;
      if (u < 0x20f3 && ((m[u + 1] - 0x40) & 0xff) <= 0x20 && m[0x2774] >= 0xcc) {
        m[0x20de] = 0;
        this.sound_BBB4();
        m[0x20f3] = 6;
        const a = m[0x2032 + s8(m[0x2008])] & 3;
        let b = a;
        if (a) b = (a & 1) ? 0x70 : 0x90;
        this.w16(0x20b5, (b & 0x80 ? 0xff00 : 0) | b);
        let idx = 0;
        if (!b) { idx = m[0x20b0]; m[0x20b0]++; idx = ((idx - 1) << 1) & 0xff; }
        this.w16(0x20b7, this.rom16(0xf16a + s8(idx)));
        this.s6Fly_AD2A();
        return;
      }
    }
    // AC90: catching the next trapeze
    if (m[0x20de]) { this.s6Fly_AD2A(); return; }
    this.w16(0x20f9, (m[0x20da] & 3) === 2 ? 0x090c : 0x060c);
    let a = (m[0x24f6] - 0x34 + m[0x20f9]) & 0xff;
    m[0x20f9] = (m[0x20f9] << 1) & 0xff;
    if (a > m[0x20f9]) { this.s6Fly_AD2A(); return; }
    a = (m[0x24f4] - m[0x2774] - 1 + m[0x20fa]) & 0xff;
    m[0x20fa] = (m[0x20fa] << 1) & 0xff;
    if (a > m[0x20fa]) { this.s6Fly_AD2A(); return; }
    m[0x20b0] = 0;
    this.blinkStart_BB28();
    m[0x20db] = m[0x20da];
    let u = this.s6Bar_B5F5(m[0x20da]);
    m[u + 8] = (this.s6Sin(m[u + 2]) * m[u + 8]) >> 8;
    this.w16(u + 2, 0x5a00);
    u = this.s6Bar_B5F5(m[0x20da] - 1);
    a = (m[u + 4] << 1) & 0xff;
    const b = (s8((0x3c - m[u + 9]) & 0xff) >> 1) & 0xff;
    m[0x20f9] = b;
    a = (a - b) & 0xff;
    m[0x20f9] = a;
    this.w16(0x20aa, this.rom16(0xf00e + s8(a)));
    m[0x20a9] = 0;
    this.queueTask_6114(0x02, 0x00);
    const x = 0xf02e + s8((m[0x20f9] << 1) & 0xff);
    this.w16(0x271e, this.rom16(x));
    this.w16(0x270e, this.rom16(x + 2));
    m[0x20f4] = 0x30;
    m[0x20dd] = 7;
    this.s6Scroll_AD62();
  };

  G.s6Fly_AD2A = function () {
    const m = this.m;
    let d = (this.r16(0x20b7) + 0x15) & 0xffff;
    this.w16(0x20b7, d);
    d = (d + this.r16(0x2774)) & 0xffff;
    this.w16(0x2774, d);
    let a = d >> 8;
    m[0x2764] = a;
    a = (a + 0x10) & 0xff;
    m[0x2754] = a; m[0x2744] = a;
    a = (a - 0x10) & 0xff;
    if (a <= 0xd8) this.s6Scroll_AD62();
    else this.s6Fell_B98C(a);
  };

  /** Camera, trapezes and all the sprites of the stage. */
  G.s6Scroll_AD62 = function () {
    const m = this.m;
    this.s6Bars_B4D1();
    let u = this.s6Bar_B5F5(m[0x20da]);
    if (m[0x20b0]) {
      // flying
      const b5 = this.r16(0x20b5);
      let d = this.r16(0x2204) + b5;
      let c = d > 0xffff;
      this.w16(0x2204, d & 0xffff);
      if (!neg(m[0x20b5])) { if (c) m[0x2203]--; } else if (!c) m[0x2203]++;
      d = (this.r16(0x20d2) + b5) & 0xffff;
      this.w16(0x20d2, d);
      m[0x20d1] = neg(d >> 8) ? 0xff : 0;
      m[0x20f9] = (m[u + 9] + 8) & 0xff;
      m[0x20fa] = (m[0x20d2] - 0x34) & 0xff;
      const bb = (m[0x20fa] + m[0x20f9]) & 0xff;
      m[0x20f9] = (m[0x20f9] << 1) & 0xff;
      if (!(bb < m[0x20f9])) {
        if (neg(m[0x20fa])) {
          // reached the next trapeze's zone
          m[0x20de] = 0;
          m[0x20da]++;
          u = this.s6Bar_B5F5(m[0x20da] - 3);
          this.s6BarInit_B49A(u, m[0x20da] + 2);
          m[0x20f9] = (m[u + 9] << 1) & 0xff;
          u = this.s6Bar_B5F5(m[0x20da]);
          let b = (m[0x20d2] + m[0x20d4] + 0x10 + m[u + 9]) & 0xff;
          m[0x20d2] = b;
          m[0x20d1] = 0;
          if (!(m[0x20da] & 1)) {
            this.w16(0x20fb, u);
            b = (b + m[u + 9] + 0x4c) & 0xff;
            m[0x20fa] = b;
            u = this.s6Bar_B5F5(m[0x20da] + 1);
            b = (((m[u + 9] << 1) & 0xff) + m[0x20f9] + 4) & 0xff;
            m[0x20f9] = 0;
            d = (b + this.r16(0x20f9)) & 0xffff;
            d &= 0xfff8;
            this.w16(0x20f9, d);
            const dd = ((((-m[0x2203]) & 0xff) << 8) | m[0x2204]) - d;
            if ((dd & 0xffff) >= 0xfa00) {
              let v = 0x20e4;
              for (let x = v + 5; ; ) {
                if ((this.r16(v) << 16 >> 16) > (this.r16(x) << 16 >> 16)) v = x;
                x += 5;
                if (x !== 0x20ee) break;
              }
              this.w16(v, this.r16(0x20f9));
              const nb = (-((m[0x20fa] - m[0x2204]) & 0xf8)) & 0xff;
              this.w16(v + 3, ((nb << 2) + 0x341c) & 0xffff);
            }
            u = this.r16(0x20fb);
          }
        } else {
          // back to the previous one
          m[0x20de] = 0;
          m[0x20da]--;
          u = this.s6Bar_B5F5(m[0x20da] + 3);
          this.s6BarInit_B49A(u, m[0x20da] - 2);
          u = this.s6Bar_B5F5(m[0x20da]);
          const b = (m[0x20d2] - m[0x20d4] - 0x10 - m[u + 9]) & 0xff;
          m[0x20d2] = b;
          m[0x20d1] = neg(b) ? 0xff : 0;
        }
      }
      // AE53: world positions follow the camera
      for (const [lo, hi] of [[0x20e0, 0x20df], [0x20e5, 0x20e4], [0x20ea, 0x20e9], [0x20ef, 0x20ee]]) {
        const s = this.r16(lo) + b5;
        c = s > 0xffff;
        this.w16(lo, s & 0xffff);
        if (!neg(m[0x20b5])) { if (c) m[hi]++; } else if (!c) m[hi]--;
      }
    } else {
      // AEA6: hanging from the trapeze, the camera follows him
      m[0x20d1] = 0;
      let a = (0x34 - m[u + 47]) & 0xff;
      if (neg(a)) m[0x20d1]--;
      const b = a;
      a = (a - m[0x20d2]) & 0xff;
      const n1 = neg(a);
      m[0x20f9] = a;
      const sum = a + m[0x2204];
      m[0x2204] = sum & 0xff;
      m[0x20d2] = b;
      if (sum <= 0xff) { if (n1) m[0x2203]++; } else if (!n1) m[0x2203]--;
      // joystick: swing harder
      a = m[0x20d7] & 3;
      if (a) {
        const t = m[0x20d8] + 0x18;
        m[0x20d8] = t & 0xff;
        if (t > 0xff) {
          let f = m[u + 2] < 0x5a ? 1 : 0;
          m[0x20fa] = f;
          f = (m[u + 1] & 1) ^ f;
          m[0x20fa] = f;
          a = (((a - 1) & 0xff) ^ f) & 0xff;
          a = ((-((a << 1) & 0xff)) + 1) & 0xff;
          a = (a + m[u + 8]) & 0xff;
          if (a <= 0x5a) m[u + 8] = a;
        }
      }
      a = m[u + 31];
      m[0x2774] = a; m[0x2764] = a;
      a = (a + 0x10) & 0xff;
      m[0x2754] = a; m[0x2744] = a;
      a = (a + 0x0c) & 0xff;
      m[0x2714] = a; m[0x2704] = a;
      const h = (this.s6Sin(m[u + 2]) * m[u + 8]) >> 8;
      let bi = 0;
      if (h < 0x3c) { bi = 2; if (h < 0x1e) bi = 4; }
      if (!(m[u + 1] & 1)) bi = (0x0a - bi) & 0xff;
      const w = this.rom16(0xef34 + s8(bi));
      const wa = w >> 8, wb = w & 0xff;
      m[0x2776] = wa; m[0x2756] = wa;
      m[0x2766] = (wa + 0x10) & 0xff; m[0x2746] = (wa + 0x10) & 0xff;
      m[0x277e] = wb; m[0x276e] = (wb + 1) & 0xff; m[0x275e] = (wb + 2) & 0xff; m[0x274e] = (wb + 3) & 0xff;
      if (m[0x2203] === 6 && neg(m[0x20df])) {
        // the goal platform comes into view
        m[0x20fb] = (m[0x20d2] + m[u + 9]) & 0xff;
        this.w16(0x20fc, u);
        m[0x20dc] = (m[0x20da] + 2) & 0xff;
        u = this.s6Bar_B5F5(m[0x20dc]);
        let bb = (m[u + 9] << 1) & 0xff;
        u = this.s6Bar_B5F5(m[0x20da] + 1);
        bb = (bb + m[u + 9] + m[u + 9]) & 0xff;
        m[0x20fa] = 0;
        let d = (bb + this.r16(0x20fa) + 0x68) & 0xffff;
        d &= 0xfff8;
        this.w16(0x20df, d);
        const nb = (-(((d & 0xff) - m[0x2204]) & 0xf8)) & 0xff;
        this.w16(0x20e2, ((nb << 2) + 0x3411) & 0xffff);
        u = this.r16(0x20fc);
      }
      const sx = s8(m[0x20f9]) & 0xffff;
      for (const at of [0x20df, 0x20e4, 0x20e9, 0x20ee]) this.w16(at, (this.r16(at) + sx) & 0xffff);
      m[0x20dd]--;
      if (neg(m[0x20dd])) m[0x20dd]++;
    }
    this.s6Sprites_AFCC(u);
  };

  /** One rope column of sprites (16 points) from record U. */
  G.s6RopeColumn = function (u, x, d) {
    const m = this.m;
    this.w16(0x20f9, d);
    let p = u + 48;
    for (m[0x20fb] = 0x10; m[0x20fb]; m[0x20fb]--) {
      const b = m[--p];
      const s = ((s8(b) & 0xffff) + this.r16(0x20f9)) & 0xffff;
      m[x] = (s >> 8) ? 0 : s & 0xff;
      m[x - 2] = m[p - 16];
      x -= 16;
    }
  };

  G.s6RopeSprites = function (idx, y, d) {
    const u = this.s6Bar_B5F5(idx);
    if ((idx & 3) === 2) this.s6RopeCharlie_B3C6(y, u);
    else this.s6RopePlain_B3A5(d);
  };

  G.s6Sprites_AFCC = function (u) {
    const m = this.m;
    m[0x20d4] = m[u + 9];
    let da = m[0x20da];
    let d = 0x8000 | da;
    if (this.s6Visible(da)) { this.s6RopeColors_B600(0x24ef, u); d = this.r16(0x20d1); }
    this.s6RopeColumn(u, 0x24f6, d);
    this.s6RopeSprites(da, 0x24f0, 0x00f0);

    da = m[0x20da];
    u = this.s6Bar_B5F5(da + 1);
    m[0x20d5] = m[u + 9];
    d = 0x8000 | ((da + 1) & 0xff);
    if (this.s6Visible(da + 1)) {
      this.s6RopeColors_B600(0x25ef, u);
      d = (((m[0x20d4] + 0x10 + m[u + 9]) & 0xff) + this.r16(0x20d1)) & 0xffff;
    }
    this.s6RopeColumn(u, 0x25f6, d);
    this.s6RopeSprites((da + 1) & 0xff, 0x25f0, 0x01f0);

    da = m[0x20da];
    u = this.s6Bar_B5F5(da + 2);
    d = 0x8000 | ((da + 2) & 0xff);
    if (this.s6Visible(da + 2)) {
      this.s6RopeColors_B600(0x26ef, u);
      const t = ((m[0x20d5] << 1) & 0xff) + m[0x20d4] + 0x20;
      const s = (t & 0xff) + m[u + 9];
      d = ((((s > 0xff) ? 1 : 0) << 8 | (s & 0xff)) + this.r16(0x20d1)) & 0xffff;
    }
    this.s6RopeColumn(u, 0x26f6, d);
    this.s6RopeSprites((da + 2) & 0xff, 0x26f0, 0x02f0);

    if (((m[0x26f6] + 5) & 0xff) <= 0x0a && ((m[0x2606] + 5) & 0xff) <= 0x0a) {
      da = m[0x20da];
      u = this.s6Bar_B5F5(da - 1);
      d = 0x8000 | ((da - 1) & 0xff);
      if (this.s6Visible(da - 1)) {
        this.s6RopeColors_B600(0x26ef, u);
        m[0x20d6] = m[u + 9];
        const b = (-((m[0x20d4] + 0x10 + m[u + 9]) & 0xff)) & 0xff;
        d = ((0xff00 | b) + this.r16(0x20d1)) & 0xffff;
      }
      this.s6RopeColumn(u, 0x26f6, d);
      this.s6RopeSprites((da - 1) & 0xff, 0x26f0, 0x02f0);

      if (((m[0x25f6] + 5) & 0xff) <= 0x0a && ((m[0x2506] + 5) & 0xff) <= 0x0a) {
        da = m[0x20da];
        u = this.s6Bar_B5F5(da - 2);
        d = 0x8000 | ((da - 2) & 0xff);
        if (this.s6Visible(da - 2)) {
          this.s6RopeColors_B600(0x25ef, u);
          const t = ((m[0x20d6] << 1) & 0xff) + m[0x20d4] + 0x20;
          const s = (t & 0xff) + m[u + 9];
          const a = (~(s > 0xff ? 1 : 0)) & 0xff;
          const b = (-(s & 0xff)) & 0xff;
          d = (((a << 8) | b) + this.r16(0x20d1)) & 0xffff;
        }
        this.s6RopeColumn(u, 0x25f6, d);
        this.s6RopeSprites((da - 2) & 0xff, 0x25f0, 0x01f0);
      }
    }
    this.s6Platform_B1F4();
  };

  /** Goal platform and the nets (tiles), then misc sprites. */
  G.s6Platform_B1F4 = function () {
    const m = this.m;
    m[0x20f9] = 0;
    let u = this.r16(0x20e2);
    let d = this.r16(0x20df);
    let draw = !(d & 0x8000) && d < 0x130;
    if (draw && d >= 0x38) {
      d -= 0xf8;
      if (d < 0) draw = false;
      else m[0x20f9] = (~m[0x20f9]) & 0xff;
    }
    if (draw) {
      let b = (d & 0x38) >> 1;
      m[0x20fa] = b;
      b = (b >> 1) + m[0x20fa];
      let x = 0xf104 + b;
      let y = 0xf140;
      m[0x20fa] = 0;
      for (;;) {
        const c = this.rom8(x++) ^ m[0x20f9];
        if (c === 0) {
          this.w16(0x20fb, u);
          let yy = this.rom16(y);
          let a;
          while ((a = this.rom8(yy++))) m[u++] = a;
          u = this.r16(0x20fb);
        } else if (c === 0xff) {
          m[u] = 0x10;
          m[u + 1] = 0x10; m[u + 2] = 0x10;
          m[u + 3] = 0x10; m[u + 4] = 0x10;
          this.w16(u + 5, 0x8949);
          this.w16(u + 7, 0x5959);
          m[u + 11] = 0x60;
          this.w16(u + 9, (u & 0x20) ? 0x4b6b : 0x5b7b);
        }
        m[0x20fa]++;
        const a = m[0x20fa];
        if (a === 6) break;
        y = 0xf140 + a * 2;
        u += 32;
        if (u >= 0x3800) u = (u + 0xfc00) & 0xffff;
      }
    }
    // B289
    d = (this.r16(0x20df) - 0x18) & 0xffff;
    const pb = (d >> 8) ? 0 : d & 0xff;
    m[0x2736] = pb; m[0x2726] = pb;
    for (m[0x20fd] = 0x0a; ;) {
      const e = 0x20e4 + m[0x20fd];
      d = this.r16(e);
      let v = this.r16(e + 3);
      this.w16(0x20f9, d);
      m[0x20fb] = 0;
      let ok = !(d & 0x8000) && d < 0x130;
      if (ok && d >= 0x38) {
        d -= 0xf8;
        if (d < 0) ok = false;
        else m[0x20fb] = (~m[0x20fb]) & 0xff;
      }
      if (ok) {
        let b = (d & 0x38) >> 1;
        m[0x20fc] = b;
        b = (b >> 1) + m[0x20fc];
        let x = 0xf104 + b;
        let y = 0xf12e;
        for (m[0x20fc] = 6; m[0x20fc]; m[0x20fc]--) {
          const c = this.rom8(x++) ^ m[0x20fb];
          if (c === 0) {
            m[v] = this.rom8(y); m[v + 1] = this.rom8(y + 1); m[v + 2] = this.rom8(y + 2);
            m[v - 0x400] = 0x10; m[v - 0x3ff] = 0x10;
          } else if (c === 0xff) {
            m[v] = 0x60; m[v + 1] = 0x70; m[v + 2] = 0x61;
            m[v - 0x400] = 0x10; m[v - 0x3ff] = 0x10;
          }
          y += 3;
          v += 32;
          if (v >= 0x3800) v = (v + 0xfc00) & 0xffff;
        }
      }
      const t = m[0x20fd] - 5;
      m[0x20fd] = t & 0xff;
      if (t < 0) break;
    }
    // B31B: the net Charlie fell into shakes
    if (m[0x20f3]) {
      let e = 0x20e7;
      for (let a = 2; a; a--) {
        if (!m[e - 3] && !neg(m[e - 2])) break;
        e += 5;
      }
      u = (this.r16(e) + 0xfc00) & 0xffff;
      m[0x20f3]--;
      const a = m[0x20f3] ? 0x17 : 0x10;
      for (m[0x20f9] = 6; m[0x20f9]; m[0x20f9]--) {
        m[u] = a; m[u + 1] = a;
        u += 32;
        if (u >= 0x3400) u = (u + 0xfc00) & 0xffff;
      }
    }
    if (m[0x20f4]) {
      m[0x20f4]--;
      if (!m[0x20f4]) { this.w16(0x271e, 0xfe00); this.w16(0x270e, 0xfe00); }
    }
    // B369: audience heads scroll with the camera
    m[0x20f9] = 0;
    let x = 0x27e0;
    let a = (m[0x2204] + 0x68) & 0xff;
    m[x + 6] = a;
    a = (a + 0x10) & 0xff; m[x - 10] = a;
    a = (a + 0x10) & 0xff; m[x - 26] = a;
    for (;;) {
      a = m[x + 6];
      if (a >= 0xf0) break;
      m[0x20f9]++;
      x -= 16;
      if (x < 0x27c0) return;
    }
    let b = (m[0x2203] * 3 + m[0x20f9]) & 0xff;
    if (a >= 0xf8) b = (b - 3) & 0xff;
    m[x + 14] = this.rom8(0xefdd + s8(b));
  };

  // ------------------------------------------------------------ fall / death
  G.s6Fell_B98C = function (a) {
    const m = this.m;
    if (!neg((a + 0x14) & 0xff)) {
      m[0x277e] = 0x2d; m[0x276e] = 0x2e; m[0x275e] = 0xaf; m[0x274e] = 0xb0;
      m[0x2774] = 0; m[0x2764] = 0;
      m[0x2754] = 0x0e; m[0x2744] = 0x0e;
    } else {
      m[0x277e] = 0x31; m[0x276e] = 0x32; m[0x275e] = 0x33; m[0x274e] = 0x34;
      m[0x2774] = 0xd4; m[0x2764] = 0xd4;
      m[0x2754] = 0xe4; m[0x2744] = 0xe4;
    }
    m[0x27b4] = 0xaa; m[0x27a4] = 0xaa; m[0x2794] = 0xaa;
    m[0x2784] = 0xb2; m[0x2714] = 0xb2; m[0x2704] = 0xb2;
    m[0x27b6] = 0x30; m[0x27a6] = 0x40; m[0x2796] = 0x50;
    m[0x2786] = 0x90; m[0x2716] = 0xa0; m[0x2706] = 0xb0;
    m[0x27be] = 0x16; m[0x278e] = 0x16;
    m[0x27ae] = 0x17; m[0x271e] = 0x17;
    m[0x279e] = 0x18; m[0x270e] = 0x18;
    this.music_BC13();
    m[0x20b5] = 0; m[0x20b6] = 0;
    this.s6Scroll_AD62();
    m[0x20f8] = 0x80;
    m[0x2800] += 2;
  };

  G.s6Dead_BA30 = function () {
    const m = this.m;
    this.s6Scroll_AD62();
    m[0x20f8]--;
    if (m[0x20f8]) return;
    this.s6Restart_BA37();
  };

  G.s6Restart_BA37 = function () {
    const m = this.m;
    m[0x2208] = (m[0x20db] - m[0x20d9] + m[0x2208]) & 0xff;
    const a = m[0x2203];
    if (a) {
      if (a >= 7) m[0x2203] = 6;
      m[0x2203]--;
    }
    m[0x2006] += 2;
    m[0x2005] = 0;
  };

  /** Returns true when the rest of the frame is skipped. */
  G.s6Timer_BA59 = function () {
    const a = this.m[0x20f5];
    if (!a) return false;
    if (a === 1) return true;
    this.s6Restart_BA37();
    return false;
  };

  // ------------------------------------------------------------ goal
  G.s6GoalReached_B68B = function () {
    const m = this.m;
    for (let x = 0x26f6; x >= 0x2406; x -= 16) m[x] = 0;
    let x = 0x2770;
    m[x + 4] = 0x68; m[x - 12] = 0x68;
    m[x - 28] = 0x78; m[x - 44] = 0x78;
    m[x + 6] = 0x24; m[x - 26] = 0x24;
    m[x - 10] = 0x34; m[x - 42] = 0x34;
    this.w16(x + 14, 0x7620);
    this.w16(x - 2, 0x7720);
    this.w16(x - 18, 0x7e20);
    this.w16(x - 34, 0x7f20);
    x = 0x2730;
    this.w16(x + 4, 0x3cb0);
    m[x - 12] = 0x4c;
    const b = (0x2c - m[x + 6]) & 0xff;
    this.w16(x + 2, ((s8(b) & 0xffff) << 3) & 0xffff);
    m[x + 14] = 0x58;
    m[x - 2] = 0x59;
    m[x + 8] = 2;
    m[0x2454] = 0xaa; m[0x2444] = 0xaa; m[0x2434] = 0xaa;
    m[0x2424] = 0xb2; m[0x2414] = 0xb2; m[0x2404] = 0xb2;
    m[0x2456] = 0x60; m[0x2446] = 0x70; m[0x2436] = 0x80;
    m[0x2426] = 0xa8; m[0x2416] = 0xb8; m[0x2406] = 0xc8;
    for (let i = 0; i < 6; i++) this.w16(0x245e - i * 16, (0x10 + i) << 8);
    this.music_BC3F();
    m[0x2800]++;
  };

  G.s6Goal_B833 = function () {
    const m = this.m;
    m[0x287f] = 2;
    this.blinkStep_BB54();
    this.s6GoalTiles_B661();
    const w = this.rom16(0xf178 + (m[0x20f7] & 0x0e));
    m[0x245f] = w >> 8; m[0x244f] = w >> 8; m[0x243f] = w >> 8;
    m[0x242f] = w & 0xff; m[0x241f] = w & 0xff; m[0x240f] = w & 0xff;
    if (m[0x2738]) { this.s6GoalJump_B73D(); return; }
    if (!(m[0x20f7] & 0x1f)) {
      const x = 0x2470;
      m[x]++;
      if (m[x] & 1) { m[x + 14] = 0x55; m[x - 2] = 0x5d; } else { m[x + 14] = 0x5a; m[x - 2] = 0x7b; }
    }
    if (m[0x20f6] !== 1) { this.s6GoalB91A(); return; }
    m[0x20f7]++;
    if (!m[0x20f7]) { this.s6GoalB8F6(); return; }
    const a = m[0x20f7] & 0x7f;
    if (!a) { this.s6Crowd_B8C8(0xad); return; }
    if (a < 0x21) return;
    if (a === 0x21) { this.w16(0x20b7, 0xfc10); this.s6Crowd_B8C8(0xb1); }
    this.s6CrowdJump_B89C();
  };

  G.s6CrowdJump_B89C = function () {
    const m = this.m;
    let x = 0x2484;
    let d = (this.r16(0x20b7) + 0x15) & 0xffff;
    this.w16(0x20b7, d);
    d = (d + this.r16(x)) & 0xffff;
    this.w16(x, d);
    let a = d >> 8;
    for (m[0x20f9] = 2; m[0x20f9]; m[0x20f9]--) {
      for (let b = 0x0c; b; b--) { m[x] = a; m[x + 16] = a; x += 64; }
      x = (x + 0xfd20) & 0xffff;
      a = (a + 0x10) & 0xff;
    }
  };

  G.s6Crowd_B8C8 = function (a) {
    const m = this.m;
    let x = 0x248e;
    for (let i = 0; i < 4; i++) this.w16(x + i * 16, ((a + i) & 0xff) << 8);
    this.s6CrowdCopy_B8DA(x);
  };

  G.s6CrowdCopy_B8DA = function (x) {
    const m = this.m;
    for (m[0x20f9] = 4; m[0x20f9]; m[0x20f9]--) {
      const d = this.r16(x);
      for (m[0x20fa] = 0x0b; m[0x20fa]; m[0x20fa]--) { x += 64; this.w16(x, d); }
      x = (x + 0xfd50) & 0xffff;
    }
  };

  G.s6GoalB8F6 = function () {
    const m = this.m;
    this.s6Crowd_B8C8(0xad);
    this.w16(0x20b7, 0xfd60);
    let x = 0x2480, d = 0x0398;
    for (m[0x20f9] = 0x0c; m[0x20f9]; m[0x20f9]--) { this.w16(x, d); x += 64; d = (d - 0x4c) & 0xffff; }
    m[0x20f7] = 0xe0;
    m[0x20f6]++;
  };

  G.s6GoalB91A = function () {
    const m = this.m;
    if (neg(m[0x20f7])) {
      m[0x20f7]++;
      if (!m[0x20f7]) this.s6Crowd_B8C8(0x29);
      return;
    }
    this.s6CrowdJump_B89C();
    let x = 0x2486;
    for (m[0x20f9] = 0x0c; m[0x20f9]; m[0x20f9]--) {
      const d = (this.r16(x - 6) + this.r16(x)) & 0xffff;
      this.w16(x, d);
      let a = d >> 8;
      m[x + 32] = a;
      a = (a + 0x10) & 0xff;
      m[x + 16] = a; m[x + 48] = a;
      x += 64;
    }
    m[0x20f7]++;
    const a = m[0x20f7];
    if (a === 0x40) {
      if (!m[0x20f6]) { this.s6Crowd_B8C8(0xad); m[0x20f7] = 0; m[0x20f6]++; return; }
      m[0x2006]++;
      m[0x2005] = 0;
      return;
    }
    if (a & 7) return;
    const h = a >> 1;
    const u = 0xeeea + h;
    const b = h === 0x18 ? 0xc0 : 0;
    x = 0x248e;
    for (let i = 0; i < 4; i++) { m[x + i * 16] = this.rom8(u + i); m[x + i * 16 + 1] = b; }
    this.s6CrowdCopy_B8DA(x);
  };

  G.s6GoalJump_B73D = function () {
    const m = this.m;
    m[0x20f7]++;
    if (m[0x2738] !== 1) {
      const x = 0x2730;
      let d = (this.r16(x + 2) + this.r16(x + 6)) & 0xffff;
      this.w16(x + 6, d);
      m[x - 10] = d >> 8;
      d = (this.r16(x) + 0x15) & 0xffff;
      this.w16(x, d);
      d = (d + this.r16(x + 4)) & 0xffff;
      this.w16(x + 4, d);
      const a = ((d >> 8) + 0x10) & 0xff;
      m[x - 12] = a;
      if (a === 0x78) { m[x + 14] = 0x55; m[x - 2] = 0x5d; m[x + 8]--; }
      return;
    }
    m[0x2739]++;
    if (m[0x2739]) {
      const a = m[0x2739];
      if (a & 0x1f) return;
      if (a & 0x20) {
        m[0x273e] = 0x5a; m[0x272e] = 0x7b; m[0x277e] = 0x74; m[0x276e] = 0x75; m[0x275e] = 0x7c; m[0x274e] = 0x7d;
      } else {
        m[0x273e] = 0x55; m[0x272e] = 0x5d; m[0x277e] = 0x76; m[0x276e] = 0x77; m[0x275e] = 0x7e; m[0x274e] = 0x7f;
      }
      return;
    }
    // B7B2: the audience stands up
    let x = 0x2730;
    const u = 0x2470;
    m[u + 4] = m[x + 4]; m[u + 6] = m[x + 6];
    m[u - 12] = m[x - 12]; m[u - 10] = m[x - 10];
    this.w16(u + 14, 0x5520);
    this.w16(u - 2, 0x5d20);
    m[x + 8] = 0;
    m[u] = 0;
    x = 0x2484;
    m[x + 1] = 0;
    this.w16(0x20f9, 0x020c);
    let a = 0x68;
    const b = 0x44;
    for (;;) {
      m[x] = a; m[x + 2] = b - 0x10; m[x + 3] = 0;
      m[x + 16] = a; m[x + 18] = b; m[x + 19] = 0;
      x += 64;
      m[0x20fa]--;
      if (m[0x20fa]) continue;
      x = (x + 0xfd20) & 0xffff;
      a = (a + 0x10) & 0xff;
      m[0x20fa] = 0x0c;
      m[0x20f9]--;
      if (!m[0x20f9]) break;
    }
    this.s6Crowd_B8C8(0xad);
    this.w16(0x20b7, 0xff20);
    x = 0x2480;
    let d = 0xff58;
    for (m[0x20f9] = 0x0c; m[0x20f9]; m[0x20f9]--) { this.w16(x, d); x += 64; d = (d + 0x4c) & 0xffff; }
    m[0x20f7] = 0xe0;
    m[0x20f6] = 0;
    this.music_BC48();
  };
})(typeof window !== 'undefined' ? window : globalThis);
