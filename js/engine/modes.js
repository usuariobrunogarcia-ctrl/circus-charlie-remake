/*
 * Game flow: attract demo, game start (1 or 2 players), player change,
 * game over, stage scenery drawing.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const G = CC.Game.prototype;

  // ------------------------------------------------------------ attract demo
  G.attractDemo_685A = function () {
    const m = this.m;
    if (m[0x2002]) { m[0x2251] = 0; m[0x2252] = 0; m[0x2253] = 0; m[0x2250] = 0; return; }
    if (m[0x2253] === 2) { this.newGame_6B26(); return; }
    let b;
    if (m[0x2248]) b = 0;
    else {
      if (!m[0x2252]) {
        const st = m[0x2201];
        m[0x2256] = st === 5 ? 1 : st === 4 ? 0 : st + 2;
      }
      m[0x2248] = this.rom8(0xd343);
      b = this.rom8(0xd344);
    }
    m[0x2032] = b;
    m[0x2035] = (~b) & 0xff;
    this.startGame_6A14();
    const a = m[0x2249] ? (m[0x2201] === 5 ? 0 : m[0x2201] + 1) : m[0x2201];
    if (a === m[0x2256]) { m[0x2032] = 0x10; m[0x2257] = 1; }
    else m[0x2248] = (m[0x2248] - 1) & 0xff;
  };

  // "bookkeeping" screens (attract states 7 and 8, service only)
  G.bookkeepingText_6758 = function () {
    this.queueTask_6114(0x00, 0x20);
    this.m[0x2004]++;
    this.m[0x2005] = 0;
  };

  G.bookkeeping_6763 = function () {
    const m = this.m;
    if (!m[0x2005]) {
      let x = 0x35ab, u = 0x3a00;
      for (let i = 0; i < 3; i++) { this.hexByte_67CA(u++, x); x += 1; }
      x = 0x36b0;
      for (let i = 0; i < 6; i++) { this.hexByte_67CA(u++, x); x -= 96; }
      x = 0x36b2;
      for (let i = 0; i < 7; i++) { this.hexByte_67CA(u++, x); x -= 96; }
      this.bookkeepingPage_67E6();
      m[0x2005]++;
      m[0x28fd] = 0x40;
      return;
    }
    if (m[0x28fd]) { m[0x28fd]--; return; }
    if ((this.in.system & 0x18) !== 0) return;
    if ((this.in.p1 & 0x11) === 0) { m[0x2004] = 2; m[0x2005] = 0; return; }
    if (m[0x2005] >= 5) m[0x2005] = 0;
    this.bookkeepingPage_67E6();
    m[0x2005]++;
    m[0x28fd] = 0x40;
  };

  // two hex digits of RAM byte u at VRAM x / x-32
  G.hexByte_67CA = function (u, x) {
    const m = this.m;
    let a = m[u] >> 4;
    if (a >= 0x0a) a += 7;
    m[x] = a;
    a = m[u] & 0x0f;
    if (a >= 0x0a) a += 7;
    m[x - 32] = a;
  };

  G.bookkeepingPage_67E6 = function () {
    const m = this.m;
    m[0x28fe] = 0x0a;
    m[0x28ff] = 0x04;
    let x = 0x3795, u = 0x3a12;
    const page = m[0x2005];
    m[x - 0xa1] = page;
    for (let i = 0; i < page; i++) u += 0x28;
    for (;;) {
      this.hexByte_67CA(u++, x);
      m[x - 64] = 0x2c;
      x -= 96;
      this.hexByte_67CA(u++, x);
      x += 97;
      if (--m[0x28fe]) continue;
      m[0x28ff]--;
      if (!m[0x28ff]) return;
      x = this.rom16(0xd2e6 + ((m[0x28ff] << 1) & 0xff));
      m[0x28fe] = 0x0a;
    }
  };

  // ------------------------------------------------------------ mode 1: start
  G.modeStart_6939 = function () {
    const m = this.m;
    if (m[0x2241] < 1) m[0x2241] = 1;
    const b = m[0x2031];
    let a = 0, lbl;
    if (((m[0x2002] - 1) & 0xff) === 0) lbl = 0x6957;
    else if (m[0x2252]) lbl = 0x6962;
    else { a = 8; lbl = (b & 0x10) ? 0x6984 : 0x6957; }
    for (;;) {
      switch (lbl) {
        case 0x6957:
          if (m[0x2252]) { lbl = 0x696b; break; }
          a = 6;
          if (b & 0x08) { lbl = 0x6989; break; }
          lbl = 0x6962; break;
        case 0x6962:
          if (!m[0x2250]) { lbl = 0x696b; break; }
          a = 8; lbl = 0x696d; break;
        case 0x696b:
          a = 6; lbl = 0x696d; break;
        case 0x696d:
          if (m[0x2251]) a = 8;
          if (m[0x2253] === 1) { lbl = 0x6989; break; }
          if (m[0x2253] === 2) { lbl = 0x6996; break; }
          a = (m[0x2004] << 1) & 0xff;
          lbl = 0x6989; break;
        case 0x6984:
          m[0x2250] = 1;
          lbl = 0x6989; break;
        case 0x6989:
          if (a < 6) { lbl = 0x6996; break; }
          if (a !== 6) m[0x2251] = 1;
          a = 0x0a;
          lbl = 0x6996; break;
        case 0x6996:
          switch (a) {
            case 0x00: this.clearScreen_699B(); return;
            case 0x02: this.startMessages_69C2(); return;
            case 0x04: this.clearDemoFlags_69F1(); return;
            case 0x06: this.startOnePlayer_6B0E(); return;
            case 0x08: this.startTwoPlayers_6BEA(); return;
            case 0x0a: this.startGame_6A14(); return;
            default: this.todo(0x6996);
          }
      }
    }
  };

  G.clearScreen_699B = function () {
    const m = this.m;
    if (!m[0x2005]) {
      for (let x = 0x2400; x < 0x2800; x += 16) { m[x + 4] = 0; m[x + 6] = 0; }
      m[0x2009] = 0x17;
      m[0x2005]++;
      return;
    }
    this.clearScreenStep_BA63();
    if (!m[0x2009]) { m[0x2004]++; m[0x2008] = 0; }
  };

  G.startMessages_69C2 = function () {
    const m = this.m;
    this.queueTask_6114(0x00, 0x00);
    this.queueTask_6114(0x00, m[0x2002] < 2 ? m[0x2002] : 2);
    this.queueTask_6114(0x00, 0x03);
    this.queueTask_6114(0x00, 0x1d);
    this.queueTask_6114(0x00, ((m[0x202f] & 0x08) >> 3) + 4);
    this.queueTask_6114(0x06, ((m[0x202f] & 0x08) >> 3) + 4);
    m[0x2004]++;
  };

  G.clearDemoFlags_69F1 = function () {
    const m = this.m;
    m[0x2251] = 0; m[0x2252] = 0; m[0x2253] = 0; m[0x2250] = 0;
  };

  /** Starts a game (or the demo game) and runs the "stage preview" sequence. */
  G.startGame_6A14 = function () {
    const m = this.m;
    if (!m[0x2252]) {
      m[0x203a] = 0; m[0x2203] = 0; m[0x2204] = 0; m[0x2008] = 0; m[0x2242] = 0;
      m[0x2257] = 4;
      m[0x2270] = 0; m[0x2255] = 0;
      m[0x2252]++;
      m[0x2253]++;
      this.clearObjectsAndPlayfield_6AE0();
      return;
    }
    if (m[0x2250] && (m[0x2241] & 1) && m[0x2241] < 5) {
      const b = m[0x2241] === 3 ? 0x23 : 0x22;
      if (m[0x2240] >= 0x82) this.queueTask_6114(0, b);
      m[0x2240] = (m[0x2240] - 1) & 0xff;
      if (m[0x2240] >= 0x80) return;
      m[0x2241]++;
      m[0x2240] = 0;
      this.clearObjectsAndPlayfield_6AE0();
    }
    if (m[0x2252] === 1) {
      m[0x2252]++;
      this.previewInit_BF93();
      this.previewInit2_BC3A();
      return;
    }
    this.preview_C0A0();
    m[0x2270] = (m[0x2270] - 1) & 0xff;
    if (m[0x2270] === 0xc0) {
      m[0x2257] = (m[0x2257] - 1) & 0xff;
      if (!m[0x2257]) this.previewEnd_C213();
    }
    if (m[0x2251]) {
      if (m[0x2255] === 2) { m[0x2008] = 0; m[0x2253]++; this.clearObjectsAndPlayfield_6AE0(); return; }
      if (m[0x2255] !== 1 || m[0x2242]) { m[0x2252] = 2; return; }
      let a = m[0x202f];                        // (BITA: A keeps the whole DSW2 value)
      if (!(a & 0x04)) { a = 1; m[0x2008] = 1; }
      m[0x2242] = a;
      m[0x2241]++;
      this.clearObjectsAndPlayfield_6AE0();
      m[0x2257] = 4;
      m[0x2270] = 0;
      m[0x2256] = 0;
      m[0x2252] = 1;
      return;
    }
    if (m[0x2255] === 1) { m[0x2253]++; this.clearObjectsAndPlayfield_6AE0(); return; }
    m[0x2252] = 2;
  };

  G.clearObjectsAndPlayfield_6AE0 = function () {
    const m = this.m;
    for (let u = 0x2400; u < 0x2800; u += 16) { m[u + 4] = 0; m[u + 6] = 0; }
    this.clearPlayfield_6AF1();
  };

  // blanks the playfield (22 hardware columns x 32 rows)
  G.clearPlayfield_6AF1 = function () {
    const m = this.m;
    let x = 0x37aa;
    for (;;) {
      for (let i = 0; i < 0x16; i++) { m[x - 0x400] = 0x10; m[x] = 0x10; x++; }
      if (x === 0x3440) return;
      x -= 54;
    }
  };

  G.startOnePlayer_6B0E = function () {
    if (!this.m[0x2040]) this.todo(0x6b12);
    this.newGame_6B26();
  };

  G.startTwoPlayers_6BEA = function () {
    const m = this.m;
    if (!m[0x2040]) this.todo(0x6bee);
    m[0x2020] = 1;
    m[0x2021] = 0;
    this.newGame_6B2A();
  };

  G.newGame_6B26 = function () {
    this.m[0x2020] = 0;
    this.m[0x2021] = 0;
    this.newGame_6B2A();
  };

  G.newGame_6B2A = function () {
    const m = this.m;
    m[0x2251] = 0; m[0x2252] = 0; m[0x2253] = 0; m[0x2250] = 0; m[0x2008] = 0;
    for (let x = 0x2200; x < 0x2f80; x++) if (x !== 0x2201 && x !== 0x2281 && x !== 0x2301) m[x] = 0;
    let lives = (m[0x202f] & 3) + 3;
    if (lives >= 6) lives = 7;
    m[0x2200] = lives; m[0x2280] = lives; m[0x2300] = lives;
    m[0x2202] = m[0x200b]; m[0x2282] = m[0x200b]; m[0x2302] = m[0x200b];
    this.demoSetup_6BC4();
    if (m[0x2022]) {
      let a = m[0x2281];
      m[0x228e + ((a << 24) >> 24)]++;
      m[0x3a03 + ((a << 24) >> 24)]++;
      if (m[0x2020]) {
        a = m[0x2301];
        m[0x3a03 + ((a << 24) >> 24)]++;
        m[0x230e + ((a << 24) >> 24)]++;
      }
      this.queueTask_6114(0x00, 0x0c);
      const b = m[0x2020] ? 0x0d : 0x8d;
      this.queueTask_6114(0x00, b);
      this.queueTask_6114(0x00, b + 1);
      for (let x = 0x20a0; x < 0x20a6; x++) m[x] = 0;
    }
    m[0x2003] = 2; m[0x2004] = 0; m[0x2005] = 0; m[0x2006] = 0;
  };

  // demo: choose the stage and the recorded inputs
  G.demoSetup_6BC4 = function () {
    const m = this.m;
    if (m[0x2022]) return;
    let a = m[0x203d];
    while (a >= 6) a -= 6;
    m[0x2281] = a;
    const u = this.rom16(0xd44b + ((a << 1) & 0xff));
    this.w16(0x203b, u);
    m[0x203e] = this.rom8(u);
    m[0x203f] = 2;
    m[0x2014] = 0;
  };

  // ------------------------------------------------------------ mode 2: game
  G.modeGame_6C0E = function () {
    this.gameCommon_C888();
    switch (this.m[0x2006]) {
      case 0: this.gameClear_6C19(); break;
      case 1: this.gamePlayerStart_6C30(); break;
      case 2: this.drawStage_6E7C(); break;
      case 3: this.stagePlay_6C85(); break;
      case 4: this.stageClear_6C8E(); break;
      case 5: this.playerDied_6D61(); break;
      case 6: this.switchPlayer_6D73(); break;
      case 7: this.gameOver_6DA5(); break;
      default: this.todo(0x6c17);
    }
  };

  G.gameClear_6C19 = function () {
    const m = this.m;
    if (m[0x2005]) {
      this.clearScreenStep_BA63();
      if (!m[0x2009]) { m[0x2006]++; m[0x2005] = 0; }
      return;
    }
    m[0x2009] = 0x17;
    m[0x2005]++;
  };

  G.gamePlayerStart_6C30 = function () {
    const m = this.m;
    if (!m[0x2005]) {
      const src = (m[0x2020] && m[0x2021]) ? 0x2300 : 0x2280;
      for (let i = 0; i < 0x80; i++) m[0x2200 + i] = m[src + i];
      if (m[0x2020]) {
        if (!(m[0x202f] & 0x04)) m[0x2008] = m[0x2021];
        m[0x200a] = 0x3c;
        m[0x2005]++;
        return;
      }
      m[0x2005] = 2;
      m[0x200a] = 1;
      return;
    }
    if (m[0x2005] === 1) {
      this.queueTask_6114(0x00, (m[0x2021] + 7) & 0xff);
      m[0x2005]++;
      return;
    }
    m[0x200a] = (m[0x200a] - 1) & 0xff;
    if (!m[0x200a]) { m[0x2006] = 2; m[0x2005] = 0; }
  };

  G.stagePlay_6C85 = function () {
    switch (this.m[0x2201]) {
      case 0: this.stage1_701E(); break;
      case 1: this.stage2_7E5E(); break;
      case 2: this.stage3_8BE2(); break;
      case 3: this.stage4_994E(); break;
      case 4: this.stage5_A083(); break;
      case 5: this.stage6_AA49(); break;
      default: this.todo(0x6c8c);
    }
  };

  G.stageClear_6C8E = function () {
    const m = this.m;
    if (m[0x2005] < 2) {
      this.gameClear_6C19();
      if (m[0x2006] !== 5) return;
      m[0x2006]--;
      m[0x2005] = 2;
      this.stageClearInit_C363();
      return;
    }
    if (m[0x2005] === 2) { this.stageClearBonus_C36B(); return; }
    m[0x2203] = 0;
    m[0x2204] = 0; m[0x2205] = 0;
    m[0x2208] = 0; m[0x2209] = 0; m[0x220a] = 0; m[0x220b] = 0; m[0x220c] = 0; m[0x220d] = 0;
    if (!m[0x2207] && m[0x2005] === 3) {
      m[0x2251] = m[0x2021];
      if (!m[0x2252]) {
        m[0x2257] = 4;
        m[0x2270] = 0;
        m[0x2255] = 1;
        m[0x2256] = m[0x2201] === 5 ? 0 : m[0x2201] + 1;
        this.clearObjectsAndPlayfield_6AE0();
        m[0x2252]++;
        return;
      }
      if (m[0x2252] === 1) {
        m[0x2252]++;
        this.previewInit_BF93();
        this.previewInit2_BC3A();
        return;
      }
      this.preview_C0A0();
      m[0x2270] = (m[0x2270] - 1) & 0xff;
      if (m[0x2270] === 0xc0) {
        m[0x2257] = (m[0x2257] - 1) & 0xff;
        if (!m[0x2257]) this.previewEnd_C213();
      }
      if (m[0x2255] === 1) return;
      m[0x2005]++;
    }
    this.clearPlayfield_6AF1();
    m[0x2251] = 0; m[0x2252] = 0; m[0x2253] = 0;
    for (let x = 0x2400; x < 0x2800; x++) m[x] = 0;
    if (((m[0x2210] - 1) & 1) === 0 || !m[0x2207]) {
      const a = m[0x2201];
      m[0x220e + a]++;
      m[0x3a09 + a]++;
    }
    m[0x2006] = 2;
    m[0x2005] = 0;
  };

  G.playerDied_6D61 = function () {
    const m = this.m;
    if (!m[0x2022]) { this.endOfGame_6E4D(); return; }
    m[0x2006]++;
    m[0x2200] = (m[0x2200] - 1) & 0xff;
    if (!m[0x2200]) { m[0x2006]++; m[0x2005] = 0; }
  };

  G.switchPlayer_6D73 = function () {
    const m = this.m;
    const dst = m[0x2021] ? 0x2300 : 0x2280;
    for (let i = 0; i < 0x80; i++) m[dst + i] = m[0x2200 + i];
    if (m[0x2020]) {
      // the other player still has lives: swap
      const other = m[0x2021] ? 0x2280 : 0x2300;
      if (m[other]) m[0x2021] = m[0x2021] ? 0 : 1;
    }
    m[0x2006] = 0;
    m[0x2005] = 0;
  };

  G.gameOver_6DA5 = function () {
    const m = this.m;
    if (m[0x2005] === 2) { this.gameOverWait_6DFC(); return; }
    this.gameClear_6C19();
    if (m[0x2009]) return;
    this.queueTask_6114(0x00, 0x09);
    this.gameOverStats_C8C8();
    let x = 0x3a10;
    const a = m[x];
    m[x]++;
    x += 2;
    x += (((a << 1) & 0xff) << 24) >> 24;
    const u = m[0x2021] ? 0x2273 : 0x2271;
    m[x] = m[u + 1];
    m[x + 1] = m[u];
    m[0x200a] = 0x80;
    m[0x2006]--;
    let sum = 0;
    for (let i = 0; i < 6; i++) sum = CC.bcdAdd(sum & 0xff, m[0x220e + i], 0) & 0xff;
    m[0x2247] = sum;
    for (let i = 0; i < 6; i++) m[0x220e + i] = 0;
    m[0x2005] = 2;
    this.highScoreCheck_C642();
  };

  G.gameOverWait_6DFC = function () {
    const m = this.m;
    m[0x2251] = 0; m[0x2252] = 0; m[0x2253] = 0; m[0x2250] = 0;
    if (m[0x200a] === 2) {
      this.gameOverNameEntry_C669();
      if (m[0x2020]) {
        const other = m[0x2021] ? 0x2280 : 0x2300;
        if (m[other]) return;
      }
      if (!m[0x2002]) return;
      this.todo(0x6e26);                            // continue with credits (coin mode only)
    }
    m[0x200a]--;
    if (m[0x200a]) return;
    if (m[0x2020]) {
      const other = m[0x2021] ? 0x2280 : 0x2300;
      if (m[other]) { m[0x2006] = 6; m[0x2005] = 0; return; }
    }
    this.endOfGame_6E4D();
  };

  G.endOfGame_6E4D = function () {
    const m = this.m;
    if (m[0x2002]) { m[0x2003]--; m[0x2004] = 0; m[0x2005] = 0; m[0x2006] = 0; return; }
    const a = m[0x2201];
    if (m[0x2022]) { m[0x2022] = 0; m[0x2249] = 0; m[0x203d] = a; }
    else { m[0x203d]++; m[0x2249] = 1; }
    m[0x2003] = 0; m[0x2004] = 0; m[0x2005] = 0; m[0x2006] = 0;
  };

  // ------------------------------------------------------------ scenery
  G.drawStage_6E7C = function () {
    switch (this.m[0x2005]) {
      case 0: this.drawStageInit_6E84(); break;
      case 1: this.drawStageRow_6EBD(); break;
      case 2: this.drawStageRowStep_6EC7(); break;
      case 3: this.drawStageDone_7015(); break;
      default: this.todo(0x6e82);
    }
  };

  G.drawStageInit_6E84 = function () {
    const m = this.m;
    const st = m[0x2201];
    this.w16(0x28da, (st === 1 || st === 5) ? 0xd47b : 0xd4db);
    this.w16(0x2880, 0x37e0);
    const a = m[0x2207] ? 6 : st;
    this.w16(0x2882, this.rom16(0xd53b + ((a << 1) & 0xff)));
    m[0x28fe] = 8;
    m[0x2005]++;
    this.drawStageRow_6EBD();
  };

  G.drawStageRow_6EBD = function () {
    this.w16(0x2884, 0x2002);
    this.m[0x2005]++;
    this.drawStageRowStep_6EC7();
  };

  // draws one tile row (a screen column) of the stage every 2 frames
  G.drawStageRowStep_6EC7 = function () {
    const m = this.m;
    m[0x2885] = (m[0x2885] - 1) & 0xff;
    if (m[0x2885]) return;
    let x = this.r16(0x2880), y = (x - 0x400) & 0xffff;
    let u = this.r16(0x2882);
    for (;;) {
      let a = 0x10;
      let b = this.rom8(u++);
      if (b === 0) {
        m[0x2005]++;
        for (let i = 0x2880; i < 0x2900; i++) m[i] = 0;
        return;
      }
      if (b === 0x10) {
        a = this.rom8(u++);                       // run of blank tiles
        let done = false;
        do {
          m[x++] = b; m[y++] = b;
          m[0x2884] = (m[0x2884] - 1) & 0xff;
          if (!m[0x2884]) { done = true; break; }
          a = (a - 1) & 0xff;
        } while (a);
        if (done) break;
        continue;
      }
      if (b === 0xfe) {
        b = this.rom8(u++);                       // skip b tiles
        const sb = (b << 24) >> 24;
        x = (x + sb) & 0xffff; y = (y + sb) & 0xffff;
        m[0x2884] = (m[0x2884] - b) & 0xff;
        if ((y & 0x1f) >= 0x0b) continue;
        // colour run list for this row
        let p = this.r16(0x28da);
        let yy = (y - 10) & 0xffff;
        for (;;) {
          const c = this.rom8(p++);
          if (c === 0) break;
          if (c === 0xfe) { yy = (yy + ((this.rom8(p++) << 24) >> 24)) & 0xffff; continue; }
          let n = this.rom8(p++);
          do { m[yy++] = c; n = (n - 1) & 0xff; } while (n);
        }
        this.w16(0x28da, p);
        continue;
      }
      m[x++] = b;
      a = 0x10;
      if (x < 0x3600 && x >= 0x3540) {
        const col = x & 0x1f;
        if (col >= 2 && col < 6) a = 0x90;
      }
      m[y++] = a;
      m[0x2884] = (m[0x2884] - 1) & 0xff;
      if (!m[0x2884]) break;
    }
    // row finished
    x = (x - 64) & 0xffff;
    this.w16(0x2880, x);
    this.w16(0x2882, u);
    m[0x2005]--;
    const st = m[0x2201];
    if (st === 2) {
      const yy = (x - 0x3d7) & 0xffff;
      m[yy] = 0x10; m[yy + 1] = 0x10;
      if (m[0x2203] || !m[0x28fe]) return;
      const n = m[0x28fe];
      m[0x28fe]--;
      m[0x2890] = 8;
      const table = m[0x2207] ? 0xe98b : 0xe43b;
      const src = this.rom16(table + (((((-(n - 8)) & 0xff) + 1) << 1) & 0xff));
      this.drawBlock_922F(src, (x + 54) & 0xffff);
    } else if (st === 1) {
      if (m[0x2203] || !m[0x28fe]) return;
      const n = m[0x28fe];
      m[0x28fe]--;
      m[0x2890] = 0x0b;
      const src = this.rom16(0xdf2c + (((((-(n - 8)) & 0xff) + 1) << 1) & 0xff));
      this.drawBlock_922F(src, (x + 50) & 0xffff);
    } else if (st === 5) {
      m[x + 42] = 0xc0;
      m[x + 51] = 0x10;
    } else if (st === 3) {
      const yy = (x - 0x3d7) & 0xffff;
      m[yy] = 0x1c; m[yy + 1] = 0x1c;
    } else if (st === 0) {
      m[x + 49] = 0x34;
    }
  };

  G.drawStageDone_7015 = function () {
    this.m[0x2006]++;
    this.m[0x2005] = 0;
    this.queueTask_6114(0x03, 0x00);
  };
})(typeof window !== 'undefined' ? window : globalThis);
