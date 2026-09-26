/*
 * Stage 2 - TIGHT ROPE (Charlie walks on a rope and jumps over monkeys)
 * and the object framework shared by stages 2, 3 and 4.
 *
 * Object records (0x2400 = Charlie, 4 sprites, 64 bytes):
 *   +0 active  +2 state  +4 x  +5 x fraction  +6 y  +7 jump phase
 *   +8 jump top  +9 jump speed  +10 walk direction  +11 anim delay
 *   +12 anim script pointer  +14/+15 code/attr of the first sprite
 *   +23/+24 vertical speed  +26/+27 demo button/direction  +45 timer
 * Monkeys: 0x2440-0x25FF (64 bytes each). Effects: 0x2600-0x26BF.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;

  G.stage2_7E5E = function () {
    this.s2Collide_8238();
    this.s2MonkeyMount_7E7C();
    this.s2Monkeys_897A();
    this.objs2700_7F68();
    this.s2Special_81CD();
    this.fx2600_7EDB();
    this.s2Player_829B();
    this.bonusTick_BCA8();
    this.blinkRows_8370();
    this.backgroundAnim_BE86();
  };

  // a small monkey climbs on a big one
  G.s2MonkeyMount_7E7C = function () {
    for (let x = 0x2540; x < 0x2600; x += 64) this.s2Mount_7E8A(x);
  };

  G.s2Mount_7E8A = function (x) {
    const m = this.m;
    if (!m[x] || m[x + 2]) return;
    for (let u = 0x2440; u < 0x2540; u += 64) {
      if (!m[u] || m[u + 2]) continue;
      let a = m[x + 6];
      if (a >= 0xd0 || a < 0x30) continue;
      a = (a - m[u + 6]) & 0xff;
      if (a >= 0x18) continue;
      m[x + 2] = 8;
      m[u + 2] = 9;
      this.w16(x + 49, u);
      this.w16(x + 12, 0xec5f);
      m[x + 11] = 0;
      m[x + 9] = 3; m[x + 7] = 0; m[x + 8] = 3; m[x + 23] = 3;
      m[x + 24] = 0x20;
      return;
    }
  };

  // ------------------------------------------------------------ effects 0x2600
  G.fx2600_7EDB = function () {
    for (let x = 0x2600; x < 0x26c0; x += 16) this.fx_7EE9(x);
  };

  G.fx_7EE9 = function (x) {
    const m = this.m;
    if (!m[x]) return;
    const kill = () => { m[x] = 0; m[x + 6] = 0; };
    switch (m[x + 2]) {
      case 0: {
        m[x + 10]--;
        if (!m[x + 10]) { kill(); return; }
        this.anim1_7F46(x);
        const u = this.r16(x + 7);
        let a = (m[u + 6] + 8) & 0xff;
        if (m[x + 1]) a = (a + 0x0f) & 0xff;
        m[x + 6] = a;
        if (!a) kill();
        return;
      }
      case 1:
        m[x + 10]--;
        if (!m[x + 10]) { kill(); return; }
        this.anim1_7F46(x);
        this.driftX_8BB6(x);
        return;
      case 2:
        m[x + 10]--;
        if (!m[x + 10]) { kill(); return; }
        this.anim1_7F46(x);
        return;
      case 3: this.fx_7F24(x); return;
      case 4:
        m[x + 10]--;
        if (!m[x + 10]) { kill(); return; }
        this.fx_7F24(x);
        return;
      case 5: return;
      case 6: this.anim1_7F46(x); return;
      default: this.todo(0x7ef3);
    }
  };

  G.fx_7F24 = function (x) {
    const m = this.m;
    this.anim1_7F46(x);
    this.scrollY_9413(x);
    const a = m[x + 6];
    if (a !== 0xf2 && a !== 0xf4) return;
    if (((m[0x240a] - 1) & 0xff) !== 0) m[0x220a]++;
    m[x] = 0; m[x + 6] = 0;
  };

  /** One sprite animation script: [code, attr, delay]..., 0xFF + pointer = loop. */
  G.anim1_7F46 = function (x) {
    const m = this.m;
    if (m[x + 11]) { m[x + 11]--; return; }
    let y = this.r16(x + 12);
    let a = this.rom8(y++);
    if (a === 0xff) { y = this.rom16(y); this.w16(x + 12, y); a = this.rom8(y++); }
    if (this.visFrame) this.visFrame(x, 1, y - 1, 3);
    m[x + 14] = a;
    m[x + 15] = this.rom8(y++);
    m[x + 11] = this.rom8(y++);
    this.w16(x + 12, y);
  };

  // ------------------------------------------------------------ objects 0x2700
  G.objs2700_7F68 = function () {
    const end = this.m[0x2201] === 2 ? 0x2800 : 0x2760;
    for (let x = 0x2700; x < end; x += 16) this.obj2700_7F83(x);
  };

  G.obj2700_7F83 = function (x) {
    const m = this.m;
    if (!m[x]) return;
    switch (m[x + 2]) {
      case 0:
        this.anim1_7F46(x);
        m[x + 6]--;
        if (m[x + 6] === m[x + 9]) { m[x + 2]++; m[x + 10] = 0; }
        return;
      case 1:
        this.anim1_7F46(x);
        m[x + 10]++;
        m[x + 6]--;
        this.anim1_7F46(x);
        m[x + 4]--;
        if (m[x + 4] === m[x + 7]) m[x + 2]++;
        return;
      case 2: {
        this.anim1_7F46(x);
        const a = m[x + 8];
        if (a && a === m[x + 6]) {
          // extra life
          this.queueTask_6114(0x03, 0x00);
          m[0x2200]++;
          m[x] = 0; m[x + 4] = 0; m[x + 6] = 0;
          this.sound_BBC4();
          return;
        }
        m[x + 6]--;
        if (m[x + 6]) return;
        m[x] = 0;
        m[0x220a] = 1;
        return;
      }
      case 3:
        this.anim1_7F46(x);
        m[x + 6]++;
        if (m[x + 6] === m[x + 9]) { m[x + 2]++; m[x + 10] = 0; }
        return;
      case 4: this.anim1_7F46(x); return;
      case 5: {
        // falling coins
        this.anim1_7F46(x);
        let a = 8 + m[x + 3];
        if (a > 0xff) m[x + 8]++;
        m[x + 3] = a & 0xff;
        m[x + 4] = (m[x + 4] + m[x + 8]) & 0xff;
        a = m[x + 7] + m[x + 5];
        if (a > 0xff) { if (m[x + 1]) m[x + 6]--; else m[x + 6]++; }
        m[x + 7] = a & 0xff;
        if (m[x + 4] >= 0xb0) { m[x] = 0; m[x + 4] = 0; m[x + 6] = 0; }
        return;
      }
      case 6: this.anim1_7F46(x); return;
      default: this.todo(0x7f8d);
    }
  };

  // bonus objects after the goal (clowns, bags)
  G.spawnBonus_8027 = function () {
    const m = this.m;
    m[0x28fe] = 0;
    let y = 0xf9b2;
    if (m[0x2201] === 2) { y = 0xf9e9; m[0x28fe]++; }
    for (let u = 0x2700; u < 0x2760; u += 16) {
      if (m[u]) continue;
      m[u]++;
      m[u + 2] = m[0x28fe] ? 3 : 0;
      m[u + 4] = this.rom8(y); m[u + 6] = this.rom8(y + 1); y += 2;
      m[u + 12] = this.rom8(y); m[u + 13] = this.rom8(y + 1); y += 2;
      m[u + 11] = 0;
      m[u + 9] = this.rom8(y); m[u + 8] = 0; m[u + 7] = this.rom8(y + 1); y += 2;
      if (((this.rom8(y) + 1) & 0xff) === 0) {
        let a = m[0x2200];
        if (a >= 4) a = 4;
        let b = 8;
        do { b = (b + 0x10) & 0xff; a = (a - 1) & 0xff; } while (a);
        m[u + 8] = b;
        return;
      }
    }
  };

  G.s2GoalBonus_808A = function () {
    const m = this.m;
    if (m[0x220a]) return;
    for (let u = 0x2690, b = 6; b; b--, u += 16) {
      if (m[u + 2] === 3) { m[0x220a]++; return; }
    }
    m[0x2700] = 0; m[0x2710] = 0; m[0x2720] = 0;
    this.spawnBonus_8027();
  };

  // coins thrown by the clown of stage 3
  G.s3Coins_80B1 = function () {
    const m = this.m;
    if (m[0x2722] !== 4) return;
    if (m[0x2014] & 7) return;
    let u = 0x2730;
    for (; u < 0x2800; u += 16) if (!m[u]) break;
    if (u >= 0x2800) return;
    m[u]++;
    m[u + 2] = 5;
    const y = 0xfa26 + s8((m[0x28dc] << 1) & 0xff);
    m[u + 6] = (this.rom8(y) + m[0x2726]) & 0xff;
    let a = this.rom8(y + 1);
    m[u + 1] = 0; m[u + 7] = 0; m[u + 8] = 0; m[u + 3] = 0;
    if (a >= 0x80) { a = (-a) & 0xff; m[u + 1]++; }
    m[u + 5] = a;
    m[u + 4] = m[0x2724];
    this.w16(u + 12, 0xfa44);
    m[u + 11] = 0;
    if (m[0x28de]) {
      m[0x28dc]++;
      if (m[0x28dc] >= 0x0d) m[0x28dc] = 0;
      let b = m[0x220f] + 1;
      if (b >= 6) b = 6;
      b--;
      this.queueTask_6114(0x02, b);
      this.sound_BBC4();
      m[0x28dd]++;
      if (m[0x28dd] >= 0x28) m[0x220a]++;
      return;
    }
    u = 0x26a0;
    m[u] = 1; m[u + 16] = 1;
    m[u + 2] = 6; m[u + 18] = 6;
    let p = m[0x2706];
    m[u + 6] = p; m[u + 22] = (p + 0x10) & 0xff;
    m[u + 4] = 0xac; m[u + 20] = 0xac;
    this.w16(u + 12, 0xfa6b); m[u + 11] = 0;
    this.w16(u + 28, 0xfa7d); m[u + 27] = 0;
    m[0x28de]++;
    u = 0x2720;
    m[u + 11] = 0;
    this.w16(u + 12, 0xfa20);
    for (let i = 0; i < 16; i++) m[0x27b0 + i] = m[u + i];
  };

  // ------------------------------------------------------------ big monkey at 0x2760
  G.s2BigMonkey_818B = function (x) {
    const m = this.m;
    if (m[x + 7] || m[0x220c] || m[0x28df]) return;
    m[0x28df]++;
    this.w16(x + 12, 0xec3e);
    m[x + 11] = 0;
    const u = 0x2760;
    m[u] = 1; m[u + 2] = 0;
    m[u + 4] = 0x66;
    m[u + 20] = 0x75; m[u + 36] = 0x75;
    m[u + 6] = 0xc0; m[u + 22] = 0xb8; m[u + 38] = 0xc8;
    this.w16(u + 12, 0xecaa);
    m[u + 11] = 0;
  };

  G.s2Special_81CD = function () {
    const m = this.m;
    const x = 0x2760;
    if (!m[x]) return;
    if (m[x + 2] === 0) this.anim3_81DF(x);
  };

  G.anim3_81DF = function (x) {
    const m = this.m;
    if (m[x + 11]) { m[x + 11]--; return; }
    let y = this.r16(x + 12);
    let a = this.rom8(y++);
    if (a === 0xff) { y = this.rom16(y); this.w16(x + 12, y); a = this.rom8(y++); }
    if (this.visFrame) this.visFrame(x, 3, y - 1, 5);
    m[x + 14] = a;
    m[x + 30] = this.rom8(y++); m[x + 46] = this.rom8(y++);
    a = this.rom8(y++);
    m[x + 15] = a; m[x + 31] = a; m[x + 47] = a;
    m[x + 11] = this.rom8(y++);
    this.w16(x + 12, y);
  };

  G.s2BigMonkeyHit_820D = function () {
    const m = this.m;
    if (!m[0x28df]) return;
    const u = 0x2760;
    m[u + 2]++;
    m[u + 14] = 0xfe; m[u + 15] = 0x10;
    m[u + 30] = 0x14; m[u + 31] = 0x21;
    m[u + 46] = 0x16; m[u + 47] = 0x22;
    m[u + 38]--;
    m[0x28df] = 0;
    this.queueTask_6114(0x02, 0x0e);
    this.sound_BBA8();
  };

  // ------------------------------------------------------------ Charlie vs monkeys
  G.s2Collide_8238 = function () {
    const m = this.m;
    const u = 0x2400;
    if (!m[u] || m[u + 2] >= 3) return;
    for (let y = 0x2440; y < 0x2600; y += 64) {
      if (!m[y]) continue;
      m[0x28fe] = (m[y + 6] + 0x0d) & 0xff;
      let t = ((m[u + 6] + 0x13) & 0xff) - m[0x28fe];
      let a = t < 0 ? (-t) & 0xff : t;
      if (a >= 0x0d) continue;
      m[0x28ff] = a;
      m[0x28fe] = m[y + 4];
      t = m[u + 4] - m[0x28fe];
      a = t < 0 ? (-t) & 0xff : t;
      if (a >= 0x10) continue;
      if (((a + m[0x28ff]) & 0xff) >= 0x14) continue;
      m[u + 2] = 7;
      m[u + 45] = 7;
      m[y + 45] = 7;
      m[u + 10] = 0;
      m[y + 2] = 4;
      this.sound_BBE1();
      return;
    }
  };

  // ------------------------------------------------------------ Charlie
  G.s2Player_829B = function () {
    const m = this.m;
    const x = 0x2400;
    switch (m[x + 2]) {
      case 0: this.s2PlayerInit_82AC(x); break;
      case 1: this.s2PlayerWalk_82D1(x); break;
      case 2: this.fall_8708(x); break;
      case 3: break;
      case 4: this.s2Goal_914D(x); break;
      case 5: case 6: break;
      case 7: this.hit_8632(x); break;
      case 8: this.dying_867F(x); break;
      default: this.todo(0x82a9);
    }
    this.scenery_91E6();
  };

  G.s2PlayerInit_82AC = function (x) {
    const m = this.m;
    this.blinkInit_835C();
    this.bonusInit_BC5A();
    this.ropeTiles_83DD();
    this.monkeyTable_831C();
    this.s2PlayerSetup_83AF(x);
    this.music_BBF8();
    m[x + 9] = 4; m[x + 7] = 0; m[x + 8] = 4; m[x + 23] = 4;
    m[x + 24] = 0x20;
    this.anim4_8944(x);
    this.s2PlayerWalk_82D1(x);
  };

  G.s2PlayerWalk_82D1 = function (x) {
    const m = this.m;
    let lbl = 0;
    if (m[x + 7] || m[x + 10]) lbl = 0x830f;
    else {
      m[x + 40] = (m[x + 40] + 1) & 0xff;
      m[x + 40] = (m[x + 40] + 1) & 0xff;
      if (!m[x + 40]) m[x + 39]++;
      const a = m[x + 39];
      if (a < 1) {
        lbl = ((m[x + 40] - 2) & 0xff) ? 0x8312 : 0x830f;
      } else if (a < 2) lbl = 0x830f;
      else if (a < 3) { this.anim4_8944(x); this.anim4_8944(x); lbl = 0x830f; }
      else {
        // standing still for too long: loses balance
        m[x + 2] = 2;
        m[x + 23] = m[x + 9];
        m[x + 24] = 0;
        return;
      }
    }
    if (lbl === 0x830f) this.anim4_8944(x);
    this.buttons_86A8(x);
    this.s2Move_84D8(x);
    this.sprites4_84BD(x);
  };

  // monkey sequence table for the current difficulty
  G.monkeyTable_831C = function () {
    const m = this.m;
    let u = 0xf336;
    let a = 2;
    if (m[0x2022]) a = (m[0x202f] & 0x60) >> 4;
    let b = m[0x220f];
    if (b) b = ((b - 1) << 1) & 0xff;
    m[0x28fe] = b;
    a = (a + b) & 0xff;
    a = this.jumpLevel_9FA3(a);
    if (a >= 0x0a) a = 0x0a;
    u = this.rom16(u + s8(a));
    a = (-m[0x2203]) & 0xff;
    if (a === 5) a++;
    a = (a << 1) & 0xff;
    u = this.rom16(u + s8(a));
    this.w16(0x288d, u);
    m[0x288b] = 0;
  };

  // +2 for every threshold of monkeys jumped (table 0xFB5F)
  G.jumpLevel_9FA3 = function (a) {
    const b = this.m[0x28ef];
    let y = 0xfb5f;
    while (b >= this.rom8(y++)) a = (a + 2) & 0xff;
    return a;
  };

  G.blinkInit_835C = function () {
    this.w16(0x2889, this.m[0x2201] === 1 ? 0x3017 : 0x300c);
    this.m[0x2888] = 0;
  };

  // blinking colour bars (score feedback)
  G.blinkRows_8370 = function () {
    const m = this.m;
    if (m[0x2402] !== 4 && !m[0x2888]) return;
    if (m[0x2014] & 3) return;
    let u = this.r16(0x2889);
    const end = (u + 0x400) & 0xffff;
    this.w16(0x28fe, end);
    m[0x2888]--;
    const a = this.rom8(0xd625 + (m[0x2888] & 3));
    do {
      m[u] = a; m[u + 1] = a; m[u + 2] = a;
      u += 32;
    } while (u < end);
  };

  G.s2PlayerSetup_83AF = function (x) {
    const m = this.m;
    m[x] = 1; m[x + 2] = 1;
    m[x + 4] = 0x88; m[x + 20] = 0x88;
    m[x + 36] = 0x78; m[x + 52] = 0x78;
    m[x + 6] = 0x40; m[x + 38] = 0x40;
    m[x + 22] = 0x50; m[x + 54] = 0x50;
    m[x + 11] = 0;
    this.w16(x + 12, 0xec44);
  };

  // rope / platform posts (objects 0x26C0-0x26EF)
  G.ropeTiles_83DD = function () {
    const m = this.m;
    m[0x28fe] = 0;
    let u = this.postTable_840C();
    for (let y = 0x26c0; y < 0x26f0; y += 16) {
      m[y] = 1;
      let a = this.rom8(u), b = this.rom8(u + 1); u += 2;
      m[y + 5] = a;
      m[y + 6] = (-(a + 0x10)) & 0xff;
      if (m[0x2201] === 1) b = (b - 0x38) & 0xff;
      m[y + 4] = b;
      m[y + 14] = this.rom8(u); m[y + 15] = this.rom8(u + 1); u += 2;
    }
  };

  G.postTable_840C = function () {
    const m = this.m;
    let u = this.rom16(0xebb2 + ((m[0x2201] << 1) & 0xff));
    let a = (-m[0x2203]) & 0xff;
    if (m[0x28fe]) { if (((m[0x240a] - 1) & 0xff) !== 0) a = (a + 1) & 0xff; }
    else a = (a + 1) & 0xff;
    return this.rom16(u + s8((a << 1) & 0xff));
  };

  G.postAppear_8430 = function () {
    const m = this.m;
    m[0x28fe] = 1;
    let u = this.postTable_840C();
    let b = 3, a;
    for (;;) {
      a = this.rom8(u);
      if (a === m[0x2204]) break;
      u += 4;
      if (!--b) return;
    }
    let y = 0x26c0;
    while (m[y + 5] !== a) y += 16;
    let bb = this.rom8(u + 1);
    m[y + 6] = 0xf0;
    if (m[0x2201] === 1) bb = (bb - 0x38) & 0xff;
    m[y + 4] = bb;
    m[y + 14] = this.rom8(u + 2); m[y + 15] = this.rom8(u + 3);
  };

  // scroll the posts
  G.postsLeft_8469 = function () {
    const m = this.m;
    const y = 0x2760;
    if (m[y]) {
      this.dec3_848A(y);
      if (m[y + 6] >= 0xf8) { m[y] = 0; m[y + 6] = 0; m[y + 22] = 0; m[y + 38] = 0; m[0x28df] = 0; }
    }
    this.dec3_848A(0x26c0);
  };
  G.dec3_848A = function (y) { const m = this.m; m[y + 6]--; m[y + 22]--; m[y + 38]--; };

  G.postsRight_8493 = function () {
    const m = this.m;
    const y = 0x2760;
    if (m[y]) {
      this.inc3_84B4(y);
      if (m[y + 6] >= 0xf8) { m[y] = 0; m[y + 6] = 0; m[y + 22] = 0; m[y + 38] = 0; m[0x28df] = 0; }
    }
    this.inc3_84B4(0x26c0);
  };
  G.inc3_84B4 = function (y) { const m = this.m; m[y + 6]++; m[y + 22]++; m[y + 38]++; };

  /** Positions the 4 sprites (2x2) of a 64 byte object from its x/y. */
  G.sprites4_84BD = function (x) {
    const m = this.m;
    let a = m[x + 4];
    m[x + 20] = a;
    a = (a + 0xf0) & 0xff;
    m[x + 36] = a; m[x + 52] = a;
    this.sprites4y_84CA(x);
  };

  G.sprites4y_84CA = function (x) {
    const m = this.m;
    let a = m[x + 6];
    m[x + 38] = a;
    a = (a + 0x10) & 0xff;
    m[x + 22] = a; m[x + 54] = a;
  };

  // joystick / jump
  G.s2Move_84D8 = function (x) {
    const m = this.m;
    if (!m[x + 7]) {
      this.demoRope_68CF(x);
      let u, b;
      if (m[x + 26]) {
        m[x + 7] = 1;
        b = m[x + 27];
        m[x + 10] = b;
        this.monkeysAhead_8734(x);
        this.sound_BBB0();
        u = m[0x2203] === 0xf8 ? 0xea4e : 0xea45;
        b = m[x + 27];
        this.setWalk_8515(x, u, b);
      } else {
        b = m[x + 27];
        if (b !== m[x + 10]) this.setWalk_8515(x, b ? 0xec44 : 0xea75, b);
      }
    }
    // horizontal movement
    let b = m[x + 10];
    if (b) {
      b--;
      if (b) {
        // right
        let yv = (m[0x2203] << 8) | m[0x2204];
        if (m[0x2203] === 0xf8) {
          if (m[x + 6] >= 0xc0) { this.s2BigMonkey_818B(x); this.s2Jump_859B(x); return; }
          m[x + 6]++;
        } else {
          if (!m[x + 7] && m[x + 6] < 0x40) {
            m[x + 5]++;
            if (!(m[x + 5] & 1)) m[x + 6]++;
          }
          yv = (yv - 1) & 0xffff;
          m[0x2203] = yv >> 8; m[0x2204] = yv & 0xff;
          this.postsLeft_8469();
        }
      } else {
        // left
        let yv = (m[0x2203] << 8) | m[0x2204];
        if (yv) {
          if (m[0x2203] === 0xf8 && m[x + 6] >= 0x40) { m[x + 6]--; this.s2Jump_859B(x); return; }
          if (!m[x + 7] && m[x + 6] >= 0x20) {
            m[x + 5]++;
            if (!(m[x + 5] & 1)) m[x + 6]--;
          }
          m[0x2205]++;
          if (!(m[0x2205] & 1)) {
            yv = (yv + 1) & 0xffff;
            m[0x2203] = yv >> 8; m[0x2204] = yv & 0xff;
            this.postsRight_8493();
          }
        }
      }
    }
    this.s2Jump_859B(x);
  };

  G.setWalk_8515 = function (x, u, b) {
    const m = this.m;
    this.w16(x + 12, u);
    m[x + 11] = 0;
    m[x + 10] = b;
    m[x + 39] = 0; m[x + 40] = 0;
    this.scenery_91E6();
  };

  G.s2Jump_859B = function (x) {
    const m = this.m;
    for (;;) {
      const ph = m[x + 7];
      if (!ph) return;
      if (ph === 1) {
        // going up
        let d = this.r16(x + 23);
        let a = d >> 8, b = d & 0xff;
        if (a) {
          let t = b - 0x20;
          b = t & 0xff;
          if (t < 0) a = (a - 1) & 0xff;
        } else {
          let t = b - 0x40;
          b = t & 0xff;
          if (t < 0) { m[x + 24] = 0; m[x + 7]++; continue; }
        }
        m[x + 23] = a; m[x + 24] = b;
        m[x + 4] = (m[x + 4] - m[x + 23]) & 0xff;
        return;
      }
      // coming down
      let d = this.r16(x + 23);
      if (!(d >> 8)) d += 0x20;
      d = (d + 0x20) & 0xffff;
      this.w16(x + 23, d);
      m[x + 4] = ((d >> 8) + m[x + 4]) & 0xff;
      const a = m[x + 23];
      let landed = false;
      if (m[0x2203] === 0xf8 && m[x + 6] >= 0xa0 && m[x + 6] < 0xca && a >= 3 && m[x + 24] === 0x80) {
        m[0x28ee]++;
        landed = true;
      }
      if (!landed && a !== m[x + 8]) return;
      m[x + 7] = 0;
      if (!m[0x2022]) m[x + 26] = 0;
      this.w16(x + 12, m[x + 10] ? 0xec44 : 0xea75);
      m[x + 11] = 0;
      m[x + 8] = m[x + 9];
      m[x + 23] = m[x + 9];
      m[x + 24] = 0x20;
      this.jumpScore_87AC(x);
      this.s2GoalCheck_88C8(x);
      this.buttons_86A8(x);
      return;
    }
  };

  /** Charlie was hit: short pause then falls. */
  G.hit_8632 = function (x) {
    const m = this.m;
    if (m[x + 45]) {
      m[x + 45]--;
      this.anim4_8944(x);
      m[x + 23] = 0;
      return;
    }
    const d = (this.r16(x + 23) + 0x20) & 0xffff;
    this.w16(x + 23, d);
    m[x + 4] = ((d >> 8) + m[x + 4]) & 0xff;
    this.sprites4_84BD(x);
    if (m[x + 4] < 0xd0) return;
    this.fallen_8657(x);
  };

  G.fallen_8657 = function (x) {
    const m = this.m;
    if (x >= 0x2440) { m[x + 2] = 5; return; }
    this.w16(x + 12, 0xeb14);
    m[x + 11] = 0;
    m[x + 2] = 8;
    m[x + 45] = 0x28;
    this.spawnList_890A(0x2600, 0xeb99);
    this.music_BC13();
  };

  G.dying_867F = function (x) {
    const m = this.m;
    this.anim4_8944(x);
    m[x + 45]--;
    if (m[x + 45]) return;
    m[0x2006] = 5;
    m[0x2005] = 0;
    const a = m[0x2203];
    if (!a) return;
    if (a < 0xfa) m[0x2203]++;
    m[0x2203]++;
  };

  // VRAM address of hardware column for screen position B
  G.vramCol_869D = function (b) {
    const d = ((0x0d << 8) | (b & 0xf8)) << 2;
    return d & 0xffff;
  };

  /** Jump button handling (edge detection with $28F0). */
  G.buttons_86A8 = function (x) {
    const m = this.m;
    if (!m[0x2022] || !m[0x2003]) return;
    let a = m[0x2008] ? m[0x2033] : m[0x2032];
    let b = a;
    m[0x241b] = a & 3;
    if (m[0x2201] !== 2 && m[0x28d3]) {
      if (m[x + 7]) return;
      const t = m[0x28d3] - 8;
      if (t >= 0) m[0x28d3] = t;
      m[0x28d3] = 0;
      return;
    }
    if (m[0x28f0]) {
      b &= 0x30;
      if (b) { m[x + 26] = 0; return; }
      m[0x28f0] = b;
      return;
    }
    b &= 0x30;
    m[0x241a] = b;
    if (!b) return;
    m[0x28f0]++;
    if (m[x + 7] !== 2) return;
    if (m[x + 4] < 0x68) return;
    m[0x28d3] = b;
  };

  G.fall_8708 = function (x) {
    const m = this.m;
    const b = m[x + 10];
    if (b) {
      let a = (m[x + 6] + 1) & 0xff;
      if (b === 1) a = (a - 2) & 0xff;
      if (m[0x2203]) m[x + 6] = a;
    }
    const d = (this.r16(x + 23) + 0x20) & 0xffff;
    this.w16(x + 23, d);
    const a = ((d >> 8) + m[x + 4]) & 0xff;
    m[x + 4] = a;
    if (a >= 0xd0) this.fallen_8657(x);
    this.sprites4_84BD(x);
  };

  // monkeys in front of Charlie when the jump starts (for the score)
  G.monkeysAhead_8734 = function (x) {
    const m = this.m;
    m[0x28f9] = 0; m[0x28fa] = 0;
    let y = 0x28e0;
    let u = 0x2440;
    const a = m[x + 10];
    if (a === 1) {
      if (m[0x2203] === 0xf8) return;
      u += 0x100;
    } else {
      m[0x28fb] = a ? 0x50 : 0x20;
      for (; u < 0x2540; u += 64) {
        if (!m[u]) continue;
        const t = m[u + 6] - m[x + 6];
        if (t < 0 || t >= m[0x28fb]) continue;
        this.w16(y, u); y += 2;
        m[0x28f9]++;
      }
      y = 0x28e6;
    }
    m[0x28fb] = a === 0 ? 0x40 : a === 1 ? 0x20 : 0x80;
    for (; u < 0x2600; u += 64) {
      if (!m[u]) continue;
      const t = m[u + 6] - m[x + 6];
      if (t < 0 || t >= m[0x28fb]) continue;
      this.w16(y, u); y += 2;
      m[0x28fa]++;
    }
  };

  G.jumpScore_87AC = function (x) {
    const m = this.m;
    let b = m[0x28f9];
    let u;
    let lbl;
    if (b) {
      if (!m[0x28fa]) { b = (b + 1) & 0xff; lbl = 0x8800; }
      else {
        b = (b + m[0x28fa]) & 0xff;
        m[0x28f9] = b;
        b = (b + 8) & 0xff;
        this.queueTask_6114(0x02, b);
        m[0x28ef]++;
        u = this.r16(0x28e0);
        lbl = 0x87cb;
      }
    } else {
      b = m[0x28fa];
      if (!b) { m[0x220b] = 0; return; }
      if (b >= 2) {
        m[0x28f9] = b;
        u = this.r16(0x28e6);
        const yv = this.r16(0x28e8);
        if (m[u + 6] < m[yv + 6]) u = yv;
        b = (b + 8) & 0xff;
        this.queueTask_6114(0x02, b);
        m[0x28ef]++;
        lbl = 0x87cb;
      } else { b = (b + 2) & 0xff; lbl = 0x8800; }
    }
    if (lbl === 0x8800) {
      this.queueTask_6114(0x02, b);
      m[0x28ef]++;
      m[0x2888] = 0x10;
    } else {
      for (;;) {
        // big jump over a monkey carrying another one
        m[u + 2] = 1;
        this.w16(u + 12, m[u + 48] ? 0xeca4 : 0xec9e);
        m[u + 11] = 0; m[u + 5] = 0;
        m[u + 29] = 0x20;
        this.scorePopup_8858(u);
        m[0x2888] = 0x10;
        this.sound_BBC4();
        break;
      }
    }
    // 880D
    const a = m[x + 10];
    if (!a) { m[0x220b] = 0; return; }
    m[0x220a] = a;
    if (m[0x220b] || a !== 1 || !m[0x28fa]) { m[0x220b] = 0; return; }
    m[0x28f9] = 6;
    u = this.r16(0x28e0);
    m[0x220b]++;
    b = (6 + 8) & 0xff;
    this.queueTask_6114(0x02, b);
    m[0x28ef]++;
    m[u + 2] = 1;
    this.w16(u + 12, m[u + 48] ? 0xeca4 : 0xec9e);
    m[u + 11] = 0; m[u + 5] = 0;
    m[u + 29] = 0x20;
    this.scorePopup_8858(u);
    m[0x2888] = 0x10;
    this.sound_BBC4();
    // (the original loops back to 880D once more)
    const a2 = m[x + 10];
    m[0x220a] = a2;
    m[0x220b] = 0;
  };

  G.scorePopup_8858 = function (u) {
    const m = this.m;
    let y = 0x2600;
    if (m[y]) return;
    m[y] = 1; m[y + 2] = 1;
    m[y + 4] = (m[u + 4] + 0xed) & 0xff;
    m[y + 6] = (m[u + 6] + 9) & 0xff;
    m[y + 5] = 0;
    let a = (m[0x28f9] - 2) & 0xff;
    if (a >= 2) a = 2;
    this.w16(y + 12, this.rom16(0xecb2 + s8((a << 1) & 0xff)));
    m[y + 11] = 0;
    m[y + 10] = 0x20;
    for (u = 0x2600; u < 0x2660; u += 16) {
      if (m[u]) continue;
      m[u] = 1; m[u + 2] = 1;
      m[u + 4] = m[y + 4];
      m[u + 6] = (m[y + 6] + 0x0f) & 0xff;
      this.w16(u + 12, 0xecc1);
      m[u + 11] = 0; m[u + 5] = 0;
      m[u + 10] = 0x20;
      return;
    }
  };

  G.s2GoalCheck_88C8 = function (x) {
    const m = this.m;
    if (m[0x2203] !== 0xf8 || !m[0x28ee]) return;
    m[x + 4] = (m[x + 4] + 0xfa) & 0xff;
    this.w16(x + 12, 0xeb20);
    m[x + 11] = 0;
    m[x + 2] = 4;
    m[x + 45] = 0xa0;
    this.spawnList_890A(0x2600, 0xeb74);
    this.soundStop_BBA1();
    this.music_BC3F();
    this.s2BigMonkeyHit_820D();
    if (!m[0x220a]) this.spawnBonus_8027();
  };

  /** Fills free effect slots from a list [x, y, anim pointer]..., 0xFF. */
  G.spawnList_890A = function (u, y) {
    const m = this.m;
    for (; u < 0x26c0; u += 16) {
      if (m[u]) continue;
      const a = this.rom8(y), b = this.rom8(y + 1);
      y += 2;
      if (a === 0xff) return;
      m[0x28fe] = a;
      m[u + 4] = m[0x2201] === 3 ? a : (a + 0x52) & 0xff;
      m[u + 6] = b;
      m[u + 12] = this.rom8(y); m[u + 13] = this.rom8(y + 1); y += 2;
      m[u + 11] = 0;
      m[u] = 1;
      m[u + 2] = 2;
    }
  };

  /** 4 sprite animation script: [code, code2, code3, code4, attr, delay]. */
  G.anim4_8944 = function (x) {
    const m = this.m;
    if (m[x + 11]) { m[x + 11]--; return; }
    let y = this.r16(x + 12);
    let a = this.rom8(y++);
    if (a === 0xff) { y = this.rom16(y); this.w16(x + 12, y); a = this.rom8(y++); }
    if (this.visFrame) this.visFrame(x, 4, y - 1, 6);
    m[x + 14] = a;
    m[x + 30] = this.rom8(y++); m[x + 46] = this.rom8(y++);
    m[x + 62] = this.rom8(y++);
    const b = this.rom8(y++);
    m[x + 15] = b; m[x + 31] = b; m[x + 47] = b; m[x + 63] = b;
    m[x + 11] = this.rom8(y++);
    this.w16(x + 12, y);
  };

  // ------------------------------------------------------------ monkeys
  G.s2Monkeys_897A = function () {
    this.s2MonkeySpawn_898E();
    for (let x = 0x2440; x < 0x2600; x += 64) this.s2Monkey_8A51(x);
  };

  G.s2MonkeySpawn_898E = function () {
    const m = this.m;
    if (m[0x2402] === 4) return;
    let b = m[0x240a];
    if (b === 1) return;
    let u = this.r16(0x288d);
    if (!u) return;
    const a = m[0x288b];
    if (b || (m[0x2014] & 3)) m[0x288b]++;
    if (a !== this.rom8(u++)) return;
    let x = 0x2440;
    b = this.rom8(u++);
    m[0x28ff] = b;
    if (b === 0) this.w16(0x28fe, x + 0x100);
    else {
      x = 0x2540;
      if (b !== 1) return;
      this.w16(0x28fe, x + 0xc0);
    }
    for (;;) {
      if (!(m[x] | m[x + 1])) break;
      x += 64;
      if (x >= this.r16(0x28fe)) return;
    }
    for (let y = 0x2440; y < 0x2600; y += 64) {
      if (m[y + 48]) continue;
      const p = m[y + 6];
      if (p < 0xf2 && p >= 0xc8) return;
    }
    const setNext = () => {
      let uu = u;
      if (this.rom8(uu) === 0xff) uu = this.rom16(uu + 1);
      this.w16(0x288d, uu);
    };
    if (!(m[0x240a] === 2 && m[0x2203] !== 0xf8)) {
      if (m[0x28f8] !== 2) { m[0x28f8]++; setNext(); return; }
    }
    m[0x28f8] = 0;
    setNext();
    m[x]++;
    m[x + 48] = b;
    m[x + 4] = 0x88;
    m[x + 6] = 0xf1;
    this.w16(x + 12, m[0x28ff] ? 0xec89 : 0xec74);
    m[x + 11] = 0; m[x + 5] = 0;
  };

  G.s2Monkey_8A51 = function (x) {
    const m = this.m;
    if (!(m[x] | m[x + 1])) return;
    switch (m[x + 2]) {
      case 0: this.s2MonkeyWalk_8A5F(x); break;
      case 1: this.s2MonkeyJumped_8AF5(x); break;
      case 2: this.clearObj64_8B15(x); break;
      case 3: case 4: case 5: case 7: break;
      case 6: this.hit_8632(x); break;
      case 8: this.s2MonkeyHop_8B38(x); break;
      case 9: this.driftX_8BB6(x); break;
      default: this.todo(0x8a5d);
    }
  };

  G.s2MonkeyWalk_8A5F = function (x) {
    const m = this.m;
    if (((m[0x240a] - 1) & 0xff) !== 0 || !(m[0x2014] & 1)) this.anim4_8944(x);
    let b = m[0x240a];
    let lbl;
    if (m[x + 48]) {
      if (m[0x2203] === 0xf8) {
        if (!b) lbl = 0x8a93;
        else {
          const a = (m[x + 5] + 0x80) & 0xff;
          if (!a) m[x + 6]--;
          m[x + 5] = a;
          b--;
          lbl = b ? 0x8a93 : 0x8a95;
        }
      } else {
        const a = (m[x + 5] + 0x80) & 0xff;
        if (!a) m[x + 6]--;
        m[x + 5] = a;
        if (b === 1) lbl = 0x8a95;
        else {
          m[x + 6]--;
          if (!b) lbl = 0x8a95;
          else { this.anim4_8944(x); lbl = 0x8a93; }
        }
      }
    } else if (m[0x2203] === 0xf8) {
      let a = 0xc0;
      if (b) {
        a = 0x80;
        b--;
        if (b) { m[x + 6]--; m[x + 5] = a; lbl = 0x8a95; }
      }
      if (lbl === undefined) {
        m[0x28fe] = a;
        const t = m[x + 5] + a;
        if (t > 0xff) m[x + 6]--;
        m[x + 5] = t & 0xff;
        lbl = 0x8a95;
      }
    } else {
      const a = b ? 0x40 : 0xc0;
      m[0x28fe] = a;
      const t = m[x + 5] + a;
      if (t > 0xff) m[x + 6]--;
      m[x + 5] = t & 0xff;
      lbl = b !== 2 ? 0x8a95 : 0x8a93;
    }
    if (lbl === 0x8a93) m[x + 6]--;
    this.sprites4_84BD(x);
    this.offScreen_8A98(x);
  };

  G.offScreen_8A98 = function (x) {
    const a = this.m[x + 6];
    if (a >= 0xf2 && a < 0xf5) this.m[x + 2] = 2;
  };

  G.s2MonkeyJumped_8AF5 = function (x) {
    const m = this.m;
    this.anim4_8944(x);
    this.driftX_8BB6(x);
    this.offScreen_8A98(x);
    m[x + 29]--;
    if (m[x + 29]) return;
    m[x + 2] = 0;
    this.w16(x + 12, m[x + 48] ? 0xec74 : 0xec89);
    m[x + 11] = 0;
  };

  G.clearObj64_8B15 = function (x) {
    for (let i = 0; i < 64; i++) this.m[x + i] = 0;
  };

  G.s2MonkeyHop_8B38 = function (x) {
    const m = this.m;
    this.anim4_8944(x);
    let d = this.r16(x + 23);
    let fall = false;
    if (m[x + 7]) {
      if (!(d >> 8)) d += 0x20;
      fall = true;
    } else {
      let a = d >> 8, b = d & 0xff;
      if (a) {
        const t = b - 0x20; b = t & 0xff;
        if (t < 0) a = (a - 1) & 0xff;
        this.s2HopUp(x, a, b);
      } else {
        const t = b - 0x40; b = t & 0xff;
        if (t >= 0) this.s2HopUp(x, a, b);
        else {
          // top of the jump: continue with the D register value (not reloaded)
          m[x + 24] = 0;
          m[x + 7]++;
          d = (a << 8) | b;
          fall = true;
        }
      }
    }
    if (fall) {
      d = (d + 0x20) & 0xffff;
      this.w16(x + 23, d);
      m[x + 4] = ((d >> 8) + m[x + 4]) & 0xff;
      if (m[x + 23] === m[x + 8]) {
        m[x + 7] = 0; m[x + 2] = 0;
        const u = this.r16(x + 49);
        if (m[u + 2] !== 1) m[u + 2] = 0;
        this.w16(x + 12, 0xec74);
        m[x + 11] = 0;
      }
    }
    this.hopDrift_8B9B(x);
    this.sprites4_84BD(x);
    this.offScreen_8A98(x);
  };

  G.s2HopUp = function (x, a, b) {
    const m = this.m;
    m[x + 23] = a; m[x + 24] = b;
    m[x + 4] = (m[x + 4] - m[x + 23]) & 0xff;
  };

  G.hopDrift_8B9B = function (x) {
    const m = this.m;
    let store = false, a;
    if (m[0x2203] !== 0xf8 && m[0x240a]) {
      if (m[0x240a] !== 1) m[x + 6]--;
      const t = 0xc0 + m[x + 5];
      a = t & 0xff;
      if (t > 0xff) store = true;
    }
    if (store) m[x + 5] = a;
    else m[x + 6]--;
    if (x < 0x2600) this.sprites4_84BD(x);
  };

  /** Objects drift with the camera when Charlie walks. */
  G.driftX_8BB6 = function (x) {
    const m = this.m;
    if (m[0x2203] === 0xf8) return;
    const w = m[0x240a];
    if (!w) return;
    let a;
    if (w === 1) {
      const t = 0x40 + m[x + 5];
      a = t & 0xff;
      if (t > 0xff) m[x + 6]++;
    } else {
      const t = 0xc0 + m[x + 5];
      a = t & 0xff;
      if (t > 0xff) m[x + 6]--;
    }
    m[x + 5] = a;
    if (x < 0x2600) this.sprites4_84BD(x);
  };

  // demo helpers
  G.demoRope_68CF = function (x) {
    const m = this.m;
    if (m[0x2022]) return;
    m[x + 27] = 2;
    const u = this.r16(0x203b);
    if (m[0x2204] !== this.rom8(u)) return;
    this.w16(0x203b, u + 1);
    m[x + 26] = 2;
    m[x + 27] = 2;
  };

  G.demoStep_68EE = function (x) {
    const m = this.m;
    if (m[0x2022]) return;
    const u = this.r16(0x203b);
    m[x + 27] = this.rom8(u);
    this.w16(0x203b, u + 1);
  };

  G.demoBall_68FC = function (x) {
    const m = this.m;
    if (m[0x2022]) return;
    m[x + 27] = m[0x203f];
    let u = this.r16(0x203b);
    if (m[0x2204] !== this.rom8(u)) return;
    u++;
    m[x + 26] = this.rom8(u++);
    const a = this.rom8(u++);
    m[x + 27] = a;
    m[0x203f] = a;
    this.w16(0x203b, u);
  };
})(typeof window !== 'undefined' ? window : globalThis);
