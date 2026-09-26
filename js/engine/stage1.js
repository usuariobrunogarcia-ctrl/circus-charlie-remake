/*
 * Stage 1 - FIRE RING (Charlie rides a lion, jumps through burning rings
 * and over fire pots).
 *
 * Objects used by this stage:
 *   0x2400-0x24AF  podium / audience decorations
 *   0x24B0-0x256F  3 fire pots (4 sprites each, 64 byte records)
 *   0x2580         money bag / pot pointer
 *   0x25D0-0x264F  lion + Charlie (8 sprites)
 *   0x26D0-0x27AF  4 fire rings (3 sprites each, 48 byte records)
 *   0x27B0-0x27EF  distance marker ("10M" ... "90M")
 * Variables: $2203/$2204 camera page / position, <$B1> horizontal speed,
 *   <$B0> jumping, <$B5> vertical speed, <$B7> Charlie height.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;
  const s16 = (v) => (v << 16) >> 16;

  G.stage1_701E = function () {
    const st = this.m[0x2800];
    if (st === 0) this.s1Init_7030();
    else if (st === 1) this.s1Play_726D();
    else if (st === 2) this.s1Goal_7C98();
    else this.s1Dead_7E1F();
  };

  // lion, Charlie, rings, pots... initial positions and sprite codes
  G.s1Init_7030 = function () {
    const m = this.m;
    const set = (list, v) => { for (const a of list) m[a] = v & 0xff; };
    for (let x = 0x20b0; x < 0x20cc; x++) m[x] = 0;
    m[0x20bb] = m[0x2014];
    let a = m[0x2014] & 3;
    if (a === 3) a = 0;
    m[0x20c1] = a;
    m[0x20b7] = 0xd8;
    set([0x2644, 0x2634, 0x2624], 0xd0);
    set([0x2614, 0x2604, 0x25f4], 0xe0);
    set([0x2654, 0x2674, 0x2694, 0x26b4], 0x8c);
    set([0x2404, 0x26d4, 0x2434, 0x2704, 0x2464, 0x2734, 0x2494, 0x2764], 0x9c);
    set([0x2414, 0x26e4, 0x2444, 0x2714, 0x2474, 0x2744, 0x24a4, 0x2774], 0xac);
    set([0x2424, 0x26f4, 0x2454, 0x2724, 0x2484, 0x2754, 0x26c4], 0xbc);
    set([0x2664, 0x2684, 0x26a4], 0xcc);
    set([0x25d4, 0x25e4], 0xa4);
    set([0x24b4, 0x24d4, 0x24f4, 0x2514, 0x2534, 0x2554], 0xd2);
    set([0x24c4, 0x24e4, 0x2504, 0x2524, 0x2544, 0x2564, 0x2784], 0xe2);
    set([0x27b4, 0x27a4, 0x2794], 0x88);
    m[0x2584] = 0xd2;
    m[0x2574] = 0xe2;
    set([0x27e4, 0x27d4, 0x27c4], 0xf4);
    set([0x2646, 0x2616], 0x25);
    set([0x2636, 0x2606], 0x35);
    set([0x2626, 0x25f6], 0x45);
    m[0x27e6] = 0x28; m[0x27d6] = 0x38; m[0x27c6] = 0x48;
    m[0x2703] = 0x10; m[0x2733] = 0x20; m[0x2763] = 0x30;
    this.s1Codes(0xef0a);
    set([0x26de, 0x270e, 0x273e, 0x276e], 0xe4);
    set([0x26ee, 0x271e, 0x274e], 0xe5);
    set([0x26fe, 0x272e, 0x275e, 0x277e], 0xe6);
    set([0x265e, 0x267e, 0x269e, 0x26be], 0xe7);
    set([0x266e, 0x268e, 0x26ae, 0x26ce], 0xe8);
    set([0x240e, 0x243e, 0x246e, 0x249e], 0xe9);
    set([0x241e, 0x244e, 0x247e], 0xea);
    set([0x242e, 0x245e, 0x248e, 0x24ae], 0xeb);
    m[0x25de] = 0x16; m[0x25df] = 0x22;
    set([0x24de, 0x251e, 0x255e], 0xec);
    set([0x24be, 0x24fe, 0x253e], 0xed);
    set([0x24ee, 0x252e, 0x256e], 0xee);
    set([0x24ce, 0x250e, 0x254e], 0xef);
    m[0x278e] = 0x14; m[0x278f] = 0x21;
    for (const x of [0x27be, 0x27ae, 0x279e]) { m[x] = 0x3f; m[x + 1] = 0x20; }
    m[0x258e] = 0xfe; m[0x257e] = 0xfe;
    const t = 0xef7d + s8((m[0x2203] * 3) & 0xff);
    m[0x27ee] = this.rom8(t); m[0x27de] = this.rom8(t + 1); m[0x27ce] = this.rom8(t + 2);
    this.w16(0x20c6, 0x2530);
    this.w16(0x20c8, 0x24f0);
    m[0x20c2] = 0x10;
    m[0x20bc] = 0x10;
    if (m[0x220e] > 1 || ((m[0x2203] - 2) & 0xff) < 3) { m[0x24b0] = 0x01; m[0x24b1] = 0x40; }
    this.bonusInit_BC5A();
    if (m[0x2203]) this.music_BC35(); else this.music_BBF1();
    m[0x2800]++;
  };

  // Charlie + lion sprite codes (6 bytes)
  G.s1Codes = function (x) {
    const m = this.m;
    m[0x264e] = this.rom8(x); m[0x263e] = this.rom8(x + 1);
    m[0x262e] = this.rom8(x + 2); m[0x261e] = this.rom8(x + 3);
    m[0x260e] = this.rom8(x + 4); m[0x25fe] = this.rom8(x + 5);
  };

  // joystick direction -> speed (table 0xF172); also returns the input address
  G.s1Joystick_7E46 = function () {
    const x = 0x2032 + s8(this.m[0x2008]);
    const i = (this.m[x] & 3) << 1;
    return { d: this.rom16(0xf172 + i), x };
  };

  // 3000 points prize (object reached, never happens in stage 1)
  G.s1Prize = function (b, d) {
    const m = this.m;
    m[0x20a9] = b;
    m[0x20aa] = d >> 8; m[0x20ab] = d & 0xff;
    this.queueTask_6114(0x02, b);
    this.blinkStart_BB28();
  };

  G.s1Play_726D = function () {
    const m = this.m;
    this.blinkStep_BB54();
    this.demoInput_691D();
    this.bonusTick_BCA8();
    const ba = m[0x20ba];
    if (ba === 1) return;                         // PULS X,PC in 7E3C
    if (ba) this.s1Restart_7E23();
    this.backgroundAnim_BE86();

    // money bag (unused in this stage version)
    if (m[0x220b] === 1) {
      const x = 0x2580;
      if (((m[x + 6] - 0x26) & 0xff) < 0x20 && ((m[x + 4] + 0x0c - m[0x20b7]) & 0xff) < 0x14) {
        m[x + 3] = 0x30;
        m[x - 13] = 0x30; m[x - 12] = m[x + 4];
        m[x + 14] = 0x16; m[x + 15] = 0x22;
        m[x - 2] = 0x13; m[x - 1] = 0x21;
        m[0x220b]++;
        this.sound_BBE5();
        this.s1Prize(0x00, 0x3000);
      }
    }

    // collision with the rings
    let u = 0x26d0;
    let dead = false;
    for (;;) {
      let a = (m[u + 6] - 0x40) & 0xff;
      if (a & 0x80) a = (-a) & 0xff;
      if (a < 0x0e) {
        const dist = a;
        a = m[0x2644];
        if (u === this.r16(0x20bf)) {
          // special ring (never used)
          if (m[0x220a] !== 3 && a < 0xa8) {
            m[u + 14] = 0xfe; m[u - 0x2c2] = 0xfe; m[u + 30] = 0xfe; m[u - 0x2b2] = 0xfe;
            m[0x220a]++;
            m[0x2200]++;
            this.queueTask_6114(0x03, m[0x220a] - 1);
            this.sound_BBE9();
          }
          break;
        }
        if (u === 0x2760) a = (a + 0x10) & 0xff;
        a = (a - 0xb6) & 0xff;
        if (!(a & 0x80)) {
          if (((a + dist) & 0xff) <= 0x1c) dead = true;
          break;
        }
        if (u !== 0x2760) break;
        // passed through the small ring with the money bag
        const w = 0x25e0;
        if (!(m[w] & 0x80)) break;
        m[w] = 0x30;
        const t = 0xeff8 + s8((m[w + 1] << 1) & 0xff);
        m[w + 14] = this.rom8(t); m[w + 15] = this.rom8(t + 1);
        m[0x20aa] = ((m[w + 1] + 1) << 4) & 0xff; m[0x20ab] = 0; m[0x20a9] = 0;
        this.queueTask_6114(0x02, 0x00);
        this.sound_BBC4();
        m[w + 1]++;
        if (m[w + 1] >= 5) m[w + 1]--;
        break;
      }
      u += 48;
      if (u > 0x2760) break;
    }
    if (dead) { this.s1Death_7DA5(); return; }

    // collision with the fire pots
    for (u = 0x24b0; u < 0x2570; u += 64) {
      if (((m[u + 6] - 0x29) & 0xff) < 0x2e && m[0x20b7] >= 0xce) { this.s1Death_7DA5(); return; }
    }

    let lbl = 0x74b0;
    if (m[0x20b0]) {
      // in the air: gravity
      let v = (this.r16(0x20b5) + 0x001c) & 0xffff;
      this.w16(0x20b5, v);
      const y = (v + this.r16(0x2644)) & 0xffff;
      m[0x2ffe] = y >> 8; m[0x2fff] = y & 0xff;
      const pg = m[0x2203], fine = m[0x2204];
      if (pg > 7 || (pg === 7 && fine >= 0x28)) {
        if ((y >> 8) >= 0xc5) { this.s1Goal_7B38(); return; }
      }
      this.w16(0x2644, y);
      let a = y >> 8;
      m[0x2634] = a; m[0x2624] = a;
      a = (a + 0x10) & 0xff;
      m[0x2614] = a; m[0x2604] = a; m[0x25f4] = a;
      a = (a - 8) & 0xff;
      m[0x20b7] = a;
      if (a >= 0xd4) {
        const j = this.s1Joystick_7E46();
        this.w16(0x2243, j.d);
        if (!((((~m[j.x]) & 0xff) | m[j.x + 3]) & 0x10)) m[0x2246] = 1;
      }
      if (m[0x20b7] !== 0xd8) lbl = 0x7583;
      else {
        // landed
        this.s1Codes(0xef0a);
        m[0x20b3] = m[0x2204];
        m[0x20b4] = 0;
        m[0x20b0] = 0;
        const sp = m[0x20b1];
        if (sp & 0x80) lbl = 0x7454;
        else if (sp === 0) lbl = 0x74b0;
        else {
          if (!m[0x220a] && m[0x2203]) {
            for (let w = 0x26d9; w <= 0x2769; w += 48) {
              if (m[w]) continue;
              if ((m[w - 3] - 0x40) & 0x80) continue;
              m[0x220a]++;
              break;
            }
          }
          lbl = 0x74b0;
          if (!m[0x220b]) {
            const w = 0x2580;
            m[w + 2] = (m[w + 2] - 1) & 0xff;
            if (!m[w + 2]) {
              m[0x220b]++;
              m[w + 14] = this.rom8(0xfa44); m[w + 15] = this.rom8(0xfa45);
              m[w - 2] = 0x15; m[w - 1] = 0x22;
              m[w + 7] = 0xfb; m[w + 8] = 0xa0;
              m[w + 9] = 0;
              m[w - 13] = 0x30;
              this.sound_BBE5();
              this.s1Prize(0x00, 0x0800);
            }
          }
        }
      }
      if (lbl === 0x7454) {
        // points for the rings / pots jumped
        let n = 0;
        for (let w = 0x26d9; w <= 0x2769; w += 48) {
          if (!m[w]) continue;
          if (!((m[w - 3] - 0x40) & 0x80)) continue;
          if (((w - 9) & 0xffff) === this.r16(0x20bf)) continue;
          n++;
        }
        const w = 0x2780;
        let extra = 0;
        const p = this.r16(w + 1);
        if (p && m[p] < 0x40) extra = 2;
        m[0x2fff] = extra;
        if (n) this.s1Prize(0x00, (((n + extra) & 0xff) << 8));
        else if (extra) {
          if (m[0x2203] >= 7) m[0x20be]++;
          this.sound_BBC4();
          m[w] = 0x30;
          this.s1Prize(0x00, 0x0500);
        }
        lbl = 0x74b0;
      }
    }

    if (lbl === 0x74b0) {
      this.w16(0x20b1, this.r16(0x2243));
      let jump = m[0x2246] === 1;
      if (!jump) {
        const j = this.s1Joystick_7E46();
        this.w16(0x20b1, j.d);
        jump = !((((~m[j.x]) & 0xff) | m[j.x + 3]) & 0x10);
        if (!jump) {
          // walking animation
          let x = 0xef0a;
          let a = m[0x20b1];
          if (a) {
            a = (m[0x20b3] - m[0x2204] + 7) & 0xff;
            if (a < 0x12) { lbl = 0x7583; }
            else {
              let b = 0xf5;
              a = (a - 7) & 0xff;
              if (a & 0x80) { x += 18; b = 7; }
              m[0x20b3] = (b + m[0x20b3]) & 0xff;
              a = m[0x20b4] + 1;
              if (a >= 3) a = 0;
            }
          }
          if (lbl !== 0x7583) {
            m[0x20b4] = a;
            x += s8((a << 1) & 0xff);
            x += s8((a << 2) & 0xff);
            this.s1Codes(x);
            lbl = 0x7583;
          }
        }
      }
      if (jump) {
        m[0x2246] = 0;
        m[0x20b0]++;
        this.w16(0x20b5, 0xfc80);
        this.s1Codes(0xef16);
        this.sound_BBBC();
        for (let w = 0x26d9; w <= 0x2769; w += 48) {
          m[w] = 0;
          if (!((m[w - 3] - 0x40) & 0x80)) m[w]++;
        }
        m[0x2780] = 0; m[0x2781] = 0; m[0x2782] = 0;
        for (let w = 0x24b6; w < 0x2576; w += 64) {
          if (((m[w] - 0x40) & 0xff) < 0x60) { this.w16(0x2781, w); break; }
        }
        const x = 0x2580;
        m[x + 2] = 0;
        if (((m[x + 6] - 1) & 0xff) < 0x40) m[x + 2]++;
        lbl = 0x7583;
      }
    }

    // move the camera
    this.s1Scroll_7583();
    this.s1RingTimer_7765();
    this.s1PotTimer_785C();
    for (u = 0x26d0; u <= 0x2760; u += 48) if (m[u]) this.s1Ring_7697(u);
    this.s1Pots_78AE();
  };

  G.s1Scroll_7583 = function () {
    const m = this.m;
    const d = this.r16(0x20b1);
    if (d === 0) {
      if (!m[0x20b0]) this.s1Codes(0xef0a);
      return;
    }
    let digit = null;                              // [s2, high byte] when a marker digit may change
    if (d & 0x8000) {
      const r = this.r16(0x2204) + d;
      this.w16(0x2204, r & 0xffff);
      if (r > 0xffff) digit = [0x00, 0x58, (r >> 8) & 0xff];
      else m[0x2203]++;
    } else {
      if (!m[0x2203]) return;
      const r = this.r16(0x2204) + d;
      this.w16(0x2204, r & 0xffff);
      if (r <= 0xffff) digit = [0xfd, 0x48, (r >> 8) & 0xff];
      else m[0x2203]--;
    }
    if (digit) {
      // which digit sprite of the "xxM" marker is being crossed
      let s1 = 0, a = (digit[2] + digit[1]) & 0xff, t = a - 0x10, ok = true;
      a = t & 0xff;
      if (t >= 0) {
        s1++;
        t = a - 0x10; a = t & 0xff;
        if (t >= 0) { if (a >= 2) ok = false; else s1++; }
      }
      if (ok) {
        const x = 0x27ce + s8((s1 << 4) & 0xff);
        const i = ((m[0x2203] * 3) + 2 + digit[0] - s1) & 0xff;
        m[x] = this.rom8(0xef7d + s8(i));
      }
    }
    // 761E: distance marker position
    let p = (m[0x2204] + 0x28) & 0xff;
    m[0x27e6] = p; p = (p + 0x10) & 0xff; m[0x27d6] = p; p = (p + 0x10) & 0xff; m[0x27c6] = p;
    if (m[0x2203] !== 7) return;
    // the podium (drawn with tiles) scrolls in
    const saved = m[0x2204];
    let b = saved;
    if (b < 0xf0 && b >= 0xb0) {
      b = ((b & 0xf8) - 0xb0) & 0xff;
      let aa = b;
      b = (b << 1) & 0xff;
      const x = (0x36fc + s8(b) + s8(b)) & 0xffff;
      aa >>= 2;
      aa = ((aa >> 1) + aa) & 0xff;
      const u = 0xf1e3 + s8(aa);
      m[x] = this.rom8(u); m[x + 1] = this.rom8(u + 1); m[x + 2] = this.rom8(u + 2);
    }
    b = saved;
    if (b < 0xc0) return;
    b = (((b & 0xf8) - 0xc0) << 1) & 0xff;
    const x = (0x36fc + s8(b) + s8(b)) & 0xffff;
    m[x] = 0x70; m[x + 1] = 0x70; m[x + 2] = 0x70;
  };

  // speed of the objects relative to the camera
  G.s1RelSpeed = function () {
    return this.m[0x2203] ? this.r16(0x20b1) : 0;
  };

  G.s1Ring_7697 = function (u) {
    const m = this.m;
    let d = (this.s1RelSpeed() - 0x80) & 0xffff;
    let r;
    if (d & 0x8000) {
      r = d + this.r16(u + 6);
      if (r <= 0xffff) { this.s1RingGone_76E4(u); return; }
    } else {
      r = d + this.r16(u + 6);
      if (r > 0xffff) { this.s1RingGone_76FC(u); return; }
    }
    this.w16(u + 6, r & 0xffff);
    this.s1RingY_7749(u, (r >> 8) & 0xff);
    if (u === this.r16(0x20bf)) return;
    m[u + 8] = (m[u + 8] - 1) & 0xff;
    if (m[u + 8]) return;
    m[u + 8] = 3;
    let a = m[0x2014] & 3;
    if (!a) a = 3;
    a += 2;
    // flame colours of the 8 ring sprites
    let x = 0xf0b4 + s8(m[u + 3]);
    for (let i = 0; i < 8; i++, x += 2) m[this.rom16(x)] = a;
  };

  G.s1RingGone_76E4 = function (u) {
    const m = this.m;
    m[0x20c4] = 0;
    m[0x20bd] = 0;
    if (u >= 0x2760) {
      m[0x20bd]++;
      if (m[0x25ee] === 0xfc) m[0x220c]++;
    }
    this.s1RingGone_7716(u);
  };

  G.s1RingGone_76FC = function (u) {
    const m = this.m;
    m[0x20c2] = 0;
    m[0x2208] = (m[0x2208] - 1) & 0xff;
    const a = m[0x220a];
    if (a > 2) { this.s1RingGone_7716(u); return; }
    if (a < 2) { this.s1RingClear_7742(u); return; }
    if (!m[0x20bf]) { this.s1RingClear_7742(u); return; }
    if (u === this.r16(0x20bf)) m[0x220a]--;
    this.s1RingGone_7716(u);
  };

  G.s1RingGone_7716 = function (u) {
    const m = this.m;
    if (u === this.r16(0x20bf)) {
      m[u + 4] = 0x9c; m[u - 0x2cc] = 0x9c;
      m[u + 20] = 0xac; m[u - 0x2bc] = 0xac;
      m[0x20bf] = 0; m[0x20c0] = 0;
      let y = 0xf0b4 + s8(m[u + 3]);
      let a = 0xe4;
      do { const x = this.rom16(y); y += 2; m[x - 1] = a; a++; } while (a < 0xec);
    }
    this.s1RingClear_7742(u);
  };

  G.s1RingClear_7742 = function (u) {
    const m = this.m;
    m[u] = 0; m[u + 6] = 0; m[u + 7] = 0;
    this.s1RingY_7749(u, 0);
  };

  G.s1RingY_7749 = function (u, a) {
    const m = this.m;
    let x = 0xf074 + s8(m[u + 3]);
    const put = () => { m[this.rom16(x)] = a; x += 2; };
    put(); put(); put();
    a = (a - 8) & 0xff;
    put(); put();
    a = (a - 8) & 0xff;
    put(); put(); put();
  };

  // new rings appear at a rate depending on the difficulty
  G.s1RingTimer_7765 = function () {
    const m = this.m;
    let d = (this.s1RelSpeed() - 0x80) & 0xffff;
    if (!(d & 0x8000)) { this.w16(0x20c2, (d + this.r16(0x20c2)) & 0xffff); return; }
    if (m[0x2203] >= 7 && m[0x20be] < 5) { this.w16(0x20c2, (d + this.r16(0x20c2)) & 0xffff); return; }
    let r = d + this.r16(0x20c2);
    if (r > 0xffff) { this.w16(0x20c2, r & 0xffff); return; }
    let b = 0x10;
    if (m[0x2022]) {
      const a = (m[0x202f] & 0x60) >> 1;
      b = ((((m[0x220e] - 1) & 0xff) << 4) + a) & 0xff;
    }
    b = (b + m[0x2208]) & 0xff;
    if (b >= 0x68) b = (b & 7) + 0x60;
    const a = this.rom8(0xf82a + s8(b));
    b = (b + m[0x20bb]) & 0xff;
    if (!(b & 3)) {
      if (m[0x20bc] >= 0x60) { this.s1BigRing_7828(); return; }
      m[0x20bb]++;
    }
    m[0x20c2] = a; m[0x20c3] = 0;
    m[0x20bc] = a;
    m[0x2208]++;
    const u = this.s1FreeRing_788F();
    if (u >= 0x2760) return;
    m[u + 6] = 0xff; m[u + 7] = 0x80;
    if (m[0x220a] !== 1) return;
    // ring carrying the money bag (never used)
    m[0x220a]++;
    this.w16(0x20bf, u);
    const y = 0xf0b4;
    let aa = (m[u + 3] + 6) & 0xff;
    let x = this.rom16(y + s8(aa));
    m[x - 1] = 0xfe;
    aa = (aa + 2) & 0xff;
    x = this.rom16(y + s8(aa));
    m[x - 1] = 0xfe;
    m[u - 0x2a2] = 0xfe; m[u + 46] = 0xfe;
    let c = this.rom8(0xef3b);
    m[u + 14] = c; m[u + 15] = 0x80;
    c++; m[u - 0x2c2] = c; m[u - 0x2c1] = 0x80;
    c++; m[u + 30] = c; m[u + 31] = 0x80;
    c++; m[u - 0x2b2] = c; m[u - 0x2b1] = 0x80;
    m[u + 4] = 0x90; m[u - 0x2cc] = 0x90;
    m[u + 20] = 0xa0; m[u - 0x2bc] = 0xa0;
  };

  G.s1BigRing_7828 = function () {
    const m = this.m;
    const u = 0x2760;
    m[u] = 1; m[u + 8] = 1;
    m[u + 6] = 0xff; m[u + 7] = 0x80;
    let a = 0x60;
    if (m[0x220e] <= 1) a = m[0x2014] | 0x80;
    m[0x20c2] = a; m[0x20c3] = 0;
    m[0x20bc] = a;
    m[0x2208]++;
    m[0x25e0] = 0xff;
    m[0x25ee] = 0xfc; m[0x25ef] = 0x00;
  };

  G.s1FreeRing_788F = function () {
    const m = this.m;
    let u = 0x26d0;
    for (; u < 0x2760; u += 48) if (!m[u]) break;
    if (u >= 0x2760) return u;
    m[u]++; m[u + 6]++; m[u + 8] = 1;
    return u;
  };

  G.s1PotTimer_785C = function () {
    const m = this.m;
    const d = ((((~this.s1RelSpeed()) & 0xffff) + 0x81) & 0xffff);
    if (!(d & 0x8000)) { this.w16(0x20c4, (d + this.r16(0x20c4)) & 0xffff); return; }
    const r = d + this.r16(0x20c4);
    if (r > 0xffff) { this.w16(0x20c4, r & 0xffff); return; }
    for (let u = 0x26d6; u <= 0x2766; u += 48) if (((m[u] - 1) & 0xff) < 0x40) return;
    if (m[0x20bd]) {
      m[0x20bd] = 0;
      const u = 0x2760;
      m[u]++; m[u + 6]++; m[u + 8] = 1;
      return;
    }
    this.s1FreeRing_788F();
  };

  // ------------------------------------------------------------ fire pots
  G.s1Pots_78AE = function () {
    const m = this.m;
    for (let u = 0x24b0; u < 0x2570; u += 64) {
      const a = m[u];
      if (!a) continue;
      if (a === 1) this.s1PotWait_795E(u); else this.s1PotMove_79D3(u);
    }
    let go = false;
    if (m[0x20b1] & 0x80) {
      const pg = m[0x2203], b = m[0x2204];
      if (b < 2 && (m[0x220e] > 1 || ((pg - 2) & 0xff) < 3)) {
        if (!(m[0x24b0] | m[0x24f0] | m[0x2530])) {
          m[0x24b0] = 0x01; m[0x24b1] = 0x40;
          go = true;
        }
      }
    }
    if (!go) {
      const pg = m[0x2203];
      let b = m[0x2204];
      if (pg >= 6) {
        let x = 0x20c8;
        let u = this.r16(x);
        let act = 0;
        b = (b - 4) & 0xff;
        if (b < 2) act = 1;
        else {
          b = (b - 2) & 0xff;
          if (b < 2) act = 2;
          else {
            b = (b - 2) & 0xff;
            if (b < 2) act = 3;
            else {
              x -= 2;
              u = this.r16(x);
              b = (b - 0x54) & 0xff;
              if (b < 2) act = 1;
              else {
                b = (b - 2) & 0xff;
                if (b < 2) act = 2;
                else if (b < 4) act = 3;
              }
            }
          }
        }
        if (act === 3) {
          let w = 0x24b0;
          for (;;) {
            if (!m[w]) break;
            w += 64;
            if (w !== 0x24f0) break;
          }
          this.w16(x, w);
        } else if (act === 2) {
          m[u] = 0; m[u + 1] = 0; m[u + 6] = 0; m[u + 22] = 0; m[u + 38] = 0; m[u + 54] = 0;
        } else if (act === 1) {
          m[u] = 2; m[u + 1] = 0; m[u + 8] = 1;
        }
      }
    }
    this.s1Misc_7A61();
  };

  G.s1PotWait_795E = function (u) {
    const m = this.m;
    const d = this.r16(0x20b1);
    if (!(d & 0x8000)) {
      const r = d + this.r16(u + 1);
      if (r > 0xffff) { this.s1PotGone_7A55(u); return; }
      this.w16(u + 1, r & 0xffff);
      return;
    }
    if (!m[0x2203]) return;
    const r = d + this.r16(u + 1);
    if (r > 0xffff) { this.w16(u + 1, r & 0xffff); return; }
    if (m[0x2209] === m[0x20c1]) this.w16(0x2580, u + 6);
    m[u]++;
    m[u + 8] = 1;
    let a = 8;
    if (m[0x2022]) {
      a = (m[0x202f] & 0x60) >> 2;
      a = (a + ((((m[0x220e] - 1) & 0xff) << 3) & 0xff)) & 0xff;
    }
    a = (a + m[0x2209]) & 0xff;
    if (a >= 0x34) a = (a & 3) + 0x30;
    const b = this.rom8(0xf892 + s8(a));
    m[0x2ffe] = 0; m[0x2fff] = b;
    const dd = ((m[0x2203] << 8) | ((~m[0x2204]) & 0xff)) + b;
    if ((dd & 0xffff) < 0x05f8) {
      let x = u + 64;
      if (x >= 0x2570) x = 0x24b0;
      m[x]++;
      m[x + 1] = b;
      m[x + 2] = 0;
    }
    m[0x2209]++;
  };

  G.s1PotMove_79D3 = function (u) {
    const m = this.m;
    const d = this.r16(0x20b1);
    if (d !== 0) {
      if (!(d & 0x8000) && !m[0x2203]) return;
      const r = (d + this.r16(u + 6)) & 0xffff;
      const a = r >> 8;
      if (a < 2) { this.s1PotOff_7A09(u); return; }
      this.w16(u + 6, r);
      m[u + 22] = a;
      m[u + 38] = (a - 0x10) & 0xff;
      m[u + 54] = (a - 0x10) & 0xff;
    }
    m[u + 8] = (m[u + 8] - 1) & 0xff;
    if (m[u + 8]) return;
    m[u + 8] = 5;
    let a = m[0x2014] & 3;
    if (!a) a = 3;
    a += 2;
    m[u + 15] = a; m[u + 47] = a;
  };

  G.s1PotOff_7A09 = function (u) {
    const m = this.m;
    if (m[0x2203] >= 6 && !(m[0x2204] & 0x80)) return;
    m[u + 6] = 0; m[u + 7] = 0; m[u + 22] = 0;
    m[u + 38] = 0xf0; m[u + 54] = 0xf0;
    if (!m[0x2203] || (m[0x20b1] & 0x80)) { this.s1PotGone_7A55(u); return; }
    m[u]--;
    let x = u + 64;
    if (x >= 0x2570) x = 0x24b0;
    if (m[x] === 2) return;
    m[x] = 0;
    m[0x2209] = (m[0x2209] - 1) & 0xff;
    if (m[0x2209] !== m[0x20c1]) return;
    this.s1BagOff_7A4B();
  };

  G.s1BagOff_7A4B = function () {
    const m = this.m;
    m[0x2580] = 0; m[0x2586] = 0; m[0x2576] = 0;
  };

  G.s1PotGone_7A55 = function (u) {
    const m = this.m;
    m[u] = 0; m[u + 1] = 0;
    if (u + 6 === this.r16(0x2580)) this.s1BagOff_7A4B();
  };

  G.s1Misc_7A61 = function () {
    const m = this.m;
    let u = 0x2780;
    m[u + 6] = 0;
    if (m[u]) {
      m[u]--;
      const a = (m[this.r16(u + 1)] - 8) & 0xff;
      if (!(a & 0x80)) m[u + 6] = a;
    }
    u = 0x25e0;
    m[u + 6] = 0; m[u - 10] = 0;
    if (m[u]) {
      if (m[u] & 0x80) m[u + 6] = (m[0x2766] - 8) & 0xff;
      else {
        m[u]--;
        const a = (m[0x2766] - 0x0b) & 0xff;
        m[u + 6] = a;
        m[u - 10] = (a + 0x0f) & 0xff;
      }
    }
    // sprites of the pots visible at the top (copy of their codes)
    let b = 3;
    let x = 0x26b6;
    u = 0x27b6;
    for (;;) {
      let a = m[x];
      if (((a - 0xeb) & 0xff) > 0x19) {
        m[u] = a;
        u -= 16;
        b--;
        if (!b) break;
      }
      x -= 32;
      if (x < 0x2656) break;
    }
    for (; b; b--) { m[u] = 0; u -= 16; }
    // money bag following a pot
    u = 0x2580;
    if (!m[u]) return;
    const a220b = m[0x220b];
    let bb = m[this.r16(u)];
    let cnt;
    if (a220b <= 1) {
      bb = (bb - 8) & 0xff;
      m[u + 6] = bb; m[u - 10] = bb;
      if (!m[0x220b]) return;
      if (m[u + 4] > 0xd6) return;
      if (m[u + 4] !== 0xd6) { m[u + 14] = 0xfe; m[u + 15] = 0x00; }
      let dd = (this.r16(u + 7) + 0x1c) & 0xffff;
      this.w16(u + 7, dd);
      dd = (dd + this.r16(u + 4)) & 0xffff;
      this.w16(u + 4, dd);
      if (m[u + 15]) {
        let a = m[u + 9] + 1;
        if (a >= 0x18) a = 0;
        m[u + 9] = a;
        if (!(a & 1)) {
          const t = s8(a) >> 1;
          const idx = (t + a) & 0xff;
          const p = 0xfa44 + s8(idx);
          m[u + 14] = this.rom8(p); m[u + 15] = this.rom8(p + 1);
        }
      }
      cnt = 1;
      u -= 16;
    } else {
      bb = (bb + 0x0a) & 0xff;
      m[u + 6] = bb;
      m[u - 10] = (bb - 0x0f) & 0xff;
      cnt = 2;
    }
    do {
      if (m[u + 3]) {
        m[u + 3]--;
        if (!m[u + 3]) { m[u + 14] = 0xfe; m[u + 15] = 0; }
      }
      u -= 16;
      cnt--;
    } while (cnt);
  };

  // ------------------------------------------------------------ goal
  G.s1Goal_7B38 = function () {
    const m = this.m;
    for (let x = 0x27b6; x >= 0x2406; x -= 16) m[x] = 0;
    m[0x20ca] = 0;
    m[0x2500] = 1;
    m[0x25e0] = 0;
    if (!m[0x220c]) {
      // perfect run: bonus prize
      m[0x20ca] = 0x80;
      const x = 0x2580;
      m[x - 128]++;
      m[x - 124] = 0xd4; m[x - 108] = 0xd4;
      m[x + 84] = 0x6f; m[x + 100] = 0x5f; m[x + 116] = 0x5f;
      m[x - 122] = 0x29; m[x - 106] = 0x39;
      m[x + 110] = 0x44; m[x + 111] = 0x20;
      m[x + 126] = 0x45; m[x + 127] = 0x20;
      m[x + 94] = 0xfc; m[x + 95] = 0x00;
      m[x - 114] = 0xfe; m[x - 113] = 0x00;
      m[x - 98] = 0xfe; m[x - 97] = 0x00;
      m[x + 96] = 2;
      m[0x20a9] = 0; m[0x20aa] = 0x00; m[0x20ab] = 0x40;
      let xx = x - 80;
      m[xx - 14] = 0; m[xx - 13] = 0x3c; m[xx - 8] = 0x2c;
      for (; xx <= 0x25c0; xx += 16) {
        m[xx + 8] = (m[xx - 8] - 4) & 0xff;
        let d = (((m[xx - 13] + 0x5d) & 0x7f) - 0x40) & 0xffff;
        m[xx + 2] = d >> 8; m[xx + 3] = d & 0xff;
      }
    }
    // Charlie and the lion on the podium
    const set = (list, v) => { for (const a of list) m[a] = v & 0xff; };
    set([0x24f4, 0x24e4], 0xb3);
    set([0x24d4, 0x24c4], 0xc3);
    set([0x24b4, 0x24a4, 0x2494], 0xc5);
    set([0x2484, 0x2474, 0x2464], 0xd5);
    set([0x24f6, 0x24d6], 0x29);
    set([0x24e6, 0x24c6], 0x39);
    set([0x24b6, 0x2486], 0x25);
    set([0x24a6, 0x2476], 0x35);
    set([0x2496, 0x2466], 0x45);
    const pair = (a, hi, lo) => { m[a] = hi; m[a + 1] = lo; };
    pair(0x24fe, 0xad, 0x00); pair(0x24ee, 0xae, 0x00); pair(0x24de, 0xaf, 0x00); pair(0x24ce, 0xb0, 0x00);
    const t = 0xef2e;
    pair(0x24be, this.rom8(t), 0); pair(0x24ae, this.rom8(t + 1), 0); pair(0x249e, this.rom8(t + 2), 0);
    pair(0x248e, this.rom8(t + 3), 0); pair(0x247e, this.rom8(t + 4), 0); pair(0x246e, this.rom8(t + 5), 0);
    set([0x2454, 0x2444, 0x2434], 0x52);
    set([0x2424, 0x2414, 0x2404], 0x5a);
    m[0x2456] = 0x30; m[0x2446] = 0x40; m[0x2436] = 0x50;
    m[0x2426] = 0x90; m[0x2416] = 0xa0; m[0x2406] = 0xb0;
    m[0x245e] = 0x10; m[0x244e] = 0x11; m[0x243e] = 0x12;
    m[0x242e] = 0x13; m[0x241e] = 0x14; m[0x240e] = 0x15;
    this.music_BC3F();
    m[0x2800]++;
  };

  G.s1Goal_7C98 = function () {
    const m = this.m;
    m[0x287f] = 2;
    this.blinkStep_BB54();
    m[0x20ca]++;
    if (!m[0x20ca]) {
      m[0x2500]--;
      if (!m[0x2500]) { m[0x2006]++; m[0x2005] = 0; return; }
    }
    // flashing "GOAL"
    const t = 0xf178 + s8(m[0x20ca] & 0x0e);
    const a = this.rom8(t), b = this.rom8(t + 1);
    m[0x245f] = a; m[0x244f] = a; m[0x243f] = a;
    m[0x242f] = b; m[0x241f] = b; m[0x240f] = b;
    if (m[0x25e0]) this.s1GoalPrize_7CCD();
    this.s1GoalFlag_7D83();
  };

  G.s1GoalPrize_7CCD = function () {
    const m = this.m;
    const x = 0x2580;
    let a = m[0x20ca];
    if (!(a & 7)) {
      a = ((a & 0x18) >> 2) + 0x44;
      if (a === 0x4a) a = 0x46;
      m[x + 110] = a;
      m[x + 126] = a + 1;
    }
    a = m[0x20ca];
    const b = (m[0x25e0] - 1) & 0xff;
    if (b) {
      a = ((-a) + 0x80) & 0xff;
      m[x + 118] = a;
      a = (a - 0x10) & 0xff;
      m[x + 102] = a;
      a = (a + 8) & 0xff;
      m[x + 86] = a;
      if (a !== 0x31) return;
      m[x + 94] = 0x4f; m[x + 95] = 0x20;
      m[x + 96]--;
      return;
    }
    // fireworks
    let c = (a << 1) & 0x1ff;
    a = c & 0xff;
    if ((c & 0x100) && !(a & 0x3f)) {
      a &= 0xc0;
      let cc = (a >> 7) & 1;
      a = (a << 1) & 0xff;
      const c2 = (a >> 7) & 1;
      a = ((a << 1) | cc) & 0xff;
      void c2;
      a = (((a << 1) & 0xff) | ((a >> 7) & 1)) & 0xff;
      a = (a + 0x4a) & 0xff;
      m[x - 114] = a; m[x - 113] = 0x20;
      m[x - 98] = a; m[x - 97] = 0xa0;
    }
    for (let xx = x + 64; xx >= 0x2520; xx -= 16) {
      if (m[xx + 8]) {
        m[xx + 8]--;
        if (!m[xx + 8]) this.s1Firework_7D32(xx);
        continue;
      }
      let d = (this.r16(xx) + 0x1c) & 0xffff;
      this.w16(xx, d);
      d = (d + this.r16(xx + 4)) & 0xffff;
      if ((d >> 8) > 0xd8) { this.s1Firework_7D32(xx); continue; }
      this.w16(xx + 4, d);
      this.w16(xx + 6, (this.r16(xx + 2) + this.r16(xx + 6)) & 0xffff);
      let f = m[xx + 9] + 1;
      if (f >= 0x18) f = 0;
      m[xx + 9] = f;
      if (f & 1) continue;
      const idx = ((f >> 1) + f) & 0xff;
      const p = 0xfa44 + s8(idx);
      m[xx + 14] = this.rom8(p); m[xx + 15] = this.rom8(p + 1);
    }
  };

  G.s1Firework_7D32 = function (xx) {
    const m = this.m;
    this.queueTask_6114(0x02, 0x00);
    this.sound_BBC4();
    m[xx + 4] = 0x6f; m[xx + 6] = 0x31;
    m[xx] = 0; m[xx + 1] = 0; m[xx + 9] = 0;
    m[xx + 14] = this.rom8(0xfa44); m[xx + 15] = this.rom8(0xfa45);
  };

  G.s1GoalFlag_7D83 = function () {
    const m = this.m;
    let a = m[0x20ca];
    if (a & 0x1f) return;
    a = (((a & 0x20) >> 3) + 0xad) & 0xff;
    m[0x24fe] = a; m[0x24ee] = a + 1; m[0x24de] = a + 2; m[0x24ce] = a + 3;
  };

  // ------------------------------------------------------------ death
  G.s1Death_7DA5 = function () {
    const m = this.m;
    m[0x264e] = 0x2f; m[0x263e] = 0x30;
    m[0x262e] = 0x35; m[0x261e] = 0x36; m[0x260e] = 0x37; m[0x25fe] = 0x38;
    for (const a of [0x25c4, 0x25b4, 0x25a4]) m[a] = 0x52;
    for (const a of [0x2594, 0x2584, 0x2574]) m[a] = 0x5a;
    m[0x25c6] = 0x30; m[0x25b6] = 0x40; m[0x25a6] = 0x50;
    m[0x2596] = 0x90; m[0x2586] = 0xa0; m[0x2576] = 0xb0;
    const pair = (a, hi, lo) => { m[a] = hi; m[a + 1] = lo; };
    pair(0x25ce, 0x16, 0); pair(0x259e, 0x16, 0);
    pair(0x25be, 0x17, 0); pair(0x258e, 0x17, 0);
    pair(0x25ae, 0x18, 0); pair(0x257e, 0x18, 0);
    m[0x20cb] = 0x40;
    this.music_BC13();
    m[0x2800] += 2;
    if (m[0x220a] === 2) m[0x220a]--;
  };

  G.s1Dead_7E1F = function () {
    const m = this.m;
    m[0x20cb]--;
    if (m[0x20cb]) return;
    this.s1Restart_7E23();
  };

  // lose a life and go back to the previous checkpoint
  G.s1Restart_7E23 = function () {
    const m = this.m;
    const a = m[0x2203];
    if (a) {
      if (a >= 7) m[0x2203]--;
      m[0x2203]--;
    }
    m[0x220c]++;
    m[0x2006] += 2;
    m[0x2005] = 0;
  };

  // demo: plays the recorded inputs
  G.demoInput_691D = function () {
    const m = this.m;
    if (m[0x2022]) return;
    let x = this.r16(0x203b);
    m[0x2032] = this.rom8(x + 1);
    m[0x203e] = (m[0x203e] - 1) & 0xff;
    if (m[0x203e]) return;
    x += 2;
    this.w16(0x203b, x);
    m[0x203e] = this.rom8(x);
    const b = this.rom8(x + 1);
    m[0x2032] = b;
    m[0x2035] = (~b) & 0xff;
  };
})(typeof window !== 'undefined' ? window : globalThis);
