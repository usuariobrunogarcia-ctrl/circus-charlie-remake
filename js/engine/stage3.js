/*
 * Stage 3 - TRAMPOLINE, plus scenery routines shared with stages 2 and 4.
 *
 *   0x2400  Charlie (bounces between trampolines)
 *   0x2440-0x253F  clowns (64 byte records)
 *   0x2540-0x257F  thrown objects (16 bytes)   0x2580-0x25FF  projectiles (32 bytes)
 *   0x2690-0x26BF  trampolines                 0x26C0-0x26EF  posts / scenery sprites
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;
  const s8 = (v) => (v << 24) >> 24;
  const absDiff = (a, b) => { const t = a - b; return t < 0 ? (-t) & 0xff : t; };

  G.stage3_8BE2 = function () {
    this.s3Scenery_8C09();
    this.s3HitProjectile_8CB4();
    this.s3HitThrown_8D1F();
    this.s3HitClown_8D6F();
    this.s3Objects_93B4();
    this.fx2600_7EDB();
    this.s3Player_8DC6();
    this.bonusTick_BCA8();
    this.blinkRows_8370();
    this.objs2700_7F68();
    this.s3Coins_80B1();
    this.s3Trampolines_8C1E();
    this.backgroundAnim_BE86();
  };

  G.s3Scenery_8C09 = function () {
    const m = this.m;
    if (!m[0x28f4]) return;
    m[0x28f4]--;
    if (m[0x28f4]) return;
    this.pairColumn_9132(this.r16(0x28f5), 0xfaf7);
  };

  // new trampolines appear at fixed camera positions
  G.s3Trampolines_8C1E = function () {
    const m = this.m;
    if (m[0x240a] !== 2) return;
    let b = 0x20;
    const a0 = m[0x2210];
    if (a0 && a0 !== 1) b <<= 1;
    if (b < m[0x28f2]) return;
    let a = m[0x2203];
    let u = 0xfab9, n = 8;
    for (;;) {
      if (a === this.rom8(u)) break;
      u += 2;
      if (!--n) return;
    }
    a = m[0x2204];
    if (a !== this.rom8(u + 1)) return;
    for (let x = 0x2690; x < 0x26c0; x += 16) if (m[x] && a === m[x + 9]) return;
    let x = 0x2690;
    for (; x < 0x26c0; x += 16) if (!m[x]) break;
    if (x >= 0x26c0) return;
    m[x]++;
    m[x + 9] = a;
    m[x + 2] = 3;
    m[x + 6] = 0xf0;
    m[x + 4] = 0x50;
    if (m[0x28f2] === 0x18 && m[0x2048]) {
      let uu = 0x3530;
      for (let i = 0, y = 0xf06e; i < 6; i++, uu += 32) m[uu] = (this.rom8(y++) - 0x39) & 0xff;
    }
    this.w16(x + 12, (a0 && a0 !== 1) ? 0xeddb : 0xedd2);
    m[x + 11] = 0;
  };

  // Charlie against the projectiles (0x2580)
  G.s3HitProjectile_8CB4 = function () {
    const m = this.m;
    if (m[0x2207]) return;
    const x = 0x2400;
    if (!m[x] || m[x + 2] >= 2) return;
    for (let u = 0x2580; u < 0x2600; u += 32) {
      if (!m[u]) continue;
      m[0x28fe] = (m[u + 6] + 8) & 0xff;
      let a = absDiff((m[x + 6] + 0x10) & 0xff, m[0x28fe]);
      if (a >= 8) continue;
      a = absDiff((m[u + 4] - 4) & 0xff, m[x + 4]);
      if (a >= 0x0a) continue;
      if (((a + m[0x28ff]) & 0xff) >= 0x10) continue;
      this.s3Hit_8D09(x, u);
      return;
    }
  };

  G.s3Hit_8D09 = function (x, u) {
    const m = this.m;
    m[x] = 0;
    m[x + 1] = 1;
    m[x + 2] = 7;
    m[x + 45] = 7;
    m[u + 2] = 4;
    m[x + 10] = 0;
  };

  G.s3HitThrown_8D1F = function () {
    const m = this.m;
    if (m[0x2207]) return;
    const x = 0x2400;
    if (!m[x] || m[x + 2] >= 2) return;
    for (let u = 0x2540; u < 0x2580; u += 16) {
      if (!m[u]) continue;
      m[0x28fe] = (m[u + 6] + 8) & 0xff;
      let a = absDiff((m[x + 6] + 0x10) & 0xff, m[0x28fe]);
      if (a >= 9) continue;
      m[0x28ff] = a;
      m[0x28fe] = (m[u + 4] + 8) & 0xff;
      a = absDiff(m[x + 4], m[0x28fe]);
      if (a >= 8) continue;
      this.s3Hit_8D09(x, u);
      return;
    }
  };

  G.s3HitClown_8D6F = function () {
    const m = this.m;
    if (!m[0x2207]) return;
    const x = 0x2400;
    if (!m[x] || m[x + 2] >= 2) return;
    for (let u = 0x2440; u < 0x2540; u += 64) {
      if (!m[u]) continue;
      m[0x28fe] = (m[u + 6] + 0x10) & 0xff;
      let a = absDiff((m[x + 6] + 0x10) & 0xff, m[0x28fe]);
      if (a >= 0x0b) continue;
      m[0x28ff] = a;
      a = absDiff(m[x + 4], m[u + 4]);
      if (a >= 8) continue;
      if (((a + m[0x28ff]) & 0xff) >= 0x11) continue;
      this.w16(x + 12, 0xecee);
      m[x + 11] = 0;
      this.s3Hit_8D09(x, u);
      return;
    }
  };

  // ------------------------------------------------------------ Charlie
  G.s3Player_8DC6 = function () {
    const m = this.m;
    const x = 0x2400;
    switch (m[x + 2]) {
      case 0: this.s3PlayerInit_8DD7(x); break;
      case 1: this.s3PlayerBounce_8DFB(x); break;
      case 2: this.fall_8708(x); break;
      case 3: case 5: case 6: break;
      case 4: this.s2Goal_914D(x); break;
      case 7: this.s3Hit_918B(x); break;
      case 8: this.dying_867F(x); break;
      default: this.todo(0x8dd4);
    }
    this.scenery_91E6();
  };

  G.s3PlayerInit_8DD7 = function (x) {
    const m = this.m;
    this.blinkInit_835C();
    this.bonusInit_BC5A();
    this.s3Posts_8E41();
    this.s3PlayerSetup_8E10(x);
    this.music_BC01();
    m[x + 9] = 4; m[x + 8] = 4; m[x + 23] = 4;
    m[x + 24] = 0x20; m[x + 58] = 0x20;
    m[x + 7] = 1;
    this.s3PlayerBounce_8DFB(x);
  };

  G.s3PlayerBounce_8DFB = function (x) {
    if (this.m[x + 10]) this.anim4_8944(x);
    else this.anim4b_9354(x);
    this.buttons_86A8(x);
    this.s3Move_8F13(x);
    this.sprites4_84BD(x);
  };

  G.s3PlayerSetup_8E10 = function (x) {
    const m = this.m;
    m[x] = 1; m[x + 2] = 1;
    m[x + 4] = 0xb4; m[x + 20] = 0xb4;
    m[x + 36] = 0xa4; m[x + 52] = 0xa4;
    m[x + 6] = 0x50; m[x + 38] = 0x50;
    m[x + 22] = 0x60; m[x + 54] = 0x60;
    m[x + 55] = 0; m[x + 11] = 0;
    this.w16(x + 12, 0xecc4);
  };

  G.s3Posts_8E41 = function () {
    const m = this.m;
    m[0x28fe] = 0;
    let u = this.postTable_840C();
    for (let y = 0x26c0; y < 0x26f0; y += 16) {
      m[y] = 1;
      const a = this.rom8(u), b = this.rom8(u + 1); u += 2;
      m[y + 5] = a;
      m[y + 6] = (-(a + 0x10)) & 0xff;
      m[y + 4] = b;
      m[y + 14] = this.rom8(u); m[y + 15] = this.rom8(u + 1); u += 2;
      this.postX_8E69(y);
    }
  };

  G.postX_8E69 = function (y) {
    if (this.m[0x2201] === 2) this.m[y + 4] = 0xf0;
  };

  G.postAppear_8E99 = function () {
    const m = this.m;
    m[0x28ff] = 0;
    m[0x28fe] = 1;
    let u = this.postTable_840C();
    let b = 3, a;
    for (;;) {
      a = this.rom8(u);
      if (a === m[0x2204]) break;
      a = (a - 1) & 0xff;
      if (a === m[0x2204]) { m[0x28ff]++; a = (a + 1) & 0xff; break; }
      u += 4;
      if (!--b) return;
    }
    let y = 0x26c0;
    while (m[y + 5] !== a) y += 16;
    let bb = this.rom8(u + 1);
    m[y + 6] = 0xf0;
    if (m[0x28ff]) m[y + 6]--;
    if (m[0x2201] === 1) bb = (bb - 0x38) & 0xff;
    m[y + 4] = bb;
    this.postX_8E69(y);
    m[y + 14] = this.rom8(u + 2); m[y + 15] = this.rom8(u + 3);
  };

  G.postsLeft2_8EE9 = function () {
    const m = this.m, y = 0x26c0;
    m[y + 6] -= 2; m[y + 22] -= 2; m[y + 38] -= 2;
  };
  G.postsRight2_8EFE = function () {
    const m = this.m, y = 0x26c0;
    m[y + 6] += 2; m[y + 22] += 2; m[y + 38] += 2;
  };

  G.s3Move_8F13 = function (x) {
    const m = this.m;
    let b = m[x + 10];
    if (b) {
      b--;
      if (b) {
        if (m[0x2203] === 0xf8) {
          if (m[x + 6] < 0xc0) m[x + 6] += 2;
        } else {
          const yv = (((m[0x2203] << 8) | m[0x2204]) - 2) & 0xffff;
          m[0x2203] = yv >> 8; m[0x2204] = yv & 0xff;
          this.postsLeft2_8EE9();
        }
      } else {
        let yv = (m[0x2203] << 8) | m[0x2204];
        if (m[0x2203]) {
          if (m[0x2203] === 0xf8 && m[x + 6] !== 0x50) m[x + 6] -= 2;
          else {
            yv = (yv + 2) & 0xffff;
            m[0x2203] = yv >> 8; m[0x2204] = yv & 0xff;
            this.postsRight2_8EFE();
          }
        }
      }
    }
    // vertical: bouncing
    const ph = m[x + 7];
    if (!ph) return;
    if (ph !== 1) {
      // falling
      m[x + 4] = (m[x + 4] + m[x + 23]) & 0xff;
      const d = (this.r16(x + 23) + 0x30) & 0xffff;
      this.w16(x + 23, d);
      if ((d >> 8) !== m[x + 8] || (d & 0xff) !== m[x + 58]) return;
      m[x + 4] = (m[x + 4] + m[x + 8]) & 0xff;
      this.bounceScore_9048(x);
      this.trampolineTiles_9103();
      this.bounceStart_90CA(x);
      this.bounceHeight_9072(x);
      this.goalCheck_92D6(x);
      return;
    }
    // rising
    m[x + 4] = (m[x + 4] - m[x + 23]) & 0xff;
    let d = this.r16(x + 23);
    let top = false;
    if (m[x + 55] && !(d >> 8)) top = true;
    else {
      d = (d + 0xffd0) & 0xffff;
      this.w16(x + 23, d);
      if (!d) top = true;
    }
    if (top) {
      m[x + 24] = 0;
      m[x + 7]++;
      if (m[x + 55] === 4) {
        m[x + 4] += 2;
        m[x + 2] = 8;
        this.dieSetup_91C6(x, 0xed30);
        return;
      }
    }
    if (m[x + 55] !== 3) return;
    const a = m[x + 4];
    if (a < 0x50 || a >= 0x68) return;
    for (let u = 0x2690; u < 0x26c0; u += 16) {
      if (!m[u]) continue;
      if (this.s3Catch_8FED(x, u)) return;
    }
  };

  // highest bounce: touching a flying object (balloon / star) gives points
  G.s3Catch_8FED = function (x, u) {
    const m = this.m;
    if (m[u + 2] !== 3) return false;
    let a = absDiff(m[u + 6], m[x + 6]);
    if (a >= 0x10) return false;
    m[0x28fd] = (m[x + 6] + 0x10) & 0xff;
    a = absDiff((m[u + 6] + 8) & 0xff, m[0x28fd]);
    if (a >= 0x13) return false;
    a = (m[0x28f1] + 2) & 0xff;
    if (a >= 9) a = 8;
    let b = a;
    this.w16(u + 12, this.rom16(0xede4 + s8((a << 1) & 0xff)));
    m[u + 11] = 0;
    m[u + 10] = 0x20;
    m[u + 2]++;
    m[0x28f1]++;
    m[0x28f2]++;
    b = (b + 1) & 0xff;
    this.queueTask_6114(0x02, b);
    this.sound_BBC4();
    return true;
  };

  G.bounceScore_9048 = function (x) {
    const m = this.m;
    const st = m[0x2201];
    if (st === 1) return;
    const b = m[x + 10];
    if (st === 3) {
      m[0x20aa] = 1; m[0x20ab] = 0;
      if (!b) return;
    } else {
      if (b !== 2) return;
      m[0x20ab] = 0x20; m[0x20aa] = 0;
    }
    m[0x20a9] = 0;
    this.queueTask_6114(0x02, 0x00);
  };

  G.bounceHeight_9072 = function (x) {
    const m = this.m;
    let a = m[x + 10];
    if (!a) {
      a = m[x + 55];
      m[x + 55]++;
      const y = 0xfadb + s8((a << 1) & 0xff);
      m[x + 23] = this.rom8(y); m[x + 24] = this.rom8(y + 1);
      m[x + 8] = this.rom8(y);
      m[x + 58] = this.rom8(y + 1);
      return;
    }
    m[x + 23] = 4; m[x + 8] = 4;
    m[x + 24] = 0x20; m[x + 58] = 0x20;
    const b = m[0x2204];
    m[x + 55] = 0;
    a--;
    if (!a) { if (b >= 0xf8 || b < 8) this.lowBounce_90BA(x); return; }
    if (b < 0x58 && b >= 0x48) this.lowBounce_90BA(x);
  };

  G.lowBounce_90BA = function (x) {
    const m = this.m;
    m[x + 23] = 3; m[x + 8] = 3;
    m[x + 24] = 0xc0; m[x + 58] = 0xc0;
  };

  G.bounceStart_90CA = function (x) {
    const m = this.m;
    m[x + 7] = 1;
    this.sound_BBB4();
    this.demoStep_68EE(x);
    let u = 0xed09;
    let a = m[x + 27];
    if (a !== 2) { u = 0xece2; a--; if (a) u = 0xecc4; }
    const b = m[x + 27];
    this.w16(x + 12, u);
    m[x + 11] = 0;
    m[x + 10] = b;
    m[x + 39] = 0; m[x + 40] = 0;
    this.scenery_91E6();
  };

  // trampoline tiles are pressed down when Charlie lands
  G.trampolineTiles_9103 = function () {
    const m = this.m;
    let b = 0;
    const a = m[0x2204];
    if (!(a >= 0xf8 || a < 8)) {
      b = 1;
      if (a < 0xa0 || a >= 0xb0) b = 2;
    }
    m[0x28f4] = 8;
    const y = this.rom16(0xfae5 + s8((b << 1) & 0xff));
    this.w16(0x28f5, y);
    this.pairColumn_9132(y, 0xfaeb);
  };

  G.pairColumn_9132 = function (y, u) {
    const m = this.m;
    for (let b = 6; b; b--) {
      m[y] = this.rom8(u++);
      m[y + 1] = this.rom8(u++);
      y = (y - 32) & 0xffff;
      if (y < 0x3000) y = 0x33f8;
    }
  };

  /** Stage completed: Charlie celebrates, then the stage clear sequence. */
  G.s2Goal_914D = function (x) {
    const m = this.m;
    m[x + 45]--;
    if (m[x + 45]) { this.anim4_8944(x); return; }
    if (m[0x2201] !== 3 && !m[0x220a]) { m[x + 45]++; this.anim4_8944(x); return; }
    m[0x2006] = 4;
    m[0x2005] = 0;
    m[0x2203] = 0;
    if (m[0x2201] !== 2 || !m[0x2210]) return;
    if (!(((m[0x2210] - 1) & 0xff) & 1)) { m[0x2207] = 0; return; }
    m[0x2207] = m[0x2207] ? 0 : 1;
  };

  G.s3Hit_918B = function (x) {
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
    if (m[0x2201] === 2) { if (m[x + 4] < 0xd8) return; }
    else if (m[x + 4] < 0xd0) return;
    if (x >= 0x2440) { m[x + 2] = 5; return; }
    this.dieSetup_91C6(x, 0xeb14);
  };

  G.dieSetup_91C6 = function (x, u) {
    const m = this.m;
    this.w16(x + 12, u);
    m[x + 11] = 0;
    m[x + 2] = 8;
    m[x + 45] = 0x28;
    this.spawnList2_931C(0x2600, 0xeb99);
    this.music_BC13();
  };

  // ------------------------------------------------------------ scenery (tiles) while scrolling
  G.scenery_91E6 = function () {
    const m = this.m;
    this.postAppear_8E99();
    this.goalScenery_9273();
    const b = m[0x2204];
    if (m[0x2203] !== 0xf9) return;
    const y = this.vramCol_869D(b);
    m[0x2890] = 0x20;
    let u = 0xd549;
    const w = m[0x240a];
    if (!w) return;
    if (w === 1) u = 0xd597;
    this.sceneryDraw_920C(u, y);
  };

  G.sceneryDraw_920C = function (u, y) {
    const m = this.m;
    const a = m[0x2207] ? 6 : m[0x2201];
    u = this.rom16(u + s8((a << 1) & 0xff));
    let c = m[0x2204] & 0xf8;
    if (m[0x240a] !== 1) c = (-c) & 0xff;
    c >>= 2;
    u = this.rom16(u + s8(c));
    this.drawBlock_922F(u, y);
  };

  /** Draws $2890 tiles of an RLE block (0x10 n = n blanks, 0xFE n = skip n) avoiding the HUD. */
  G.drawBlock_922F = function (u, y) {
    const m = this.m;
    for (;;) {
      let a;
      if ((y & 0x1f) < 0x0a) {
        // inside the HUD columns: skip
        const b = this.rom8(u++);
        if (b === 0xfe || b === 0x10) a = this.rom8(u++);
        else a = 1;
        y = (y + s8(a)) & 0xffff;
        m[0x2890] = ((-a) + m[0x2890]) & 0xff;
        if (!m[0x2890]) return;
        continue;
      }
      a = this.rom8(u++);
      if (a === 0xfe) {
        a = this.rom8(u++);
        y = (y + s8(a)) & 0xffff;
        m[0x2890] = ((-a) + m[0x2890]) & 0xff;
        if (!m[0x2890]) return;
        continue;
      }
      if (a === 0x10) {
        let b = this.rom8(u++);
        for (;;) {
          m[y] = a; y = (y + 1) & 0xffff;
          m[0x2890]--;
          if (!m[0x2890]) return;
          b = (b - 1) & 0xff;
          if (!b) break;
        }
        continue;
      }
      m[y] = a; y = (y + 1) & 0xffff;
      m[0x2890]--;
      if (!m[0x2890]) return;
    }
  };

  G.goalScenery_9273 = function () {
    const m = this.m;
    if (m[0x2203] !== 0xff) return;
    const b = m[0x2204];
    if (b < 0xc0) return;
    const w = m[0x240a];
    let u, y;
    if (m[0x2201] === 2) {
      m[0x2890] = 8;
      y = (this.vramCol_869D(b) + 22) & 0xffff;
      u = m[0x2207] ? 0xe98b : 0xe43b;
      if (!w) return;
      if (w !== 1) u = m[0x2207] ? 0xe9e5 : 0xe48d;
    } else {
      m[0x2890] = 0x0b;
      y = (this.vramCol_869D(b) + 18) & 0xffff;
      u = 0xdf2c;
      if (!w) return;
      if (w !== 1) u = 0xdf72;
    }
    let c = m[0x2204] & 0xf8;
    c = ((-c) & 0xff) >> 2;
    u = this.rom16(u + s8(c));
    this.drawBlock_922F(u, y);
  };

  G.goalCheck_92D6 = function (x) {
    const m = this.m;
    if (m[0x2203] !== 0xf8) return;
    const a = m[x + 6];
    if (a < 0xa0) return;
    if (a >= 0xca) { m[x + 2] = 2; return; }
    m[x + 4] = (m[x + 4] + 0xf6) & 0xff;
    m[x + 6] = (m[x + 6] + 4) & 0xff;
    this.w16(x + 12, 0xeb20);
    m[x + 11] = 0;
    m[x + 2] = 4;
    m[x + 45] = 0xa0;
    this.spawnList2_931C(0x2600, 0xeb74);
    this.soundStop_BBA1();
    this.music_BC3F();
    this.s2GoalBonus_808A();
  };

  G.spawnList2_931C = function (u, y) {
    const m = this.m;
    for (; u < 0x26c0; u += 16) {
      if (m[u]) continue;
      const a = this.rom8(y), b = this.rom8(y + 1);
      y += 2;
      if (a === 0xff) return;
      m[0x28fe] = a;
      m[u + 4] = m[0x2201] === 1 ? (a + 0x70) & 0xff : a;
      m[u + 6] = b;
      m[u + 12] = this.rom8(y); m[u + 13] = this.rom8(y + 1); y += 2;
      m[u + 11] = 0;
      m[u]++;
      m[u + 2] = 2;
    }
  };

  /** 4 sprite animation with individual attributes: [c1,c2,c3,c4,a1,a2,a3,a4,delay]. */
  G.anim4b_9354 = function (x) {
    const m = this.m;
    if (m[x + 11]) { m[x + 11]--; return; }
    let y = this.r16(x + 12);
    let a = this.rom8(y++);
    if (a === 0xff) { y = this.rom16(y); this.w16(x + 12, y); a = this.rom8(y++); }
    if (this.visFrame) this.visFrame(x, 4, y - 1, 9);
    m[x + 14] = a;
    m[x + 30] = this.rom8(y++); m[x + 46] = this.rom8(y++);
    m[x + 62] = this.rom8(y++); m[x + 15] = this.rom8(y++);
    m[x + 31] = this.rom8(y++); m[x + 47] = this.rom8(y++);
    m[x + 63] = this.rom8(y++); m[x + 11] = this.rom8(y++);
    this.w16(x + 12, y);
  };

  /** 2 sprite animation: [c1, c2, attr, delay]. */
  G.anim2_938C = function (x) {
    const m = this.m;
    if (m[x + 11]) { m[x + 11]--; return; }
    let y = this.r16(x + 12);
    let a = this.rom8(y++);
    if (a === 0xff) { y = this.rom16(y); this.w16(x + 12, y); a = this.rom8(y++); }
    if (this.visFrame) this.visFrame(x, 2, y - 1, 4);
    m[x + 14] = a;
    m[x + 30] = this.rom8(y++);
    const b = this.rom8(y++);
    m[x + 15] = b; m[x + 31] = b;
    m[x + 11] = this.rom8(y++);
    this.w16(x + 12, y);
  };

  // ------------------------------------------------------------ clowns and their objects
  G.s3Objects_93B4 = function () {
    for (let x = 0x2440; x < 0x2540; x += 64) if (this.s3Spawn_956E(x)) break;
    for (let x = 0x2440; x < 0x2540; x += 64) this.s3Clown_971F(x);
    for (let x = 0x2580; x < 0x2600; x += 32) this.s3Projectile_93E9(x);
    for (let x = 0x2540; x < 0x2580; x += 16) this.s3Thrown_94B9(x);
  };

  G.s3Projectile_93E9 = function (x) {
    const m = this.m;
    if (!m[x]) return;
    switch (m[x + 2]) {
      case 0:
        this.anim2_938C(x);
        this.scrollOrKill_9409(x);
        this.sprites2_942E(x);
        m[x + 3]--;
        if (m[x + 3]) return;
        m[x + 2]++;
        m[x + 9] = 0;
        m[x + 7] = m[x + 5];
        return;
      case 1:
        this.anim2_938C(x);
        this.projectileMove_945A(x);
        if (!m[x]) return;
        this.scrollOrKill_9409(x);
        this.sprites2_942E(x);
        return;
      case 2: case 4: return;
      case 3:
        m[x + 17]--;
        if (!m[x + 17]) { m[x] = 0; m[x + 6] = 0; m[x + 22] = 0; return; }
        this.anim2_938C(x);
        this.scrollOrKill_9409(x);
        if (!m[x]) return;
        m[x + 22] = (m[x + 6] + 0x10) & 0xff;
        m[x + 20] = m[x + 4];
        return;
      default: this.todo(0x93f3);
    }
  };

  // objects leaving the screen are cleared (the caller carries on, like the original)
  G.scrollOrKill_9409 = function (x) {
    const a = this.m[x + 6];
    if (a >= 0xf0 && a < 0xf4) { this.clearWords_947F(x, 4); return true; }
    this.scrollY_9413(x);
    return false;
  };

  G.scrollY_9413 = function (x) {
    const m = this.m;
    const pg = m[0x2203];
    if (!pg || pg === 0xf8) return;
    const w = m[0x240a];
    if (!w) return;
    if (w === 1) m[x + 6] += 2; else m[x + 6] -= 2;
  };

  G.sprites2_942E = function (x) {
    const m = this.m;
    m[x + 22] = m[x + 6];
    m[x + 20] = (m[x + 4] + 0xf0) & 0xff;
  };

  G.projectileMove_945A = function (x) {
    const m = this.m;
    if (m[x + 9]) {
      m[x + 3]--;
      if (!m[x + 3]) this.clearWords_947F(x, 8);
      return;
    }
    m[x + 4] = (m[x + 4] - m[x + 7]) & 0xff;
    let d = this.r16(x + 7);
    if (d >> 8) {
      d = (d + 0xfff0) & 0xffff;
      this.w16(x + 7, d);
      if (d) return;
    }
    m[x + 8] = 0;
    m[x + 9]++;
    m[x + 3] = 8;
  };

  G.clearWords_947F = function (x, n) {
    for (let i = 0; i < n * 4; i++) this.m[x + i] = 0;
  };

  G.s3Thrown_94B9 = function (x) {
    const m = this.m;
    if (!m[x]) return;
    switch (m[x + 2]) {
      case 0:
        this.anim1_7F46(x);
        this.projectileMove_945A(x);
        this.spin_9540(x);
        this.scrollOrKill_9409(x);
        if (m[x + 9]) m[x + 2]++;
        return;
      case 1: {
        this.anim1_7F46(x);
        this.spin_9540(x);
        this.scrollOrKill_9409(x);
        if (!m[x]) return;
        m[x + 4] = (m[x + 4] + m[x + 7]) & 0xff;
        const d = (this.r16(x + 7) + 0x10) & 0xffff;
        this.w16(x + 7, d);
        let a = d >> 8;
        if (a === 3 && !(d & 0xff)) {
          const y = this.parent_954B(x);
          if (!m[y]) { this.clearWords_947F(x, 4); return; }
          this.w16(y + 12, 0xed72);
          m[y + 11] = 0;
          a = y >> 8;
        }
        if (a !== m[x + 5]) {
          const y = this.parent_954B(x);
          if (!m[y]) this.clearWords_947F(x, 4);
          return;
        }
        m[x + 9] = 0; m[x + 8] = 0;
        const y = this.parent_954B(x);
        if (!m[y + 60]) { m[x] = 0; m[x + 6] = 0; m[x + 4] = 0; return; }
        m[x + 4] = (m[y + 4] + 0xf0) & 0xff;
        m[x + 6] = m[y + 6];
        this.w16(x + 12, 0xedc0);
        m[x + 11] = 0;
        m[x + 3] = 0x10;
        m[x + 2]++;
        this.anim1_7F46(x);
        return;
      }
      case 2: {
        this.anim1_7F46(x);
        this.scrollOrKill_9409(x);
        const y = this.parent_954B(x);
        if (!m[y]) { this.clearWords_947F(x, 4); return; }
        m[x + 3]--;
        if (!m[x + 3]) m[x + 2] = 0;
        return;
      }
      case 3: case 4: return;
      default: this.todo(0x94c3);
    }
  };

  G.spin_9540 = function (x) {
    const m = this.m;
    const a = (m[x + 10] + 0x20) & 0xff;
    if (!a) m[x + 6]++;
    m[x + 10] = a;
  };

  // clown owning a thrown object (low byte in +1, 0 = 0x2500)
  G.parent_954B = function (x) {
    const b = this.m[x + 1];
    return ((b ? 0x24 : 0x25) << 8) | b;
  };

  // a new clown appears at some camera positions; returns true to stop the scan
  G.s3Spawn_956E = function (x) {
    const m = this.m;
    const w = m[0x240a];
    if (m[0x2207] && w !== 2) return false;
    if (!w) return false;
    if (m[x] | m[x + 1]) return false;
    let b = 0;
    let a = m[0x2204];
    if (a !== 0xc4) {
      if (a > 0xc4) return true;
      b = 2;
      if (a !== 0x18) {
        if (a < 0x18) return true;
        b = 1;
        if (a !== 0x74) return true;
      }
    }
    m[0x28fe] = a;
    m[0x28ff] = b;
    for (let u = 0x2440; u < 0x2540; u += 64) {
      if ((m[u] | m[u + 1]) && m[x + 59] === m[0x28fe]) return true;
    }
    let u = m[0x2207] ? 0xf63b : 0xf58d;
    a = 2;
    if (m[0x2022]) a = s8(m[0x202f] & 0x60) >> 4 & 0xff;
    m[0x28f3] = a;
    b = m[0x2210];
    if (b) b = ((b - 1) << 1) & 0xff;
    m[0x28fd] = b;
    a = (a + b) & 0xff;
    if (m[0x2207]) {
      const bb = m[0x28f2];
      let yy = 0xfb17;
      while (bb >= this.rom8(yy++)) a = (a + 2) & 0xff;
    }
    if (a >= 0x0a) a = 0x0a;
    u = this.rom16(u + s8(a));
    a = (-m[0x2203]) & 0xff;
    if (m[0x240a] === 1 && a) a = (a - 1) & 0xff;
    u = this.rom16(u + s8((a << 1) & 0xff));
    b = this.rom8(u + s8(m[0x28ff]));
    if (!b) return true;
    m[0x28fb] = 0;
    if (m[0x2207]) {
      m[0x28fb] = b & 0x80;
      b &= 0x7f;
      m[0x28fd] = b;
      u = 0xee14;
      b = (b - 1) & 0xff;
      if (b) u = 0xee74;
    } else {
      u = 0xed5d;
      b = (b - 1) & 0xff;
      if (b) u = 0xed8d;
    }
    m[x + 56] = b; m[x + 60] = b;
    a = m[0x2210];
    if (a) a--;
    m[0x28fe] = a;
    a = ((s8(m[0x28f3]) >> 1) + m[0x28fe]) & 0xff;
    const bb = m[0x28f2];
    let yy = 0xfb17;
    while (bb >= this.rom8(yy++)) a = (a + 1) & 0xff;
    if (a >= 9) a = 9;
    a = this.rom8(0xfb21 + s8(a));
    m[x + 55] = a; m[x + 57] = a;
    m[x + 59] = m[0x28fe];
    return this.s3SpawnClown_9666(x, u);
  };

  G.s3SpawnClown_9666 = function (x, u) {
    const m = this.m;
    for (;;) {
      m[x]++;
      m[x + 4] = 0xe0; m[x + 6] = 0xf1;
      this.w16(x + 12, u);
      m[x + 11] = 0; m[x + 5] = 0;
      if (!m[0x2207]) return true;
      // second loop version: juggling clowns
      m[x + 2] = 3;
      this.juggle_98AB(x);
      m[x + 7] = m[0x28fd] === 1 ? 1 : 3;
      m[x + 4] = 0xc8;
      m[x + 35] = m[0x28ff];
      if (!m[x + 35]) {
        this.juggle_98A7(x);
        this.w16(x + 12, m[x + 7] === 1 ? 0xee44 : 0xeea4);
      }
      if (m[0x28fd] === 3) {
        let xx = 0x2440;
        for (; xx < 0x2540; xx += 64) if (!m[xx]) break;
        if (xx >= 0x2540) return true;
        x = xx;
        m[0x28fd] = 1;
        u = 0xee14;
        continue;
      }
      if (!m[0x28fb]) return true;
      let y = m[x + 35] ? 0x2d28 : 0x2520;
      m[x + 4] = (m[x + 4] + (y >> 8)) & 0xff;
      m[x + 6] = (m[x + 6] + (y & 0xff)) & 0xff;
      m[x + 7] = 4;
      m[x + 23] = 0; m[x + 24] = 0;
      m[x + 37]++;
      this.w16(x + 12, 0xeedc);
      this.anim4b_9354(x);
      return true;
    }
  };

  G.s3Clown_971F = function (x) {
    const m = this.m;
    if (!(m[x] | m[x + 1])) return;
    switch (m[x + 2]) {
      case 0: {
        this.anim4b_9354(x);
        this.clownThrow_975B(x);
        const pg = m[0x2203];
        if (!pg || pg === 0xf8) return;
        const w = m[0x240a];
        if (!w) return;
        if (w === 1) m[x + 6] += 2; else m[x + 6] -= 2;
        this.sprites4_84BD(x);
        if (m[x + 6] === 0xf1) this.clearObj64_97F7(x);
        return;
      }
      case 1: case 4: case 5: return;
      case 2: this.clearObj64_97F7(x); return;
      case 3:
        if (!m[x + 37]) this.anim4b_9354(x);
        this.juggleMove_9828(x);
        this.juggleScroll_98DF(x);
        if (m[x]) this.sprites4_84BD(x);
        return;
      case 6: this.s3Hit_918B(x); return;
      default: this.todo(0x972b);
    }
  };

  G.clearObj64_97F7 = function (x) { for (let i = 0; i < 64; i++) this.m[x + i] = 0; };

  G.clownThrow_975B = function (x) {
    const m = this.m;
    if (!m[x + 60]) {
      m[x + 57]--;
      if (m[x + 57]) return;
      let u = 0x2580;
      for (; u < 0x25e0; u += 32) if (!m[u]) break;
      if (u >= 0x25e0) return;
      m[u]++;
      m[u + 4] = (m[x + 4] + 0xf2) & 0xff;
      m[u + 6] = (m[x + 6] + 4) & 0xff;
      m[u + 2] = 0;
      this.w16(u + 12, 0xed99);
      m[u + 11] = 0;
      m[u + 3] = 8; m[u + 5] = 4;
      this.w16(x + 12, 0xed39);
      m[x + 11] = 0;
      m[x + 57] = m[x + 55];
      return;
    }
    if (!m[x + 56]) return;
    m[x + 57]--;
    if (m[x + 57]) return;
    let u = 0x2540;
    for (; u < 0x2580; u += 16) if (!m[u]) break;
    if (u >= 0x2580) return;
    m[u]++;
    m[u + 4] = (m[x + 4] + 0xf0) & 0xff;
    m[u + 6] = m[x + 6];
    m[u + 2] = 0;
    this.w16(u + 12, 0xedc3);
    m[u + 11] = 0;
    m[u + 3] = 8; m[u + 5] = 4; m[u + 7] = 4; m[u + 9] = 0;
    m[u + 1] = x & 0xff;
    this.w16(x + 12, 0xed84);
    m[x + 11] = 0;
    m[x + 57] = m[x + 55];
    m[x + 56]--;
  };

  // --- second loop (never reached in normal play of the first loop)
  G.juggleMove_9828 = function (x) {
    const m = this.m;
    let b = m[x + 7];
    if (b & 1) {
      let a = m[x + 4];
      a = b === 3 ? (a + m[x + 23]) & 0xff : (a - m[x + 23]) & 0xff;
      m[x + 4] = a;
      let d = this.r16(x + 23);
      if (d >> 8) {
        d = (d + 0xffd0) & 0xffff;
        this.w16(x + 23, d);
        if (d) return;
      }
      m[x + 24] = 0;
      m[x + 7]++;
      return;
    }
    let a = m[x + 4];
    a = b === 4 ? (a - m[x + 23]) & 0xff : (a + m[x + 23]) & 0xff;
    m[x + 4] = a;
    const d = (this.r16(x + 23) + 0x30) & 0xffff;
    this.w16(x + 23, d);
    if ((d >> 8) !== m[x + 8] || (d & 0xff) !== m[x + 58]) return;
    a = m[x + 4];
    b = m[x + 7];
    a = b === 4 ? (a - m[x + 8]) & 0xff : (a + m[x + 8]) & 0xff;
    m[x + 4] = a;
    m[x + 35]--;
    a = m[x + 35];
    if (!a) {
      this.juggle_98A7(x);
      this.w16(x + 12, m[x + 7] === 4 ? 0xee44 : 0xeea4);
      m[x + 11] = 0;
    } else {
      a = (a + 1) & 0xff;
      if (!a) m[x + 35] = 2;
      this.juggle_98AB(x);
      this.w16(x + 12, m[x + 7] === 4 ? 0xee14 : 0xee74);
      m[x + 11] = 0;
    }
    b = (b + 1) & 0xff;
    if (b >= 5) b = 1;
    m[x + 7] = b;
    this.jugglePin_990F(x);
  };

  G.juggle_98A7 = function (x) { this.m[x + 24] = 0x20; this.m[x + 58] = 0x20; };
  G.juggle_98AB = function (x) {
    const m = this.m;
    m[x + 8] = 4; m[x + 23] = 4;
    m[x + 24] = 0x80; m[x + 58] = 0x80;
  };

  G.juggleScroll_98DF = function (x) {
    const m = this.m;
    let b = 0xfe;
    if (m[0x2203] && m[0x240a]) {
      b = 0;
      if (m[0x240a] !== 1) b = 0xfc;
    }
    m[0x28fe] = b;
    const a = (m[x + 6] + b) & 0xff;
    m[x + 6] = a;
    if (a >= 0xf4 || a < 0xf1) return;
    if (!m[x + 37]) this.clearObj64_97F7(x);
    m[x + 37] = 0;
  };

  G.jugglePin_990F = function (x) {
    const m = this.m;
    let u = 0x2580;
    for (; u < 0x2600; u += 32) if (!m[u]) break;
    if (u >= 0x2600) return;
    m[u]++;
    m[u + 2] = 3;
    m[u + 4] = (m[x + 4] + 0xfc) & 0xff;
    m[u + 6] = m[x + 6];
    this.w16(u + 12, m[x + 7] === 1 ? 0xeed4 : 0xeed8);
    m[u + 11] = 0;
    m[u + 17] = 0x20;
  };
})(typeof window !== 'undefined' ? window : globalThis);
