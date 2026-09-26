/*
 * Stage 4 - BALLS. Charlie walks on top of rolling balls and jumps from one
 * to the next.
 *
 *   0x2400  Charlie
 *   0x2440  the ball Charlie stands on (64 byte record; swapped when he lands on another one)
 *   0x2480-0x257F  other balls (64 bytes each)
 *   0x2600  score effects ("wobble" sprites)
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;
  const absDiff = (a, b) => { const t = a - b; return t < 0 ? (-t) & 0xff : t; };

  G.stage4_994E = function () {
    this.s4BallHit_9967();
    this.s4Balls_9EC7();
    this.s4Player_99E8();
    this.s4Ball0_9D6E();
    this.fx2600_7EDB();
    this.bonusTick_BCA8();
    this.blinkRows_8370();
    this.backgroundAnim_BE86();
  };

  /** The ball under Charlie against the other balls: both bounce away and Charlie falls. */
  G.s4BallHit_9967 = function () {
    const m = this.m;
    const u = 0x2440;
    if (!m[u] || m[u + 2] >= 3) return;
    let y = 0x2480;
    for (;;) {
      if (m[y]) {
        m[0x28fe] = (m[y + 6] + 0x10) & 0xff;
        if (absDiff((m[u + 6] + 0x10) & 0xff, m[0x28fe]) < 0x1c) break;
      }
      y += 64;
      if (y >= 0x2580) return;
    }
    this.sound_BBAC();
    const st = m[u + 2];
    m[y + 2] = this.rom8(0xfb39 + st);
    const b = st === 1 ? 7 : 6;
    m[u + 2] = b;
    m[u] = 0;
    m[u + 1] = 1;
    this.w16(u + 12, b === 6 ? 0xeae1 : 0xeaae);
    m[u + 11] = 0;
    const x = 0x2400;
    if (m[x + 7]) return;
    m[x + 2] = 7;
    m[x + 45] = 0x20;
    m[x + 23] = 0;
    m[x + 24] = 0;
    this.s4Fall_99DD(x);
  };

  G.s4Fall_99DD = function (x) {
    this.m[0x28df]++;
    this.w16(x + 12, 0xea90);
    this.m[x + 11] = 0;
  };

  // ------------------------------------------------------------------ Charlie
  G.s4Player_99E8 = function () {
    const m = this.m;
    const x = 0x2400;
    switch (m[x + 2]) {
      case 0: this.s4PlayerInit_99F9(x); break;
      case 1: this.s4PlayerWalk_9A35(x); break;
      case 2: this.fall_8708(x); break;
      case 4: this.s2Goal_914D(x); break;
      case 7: this.hit_8632(x); break;
      case 8: this.dying_867F(x); break;
      case 3: case 5: case 6: break;
      default: this.todo(0x99f6);
    }
    this.s4Scenery_9B8E();
  };

  G.s4PlayerInit_99F9 = function (x) {
    const m = this.m;
    this.blinkInit_835C();
    this.bonusInit_BC5A();
    this.ropeTiles_83DD();
    const u = this.s4InitBalls_9A88();
    this.music_BBF8();
    m[x] = 1;
    m[x + 2] = 1;
    m[x + 4] = (m[u + 36] + 0xf4) & 0xff;
    m[x + 6] = m[u + 6];
    m[x + 9] = 4;
    m[x + 7] = 0;
    this.w16(x + 12, 0xea75);
    m[x + 11] = 0;
    m[x + 8] = m[x + 9];
    m[x + 23] = m[x + 9];
    m[x + 24] = 0x20;
    this.anim4_8944(x);
    this.s4PlayerWalk_9A35(x);
  };

  G.s4PlayerWalk_9A35 = function (x) {
    const m = this.m;
    let anim = true;
    if (!m[x + 7] && !m[x + 10]) {
      const t = m[x + 40] + 4;
      m[x + 40] = t & 0xff;
      if (!(t & 0xff)) m[x + 39]++;
      const a = m[x + 39];
      if (a < 1) anim = ((m[x + 40] - 4) & 0xff) === 0;
      else if (a < 2) anim = true;
      else if (a < 3) { this.anim4_8944(x); this.anim4_8944(x); }
      else {
        m[x + 2] = 2;
        m[x + 23] = m[x + 9];
        m[x + 24] = 0;
        this.s4Fall_99DD(x);
        this.anim4_8944(x);
        return;
      }
    }
    if (anim) this.anim4_8944(x);
    this.buttons_86A8(x);
    this.s4Move_9AB9(x);
    this.sprites4_84BD(x);
  };

  G.s4InitBalls_9A88 = function () {
    const m = this.m;
    const u = 0x2440;
    m[u] = 1;
    m[u + 2] = 5;
    m[u + 4] = 0xc0; m[u + 20] = 0xc0;
    m[u + 36] = 0xb0; m[u + 52] = 0xb0;
    m[u + 6] = 0x50; m[u + 38] = 0x50;
    m[u + 22] = 0x60; m[u + 54] = 0x60;
    m[u + 11] = 0;
    this.w16(u + 12, 0xeaa5);
    return u;
  };

  /** Joystick: walk (scrolls the camera) and jump. */
  G.s4Move_9AB9 = function (x) {
    const m = this.m;
    if (!m[x + 7]) {
      this.demoBall_68FC(x);
      let u, b;
      if (m[x + 26]) {
        m[x + 7] = 1;
        this.sound_BBB0();
        u = m[0x2203] === 0xf8 ? 0xea4e : 0xea45;
        b = m[x + 27];
      } else {
        b = m[x + 27];
        u = b === m[x + 10] ? -1 : (b ? 0xea2a : 0xea75);
      }
      if (u >= 0) {
        this.w16(x + 12, u);
        m[x + 11] = 0;
        m[x + 10] = b;
        m[x + 39] = 0;
        m[x + 40] = 0;
        this.s4Scenery_9B8E();
      }
    }
    const b = m[x + 10];
    if (b === 1) {
      const d = this.r16(0x2203);
      if (d) {
        if ((d >> 8) === 0xf8 && m[x + 6] !== 0x50) m[x + 6]--;
        else { this.w16(0x2203, d + 1); this.inc3_84B4(0x26c0); }
      }
    } else if (b) {
      const d = this.r16(0x2203);
      if ((d >> 8) === 0xf8) { if (m[x + 6] < 0xe0) m[x + 6]++; }
      else { this.w16(0x2203, d - 1); this.dec3_848A(0x26c0); }
    }
    const ph = m[x + 7];
    if (!ph) return;
    if (ph === 1) { this.s2Jump_859B(x); return; }   // going up: shared with stage 2
    let d = this.r16(x + 23);
    if (!(d >> 8)) d += 0x20;
    d = (d + 0x20) & 0xffff;
    this.w16(x + 23, d);
    m[x + 4] = ((d >> 8) + m[x + 4]) & 0xff;
    if (m[x + 23] !== m[x + 8]) return;
    m[x + 7] = 0;
    m[x + 26] = 0;
    this.w16(x + 12, m[x + 10] ? 0xea2a : 0xea75);
    m[x + 11] = 0;
    m[x + 8] = m[x + 9];
    m[x + 23] = m[x + 9];
    m[x + 24] = 0x20;
    if (this.s4Land_9BB8(x)) return;
    this.s4Goal_9D36(x);
    this.buttons_86A8(x);
  };

  /** Goal scenery while the camera reaches the end of the stage. */
  G.s4Scenery_9B8E = function () {
    const m = this.m;
    this.postAppear_8430();
    const b = m[0x2204];
    if (m[0x2203] !== 0xf9) return;
    const y = this.vramCol_869D(b);
    m[0x2890] = 0x20;
    const w = m[0x240a];
    if (!w) return;
    this.sceneryDraw_920C(w === 1 ? 0xd597 : 0xd549, y);
  };

  /** End of a jump: on which ball did Charlie land? Returns true to abort the caller. */
  G.s4Land_9BB8 = function (x) {
    const m = this.m;
    let u = m[x + 10] ? 0x2480 : 0x2440;
    for (; u < 0x2580; u += 64) {
      if (!m[u]) continue;
      const b = ((m[x + 10] === 1 ? 0x0c : 0x18) + m[x + 6]) & 0xff;
      m[0x28fe] = b;
      if (absDiff((m[u + 6] + 0x10) & 0xff, b) < 0x12) break;
    }
    if (u >= 0x2580) { m[x + 2] = 2; return false; }
    this.w16(0x28fe, u);
    this.bounceScore_9048(x);
    m[0x28ef]++;
    for (let v = 0x2480; v < 0x2580; v += 64) {
      if (!m[v]) continue;
      if (v === this.r16(0x28fe)) {
        if (m[x + 10]) m[0x2888] = 0x10;
        continue;
      }
      const a = m[x + 10];
      if (!a) break;
      m[0x2888] = 0x10;
      if (a === 1) {
        const b = m[v + 6];
        if (b < 0x50 || b >= 0x78) continue;
      } else if (((m[x + 6] - m[v + 6]) & 0xff) >= 0x40) continue;
      this.s4Bonus_9CC7(v);
      break;
    }
    // the new ball becomes ball 0x2440
    u = this.r16(0x28fe);
    for (let i = 0; i < 64; i++) {
      const t = m[u + i]; m[u + i] = m[0x2440 + i]; m[0x2440 + i] = t;
    }
    const y = 0x2440;
    const a = m[y + 6];
    const t = a - m[x + 6];
    m[y + 41] = t <= 0 ? t & 0xff : 1;
    this.s4BonusScore_9C86(x, a);
    return true;
  };

  G.s4BonusScore_9C86 = function (x, a) {
    const m = this.m;
    if (!m[0x28d5]) return;
    const u = this.r16(0x28d6), y = this.r16(0x28d8);
    let b = 4;
    a = (a - m[x + 6]) & 0xff;
    if (a < 5) {
      if (a >= 2) { this.w16(u + 12, 0xee08); this.w16(y + 12, 0xee11); b = 6; }
      else { this.w16(u + 12, 0xecbb); this.w16(y + 12, 0xecc1); b = 0x0b; }
    }
    this.queueTask_6114(0x02, b);
    this.sound_BBC4();
    m[0x28d5] = 0;
    m[0x28d4]++;
  };

  /** Jumped over a ball: bonus sprites that follow it. */
  G.s4Bonus_9CC7 = function (u) {
    const m = this.m;
    let y = 0x2600;
    while (m[y]) { y += 16; if (y >= 0x2640) return; }
    this.w16(0x28d6, y);
    m[0x28d5] = 1;
    m[y] = 1;
    m[y + 1] = 0;
    m[y + 4] = (m[u + 4] + 0xf8) & 0xff;
    m[y + 6] = (m[u + 6] + 8) & 0xff;
    this.w16(y + 7, u);
    this.w16(y + 12, 0xeb1d);
    m[y + 11] = 0;
    m[y + 10] = 0x20;
    let x = 0x2600;
    while (m[x]) { x += 16; if (x >= 0x2640) return; }
    this.w16(0x28d8, x);
    m[x] = 1;
    m[x + 1] = 1;
    m[x + 4] = m[y + 4];
    m[x + 6] = (m[y + 6] + 0x0f) & 0xff;
    this.w16(x + 7, u);
    this.w16(x + 12, 0xee11);
    m[x + 11] = 0;
    m[x + 10] = 0x20;
  };

  /** Landed at the end of the stage: on the podium or not. */
  G.s4Goal_9D36 = function (x) {
    const m = this.m;
    if (m[0x2203] !== 0xf8) return;
    const a = m[x + 6];
    if (a < 0xa0 || a >= 0xca) { m[x + 2] = 2; return; }
    m[x + 4] = (m[x + 4] + 6) & 0xff;
    this.w16(x + 12, 0xeb20);
    m[x + 11] = 0;
    m[x + 2] = 4;
    m[x + 45] = 0xa0;
    this.spawnList_890A(0x2600, 0xeb74);
    this.soundStop_BBA1();
    this.music_BC3F();
  };

  // ------------------------------------------------------------ Charlie's ball
  G.s4Ball0_9D6E = function () {
    const m = this.m;
    const x = 0x2440;
    if (!(m[x] | m[x + 1])) return;
    switch (m[x + 2]) {
      case 0:
        this.s4BallFollow_9E41(x);
        if (m[0x2407]) { this.s4BallJump_9D8A(x); return; }
        {
          const a = m[0x240a];
          if (!a) { m[x + 2] = 0; return; }
          this.s4BallSet(x, a, a === 1 ? 0xeae1 : 0xeaae);
        }
        return;
      case 1: {
        this.anim4_8944(x);
        this.s4BallFollow_9E41(x);
        if (m[0x2407]) { this.s4BallJump_9D8A(x); return; }
        const a = m[0x240a];
        if (!a) { m[x + 2] = 0; return; }
        if (a === 1) return;
        this.s4BallSet(x, a, 0xeaae);
        return;
      }
      case 2: {
        this.anim4_8944(x);
        this.s4BallFollow_9E41(x);
        if (m[0x2407]) { this.s4BallJump_9D8A(x); return; }
        const a = m[0x240a];
        if (!a) { m[x + 2] = 0; return; }
        if (a === 2) return;
        this.s4BallSet(x, a, 0xeae1);
        return;
      }
      case 3:
        this.anim4_8944(x); this.anim4_8944(x);
        m[x + 6] = (m[x + 6] + 2) & 0xff;
        this.s4BallAwayR(x);
        return;
      case 4:
        this.anim4_8944(x); this.anim4_8944(x);
        m[x + 6] = (m[x + 6] - 2) & 0xff;
        this.s4BallAwayL(x);
        return;
      case 5:
        this.anim4_8944(x);
        this.s4BallSet(x, 1, 0xeae1);
        return;
      case 6:
        this.anim4_8944(x);
        m[x + 6] = (m[x + 6] - 1) & 0xff;
        this.s4BallAwayR(x);
        return;
      case 7:
        this.anim4_8944(x);
        m[x + 6] = (m[x + 6] + 1) & 0xff;
        this.s4BallAwayL(x);
        return;
      default: this.todo(0x9d80);
    }
  };

  G.s4BallSet = function (x, st, anim) {
    this.m[x + 2] = st;
    this.w16(x + 12, anim);
    this.m[x + 11] = 0;
  };

  G.s4BallJump_9D8A = function (x) {
    const a = this.m[0x240a];
    if (!a) return;
    this.s4BallSet(x, (a + 2) & 0xff, a === 2 ? 0xeae1 : 0xeaae);
  };

  G.s4BallAwayR = function (x) {
    this.sprites4_84BD(x);
    if (this.m[x + 6] >= 0xf0) this.m.fill(0, x, 0x2480);
  };

  G.s4BallAwayL = function (x) {
    this.sprites4_84BD(x);
    const a = this.m[x + 6];
    if (a >= 0xf0 && a < 0xf2) this.m.fill(0, x, 0x2480);
  };

  /** The ball follows Charlie (he stays on top of it). */
  G.s4BallFollow_9E41 = function (x) {
    const m = this.m;
    const px = m[0x2406];
    const store = (a) => { m[x + 6] = a; this.sprites4y_84CA(x); };
    if (m[0x2203] === 0xf8) {
      const b = m[x + 41];
      if (!b) { store(px); return; }
      const w = m[0x240a];
      let dir;
      if (b === 1) { if (w > 1) { this.s4BallStop_9E9C(x); return; } dir = -1; }
      else { if (w === 1) { this.s4BallStop_9E9C(x); return; } dir = 1; }
      this.anim4_8944(x);
      let a = m[x + 6];
      for (let i = 0; i < 3; i++) {
        if (a === px) { m[x + 41] = 0; store(a); return; }
        if (i < 2) a = (a + dir) & 0xff;
      }
      store(a);
      return;
    }
    const b = m[x + 41];
    if (!b) { store(px); return; }
    m[x + 6] = (m[x + 6] + (b === 1 ? -1 : 1)) & 0xff;
    if (m[x + 6] === px) { m[x + 41] = 0; store(m[x + 6]); return; }
    this.sprites4y_84CA(x);
    if (m[x + 2]) return;
    this.anim4_8944(x);
  };

  G.s4BallStop_9E9C = function (x) {
    if (this.m[x + 6] === this.m[0x2406]) this.m[x + 41] = 0;
  };

  // ------------------------------------------------------------ other balls
  G.s4Balls_9EC7 = function () {
    for (let x = 0x2480; x < 0x2580; x += 64) if (this.s4Spawn_9EE9(x)) break;
    for (let x = 0x2480; x < 0x2580; x += 64) this.s4Ball_9FC7(x);
  };

  /** New balls appear at fixed positions of the course. Returns true to stop the loop. */
  G.s4Spawn_9EE9 = function (x) {
    const m = this.m;
    const w = m[0x240a];
    if (!w) {
      m[0x28fc] = (m[0x28fc] + 1) & 0xff;
      if (m[0x28fc]) return true;
      for (; x < 0x2580; x += 64) if (!m[x]) return this.s4SpawnAt_9F65(x);
      return true;
    }
    if (w === 1) return true;
    if (m[x] | m[x + 1]) return false;
    let a = 2;
    if (m[0x2022]) a = (m[0x202f] & 0x60) >> 4;
    let b = m[0x2211];
    if (b) b = ((b - 1) << 1) & 0xff;
    m[0x28fe] = b;
    a = this.jumpLevel_9FA3((a + b) & 0xff);
    if (a >= 0x0a) a = 0x0a;
    let u = this.rom16(0xf22b + a);
    u = this.rom16(u + s8((((-m[0x2203]) & 0xff) << 1) & 0xff));
    const pos = m[0x2204];
    for (let i = 0; i < 5; i++) {
      const v = this.rom8(u + i);
      if (i && !v) return true;
      if (v === pos) return this.s4SpawnAt_9F65(x);
      if (pos > v || i === 4) return true;
    }
    return true;
  };

  G.s4SpawnAt_9F65 = function (x) {
    const m = this.m;
    m[0x28fc] = 0;
    for (let u = 0x2480; u < 0x2580; u += 64) {
      if (!(m[u] | m[u + 1])) continue;
      if (m[u + 6] < 0x14) continue;
      if (absDiff(0xf1, m[u + 6]) <= 0x24) return true;
    }
    m[x]++;
    m[x + 4] = 0xc0;
    m[x + 6] = 0xf1;
    this.w16(x + 12, 0xeae1);
    m[x + 11] = 0;
    m[x + 5] = 0;
    return true;
  };

  G.s4Ball_9FC7 = function (x) {
    const m = this.m;
    if (!(m[x] | m[x + 1])) return;
    switch (m[x + 2]) {
      case 0: {
        this.anim4_8944(x);
        const b = m[0x240a];
        if (b === 1) { this.s4BallSet(x, 1, 0xeaae); return; }
        const a = (m[x + 5] + 0x80) & 0xff;
        if (!a) m[x + 6]--;
        m[x + 5] = a;
        if (b && m[0x2203] !== 0xf8) m[x + 6]--;
        this.s4BallRoll_9FFF(x);
        return;
      }
      case 1: {
        this.anim4_8944(x);
        if (m[0x240a] !== 1) {
          this.w16(x + 12, 0xeae1);
          m[x + 11] = 0;
          m[x + 5] = 0;
          m[x + 2]--;
          return;
        }
        const a = (m[x + 5] + 0x80) & 0xff;
        if (!a) m[x + 6]++;
        m[x + 5] = a;
        this.s4BallRoll_9FFF(x);
        return;
      }
      case 2: this.s4Clear_A034(x); return;
      case 3: this.anim4_8944(x); this.s4BallOutR_A052(x); return;
      case 4: this.anim4_8944(x); this.s4BallOutL_A067(x); return;
      case 5: return;
      case 6: this.s4BallOutR_A052(x); return;
      case 7: this.s4BallOutL_A067(x); return;
      default: this.todo(0x9fd3);
    }
  };

  G.s4Clear_A034 = function (x) {
    this.w16(0x28fe, x + 64);
    this.m.fill(0, x, x + 64);
  };

  G.s4BallRoll_9FFF = function (x) {
    this.sprites4_84BD(x);
    const a = this.m[x + 6];
    if (a === 0xf3 || a === 0xf2) this.m[x + 2] = 2;
  };

  G.s4BallOutR_A052 = function (x) {
    const m = this.m;
    this.anim4_8944(x);
    m[x + 6] = (m[x + 6] + 2) & 0xff;
    this.sprites4_84BD(x);
    if (m[x + 6] >= 0xf0) this.s4Clear_A034(x);
  };

  G.s4BallOutL_A067 = function (x) {
    const m = this.m;
    this.anim4_8944(x);
    m[x + 6] = (m[x + 6] - 2) & 0xff;
    this.sprites4_84BD(x);
    const a = m[x + 6];
    if (a >= 0xf0 && a < 0xf2) this.s4Clear_A034(x);
  };
})(typeof window !== 'undefined' ? window : globalThis);
