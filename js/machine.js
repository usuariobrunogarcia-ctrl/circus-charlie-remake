/*
 * Circus Charlie (Konami GX380) hardware.
 *
 * Main board : Konami-1 (encrypted 6809) @ 1.536 MHz
 * Sound board: Z80 @ 3.579545 MHz, 2 x SN76489A, 8 bit DAC, switchable RC filters
 * Video      : 32x32 tilemap of 8x8 4bpp chars with per column scroll,
 *              64 16x16 4bpp sprites (double buffered), 32 colour palette PROM
 *              + two 256x4 colour lookup PROMs. Screen is rotated 90 degrees.
 */
(function (root) {
  'use strict';
  const CC = root.CC;

  const MAIN_CLOCK = 18432000 / 12;         // 1.536 MHz
  const SOUND_CLOCK = 14318181 / 4;         // 3.579545 MHz
  const PSG_CLOCK = 14318181 / 8;           // 1.789772 MHz
  const LINES = 264, VBLANK_LINE = 240;
  const LINE_RATE = 18432000 / 3 / 384;     // 16000 lines per second
  const FPS = LINE_RATE / LINES;            // ~60.606 Hz
  const MAIN_PER_LINE = MAIN_CLOCK / LINE_RATE;    // 96
  const SOUND_PER_LINE = SOUND_CLOCK / LINE_RATE;  // ~223.7
  const PSG_TICK_RATE = PSG_CLOCK / 16;             // tone generators step rate

  // ROM set description. Several names are accepted for the program ROMs so
  // that other revisions of the game work too.
  const ROMSET = {
    main: [
      { names: ['380_u05.3h', '380_s05.3h', '380_w05.3h', '380_r05.3h', '380_p05.3h'], offset: 0x6000 },
      { names: ['380_p04.4h', '380_q04.4h', '380_r04.4h', '380_n04.4h'], offset: 0x8000 },
      { names: ['380_p03.5h', '380_q03.5h', '380_r03.5h', '380_n03.5h'], offset: 0xa000 },
      { names: ['380_p02.6h', '380_q02.6h', '380_r02.6h', '380_n02.6h'], offset: 0xc000 },
      { names: ['380_p01.7h', '380_q01.7h', '380_n01.7h'], offset: 0xe000 },
    ],
    sound: [
      { names: ['380_l14.5c'], offset: 0x0000 },
      { names: ['380_l15.7c'], offset: 0x2000 },
    ],
    tiles: [
      { names: ['380_j12.4a'], offset: 0x0000 },
      { names: ['380_j13.5a', '380_k13.5a'], offset: 0x2000 },
    ],
    sprites: [
      { names: ['380_j06.11e'], offset: 0x0000 },
      { names: ['380_j07.12e'], offset: 0x2000 },
      { names: ['380_j08.13e'], offset: 0x4000 },
      { names: ['380_j09.14e'], offset: 0x6000 },
      { names: ['380_j10.15e'], offset: 0x8000 },
      { names: ['380_j11.16e'], offset: 0xa000 },
    ],
    proms: [
      { names: ['380_j18.2a'], offset: 0x000, size: 0x20 },
      { names: ['380_j17.7b'], offset: 0x020, size: 0x100 },
      { names: ['380_j16.10c'], offset: 0x120, size: 0x100 },
    ],
  };

  function findFile(files, names) {
    for (const n of names) {
      for (const k of Object.keys(files)) {
        const base = k.split('/').pop().toLowerCase();
        if (base === n) return { name: n, data: files[k] };
      }
    }
    return null;
  }

  function loadRegion(files, list, size, missing) {
    const region = new Uint8Array(size);
    const used = [];
    for (const ent of list) {
      const f = findFile(files, ent.names);
      if (!f) { missing.push(ent.names[0]); continue; }
      const len = ent.size || 0x2000;
      region.set(f.data.subarray(0, len), ent.offset);
      used.push(f.name);
    }
    return { region, used };
  }

  /** Builds the ROM regions from a {filename: Uint8Array} map. Throws on missing files. */
  function buildRoms(files) {
    const missing = [];
    const main = loadRegion(files, ROMSET.main, 0x10000, missing);
    const sound = loadRegion(files, ROMSET.sound, 0x4000, missing);
    const tiles = loadRegion(files, ROMSET.tiles, 0x4000, missing);
    const sprites = loadRegion(files, ROMSET.sprites, 0xc000, missing);
    const proms = loadRegion(files, ROMSET.proms, 0x220, missing);
    if (missing.length) {
      const err = new Error('Faltan archivos del ROM: ' + missing.join(', '));
      err.missing = missing;
      throw err;
    }
    return {
      main: main.region, sound: sound.region, tiles: tiles.region,
      sprites: sprites.region, proms: proms.region,
      version: main.used[0],
    };
  }

  function findBytes(mem, pat, from) {
    for (let a = from || 0x6000; a <= mem.length - pat.length; a++) {
      let ok = true;
      for (let i = 0; i < pat.length; i++) if (mem[a + i] !== pat[i]) { ok = false; break; }
      if (ok) return a;
    }
    return -1;
  }

  // Konami-1 opcode decryption
  function konami1(addr, v) {
    switch (addr & 0xa) {
      case 0x0: return v ^ 0x22;
      case 0x2: return v ^ 0x82;
      case 0x8: return v ^ 0x28;
      default: return v ^ 0x88;
    }
  }

  class CircusCharlie {
    constructor(roms, options) {
      options = options || {};
      this.roms = roms;
      this.sampleRate = options.sampleRate || 48000;

      // --- main cpu memory
      this.mem = new Uint8Array(0x10000);
      this.mem.set(roms.main.subarray(0x6000), 0x6000);
      this.opcodes = new Uint8Array(0x10000);
      for (let a = 0; a < 0x10000; a++) this.opcodes[a] = konami1(a, this.mem[a]);

      // --- sound cpu memory
      this.smem = new Uint8Array(0x10000);
      this.smem.set(roms.sound, 0);

      // I/O state
      this.inSystem = 0xff;
      this.inP1 = 0xff;
      this.inP2 = 0xff;
      this.dsw1 = options.dsw1 !== undefined ? options.dsw1 : 0xff;
      this.dsw2 = options.dsw2 !== undefined ? options.dsw2 : 0x4b;
      this.latch = new Uint8Array(8);
      this.scroll = 0;
      this.soundLatch = 0;
      this.spriteBuffer = new Uint8Array(0x100);
      this.frame = 0;

      // hooks
      this.onVideoFrame = null;     // (machine) => void, called at vblank before the sprite buffer copy
      this.writeWatch = null;       // optional (addr, value, pc) => void for main cpu RAM writes

      const self = this;
      this.cpu = new CC.M6809({
        read(a) { return self.mainRead(a); },
        write(a, v) { self.mainWrite(a, v); },
        readOp(a) {
          if (a >= 0x6000) return self.opcodes[a];
          return konami1(a, self.mainRead(a));
        },
      });

      this.snd = new CC.Z80({
        read(a) { return self.soundRead(a); },
        write(a, v) { self.soundWrite(a, v); },
        in() { return 0xff; },
        out() {},
        irqAck() { self.snd.irqLine = false; return 0xff; },
      });

      this.psg = [new CC.SN76489A(), new CC.SN76489A()];
      this.snLatch = 0;
      this.dac = 0;
      this.filt = [0, 0, 0];
      this.soundEvents = [];
      this.audio = new SoundRenderer(this);

      this.origMain = new Uint8Array(this.mem);
      this.checksumLoop = findBytes(this.mem, [0xc9, 0xa2, 0x0b, 0x00]); // ADDB ,-Y / ADCA #0 (ROM test)
      this.patched = false;
      if (options.enterPatch !== false) this.applyEnterPatch();

      this.reset();
    }

    /*
     * "Press ENTER" patch: the port runs the board in Free Play mode and
     * rewrites the attract-mode texts so that the title asks for ENTER
     * instead of a coin.  The ROM self test still sees the original bytes.
     */
    applyEnterPatch() {
      const mem = this.mem;
      const text = (s) => Array.from(s, (ch) => ch.charCodeAt(0) === 0x20 ? 0x40 : ch.charCodeAt(0));
      // string records: [colour, addr lo, addr hi, ascii..., 0x3f]
      const free = findBytes(mem, text('FREE PLAY').concat([0x3f]), 0xc000);
      if (free > 0) {
        const rec = free - 3;
        // pointer table entry to that record
        let ptr = -1;
        for (let a = 0x6000; a < 0xffff; a++) if (mem[a] === rec >> 8 && mem[a + 1] === (rec & 0xff)) { ptr = a; break; }
        // find some free space (0xff run) at the end of the ROM
        let space = -1;
        for (let a = 0xff00; a < 0xffe0; a++) {
          let ok = true;
          for (let i = 0; i < 16; i++) if (mem[a + i] !== 0xff) { ok = false; break; }
          if (ok) { space = a + 4; break; }
        }
        if (ptr > 0 && space > 0) {
          const nrec = [mem[rec], (mem[rec + 1] + 0x20) & 0xff, mem[rec + 2]].concat(text('PUSH ENTER'), [0x3f]);
          nrec.forEach((v, i) => { mem[space + i] = v; });
          mem[ptr] = space >> 8; mem[ptr + 1] = space & 0xff;
          this.patched = true;
        }
      }
      const pst = findBytes(mem, text('PRESS START BUTTON'), 0xc000);
      if (pst > 0) { text('  PUSH ENTER KEY  ').forEach((v, i) => { mem[pst + i] = v; }); this.patched = true; }
      if (this.patched) this.dsw1 = 0x00; // free play
    }

    reset() {
      this.mem.fill(0, 0x0000, 0x6000);
      this.latch.fill(0);
      this.scroll = 0;
      this.cpu.reset();
      this.snd.reset();
      this.snd.irqLine = false;
      this.cpu.irqLine = false;
      this.psg[0].reset();
      this.psg[1].reset();
      this.snLatch = 0;
      this.frameStartSoundCycles = this.snd.totalCycles;
      this.soundEvents.length = 0;
    }

    get flip() { return this.latch[0]; }
    get irqMask() { return this.latch[1]; }
    get spriteBank() { return this.latch[5]; }

    // ------------------------------------------------------------ main bus
    mainRead(a) {
      if (a >= 0x2000) {
        if (a < 0x4000) return this.mem[a];
        if (a >= 0x6000) {
          if (this.patched) {
            const pc = this.cpu.pc;
            if (pc >= this.checksumLoop - 8 && pc <= this.checksumLoop + 20) return this.origMain[a];
          }
          return this.mem[a];
        }
        return 0;
      }
      if (a >= 0x1000) {
        switch (a & 0x1c00) {
          case 0x1000:
            switch (a & 3) {
              case 0: return this.inSystem;
              case 1: return this.inP1;
              case 2: return this.inP2;
              default: return 0xff;
            }
          case 0x1400: return this.dsw1;
          case 0x1800: return this.dsw2;
          default: return 0;
        }
      }
      return 0;
    }

    mainWrite(a, v) {
      if (a >= 0x2000) {
        if (a < 0x4000) {
          if (this.writeWatch) this.writeWatch(a, v);
          this.mem[a] = v;
        }
        return;
      }
      switch (a & 0x1c00) {
        case 0x0000: {
          const bit = a & 7;
          this.latch[bit] = v & 1;
          if (bit === 1 && !(v & 1)) this.cpu.irqLine = false;
          break;
        }
        case 0x0400: break; // watchdog
        case 0x0800: this.soundLatch = v; break;
        case 0x0c00: this.snd.irqLine = true; break;
        case 0x1c00: this.scroll = v; break;
      }
    }

    // ----------------------------------------------------------- sound bus
    soundRead(a) {
      if (a < 0x4000) return this.smem[a];
      if (a < 0x6000) return this.smem[0x4000 | (a & 0x3ff)];
      if (a < 0x8000) return this.soundLatch;
      if (a < 0xa000) return (Math.floor(this.snd.totalCycles) >> 9) & 0x1e;
      return 0xff;
    }

    soundWrite(a, v) {
      if (a >= 0x4000 && a < 0x6000) { this.smem[0x4000 | (a & 0x3ff)] = v; return; }
      if (a >= 0xa000 && a < 0xc000) {
        const off = a & 0x7f;
        const t = this.snd.totalCycles + (this.snd.icount < 0 ? 0 : 0) - this.frameStartSoundCycles;
        switch (off & 7) {
          case 0: this.snLatch = v; break;
          case 1: this.soundEvents.push(t, 0, this.snLatch); break;
          case 2: this.soundEvents.push(t, 1, this.snLatch); break;
          case 3: this.soundEvents.push(t, 2, v); break;
          case 4:
            this.soundEvents.push(t, 3, ((off & 0x20) >> 5) | (((off & 0x18) >> 3) << 1) | (((off & 0x40) >> 6) << 3));
            break;
        }
      }
    }

    // ------------------------------------------------------------ inputs
    setInputs(inp) {
      // inp: {coin, start1, start2, service, left, right, button, left2, right2, button2}
      let s = 0xff;
      if (inp.coin) s &= ~0x01;
      if (inp.coin2) s &= ~0x02;
      if (inp.service) s &= ~0x04;
      if (inp.start1) s &= ~0x08;
      if (inp.start2) s &= ~0x10;
      this.inSystem = s;
      let p = 0xff;
      if (inp.left) p &= ~0x01;
      if (inp.right) p &= ~0x02;
      if (inp.button) p &= ~0x10;
      this.inP1 = p;
      let p2 = 0xff;
      if (inp.left2) p2 &= ~0x01;
      if (inp.right2) p2 &= ~0x02;
      if (inp.button2) p2 &= ~0x10;
      this.inP2 = p2;
    }

    // ------------------------------------------------------------ frame
    runFrame(renderAudio) {
      this.frameStartSoundCycles = this.snd.totalCycles;
      this.soundEvents.length = 0;
      let mainAcc = 0, sndAcc = 0;
      for (let line = 0; line < LINES; line++) {
        if (line === VBLANK_LINE) this.vblank();
        mainAcc += MAIN_PER_LINE;
        const m = Math.floor(mainAcc);
        mainAcc -= m;
        this.cpu.execute(m);
        sndAcc += SOUND_PER_LINE;
        const s = Math.floor(sndAcc);
        sndAcc -= s;
        this.snd.execute(s);
      }
      const frameSoundCycles = this.snd.totalCycles - this.frameStartSoundCycles;
      if (renderAudio !== false) this.audio.renderFrame(this.soundEvents, frameSoundCycles);
      this.frame++;
    }

    vblank() {
      if (this.onVideoFrame) this.onVideoFrame(this);
      if (this.irqMask) this.cpu.irqLine = true;
      const base = this.spriteBank ? 0x3900 : 0x3800;
      this.spriteBuffer.set(this.mem.subarray(base, base + 0x100));
    }

    // ------------------------------------------------------------ save states
    saveState() {
      const grab = (o) => {
        const st = {};
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (typeof v === 'number' || typeof v === 'boolean') st[k] = v;
          else if (ArrayBuffer.isView(v)) st[k] = v.slice();
        }
        return st;
      };
      return {
        cpu: grab(this.cpu), snd: grab(this.snd), psg0: grab(this.psg[0]), psg1: grab(this.psg[1]),
        ram: this.mem.slice(0x0000, 0x6000), sram: this.smem.slice(0x4000, 0x4400),
        latch: this.latch.slice(), spriteBuffer: this.spriteBuffer.slice(),
        scroll: this.scroll, soundLatch: this.soundLatch, snLatch: this.snLatch, frame: this.frame,
      };
    }

    loadState(st) {
      const put = (o, s) => {
        for (const k of Object.keys(s)) {
          if (ArrayBuffer.isView(s[k])) o[k].set(s[k]); else o[k] = s[k];
        }
      };
      put(this.cpu, st.cpu); put(this.snd, st.snd); put(this.psg[0], st.psg0); put(this.psg[1], st.psg1);
      this.mem.set(st.ram, 0); this.smem.set(st.sram, 0x4000);
      this.latch.set(st.latch); this.spriteBuffer.set(st.spriteBuffer);
      this.scroll = st.scroll; this.soundLatch = st.soundLatch; this.snLatch = st.snLatch; this.frame = st.frame;
    }

    /** Snapshot of everything needed to draw one frame. */
    videoState(out) {
      out = out || {
        videoram: new Uint8Array(0x400), colorram: new Uint8Array(0x400),
        sprites: new Uint8Array(0x100), scroll: 0, flip: 0,
      };
      out.videoram.set(this.mem.subarray(0x3400, 0x3800));
      out.colorram.set(this.mem.subarray(0x3000, 0x3400));
      out.sprites.set(this.spriteBuffer);
      out.scroll = this.scroll;
      out.flip = this.flip;
      return out;
    }
  }

  /*
   * Renders the sound board output: two PSGs + DAC through the switchable RC
   * low-pass filters and the resistor mixer described in MAME's driver.
   */
  class SoundRenderer {
    constructor(machine) {
      this.m = machine;
      this.rate = machine.sampleRate;
      this.buffer = new Float32Array(4096);
      this.length = 0;
      this.samplePos = 0;               // fractional sample accumulator
      this.psgPhase = 0;
      this.state = new Float32Array(3); // filter states
      this.hp = 0; this.hpPrev = 0;
      this.dacLevel = 0;
      this.sw = 0;
      this.ticksPerSample = PSG_TICK_RATE / this.rate;
      this.tickAcc = 0;
      this.onSamples = null;
      this.lastOut = [0, 0];
    }

    applyEvent(type, value) {
      const m = this.m;
      switch (type) {
        case 0: m.psg[0].write(value); break;
        case 1: m.psg[1].write(value); break;
        case 2: this.dacLevel = value / 255; break;
        case 3: this.sw = value; break;
      }
    }

    renderFrame(events, frameCycles) {
      const rate = this.rate;
      const exact = frameCycles / SOUND_CLOCK * rate + this.samplePos;
      const n = Math.floor(exact);
      this.samplePos = exact - n;
      if (this.buffer.length < n) this.buffer = new Float32Array(n * 2);
      const buf = this.buffer;
      const psg0 = this.m.psg[0], psg1 = this.m.psg[1];
      const cyclesPerSample = frameCycles / Math.max(1, n);
      let ev = 0;
      const RC = 1000;
      const aOf = (C) => 1 - Math.exp(-1 / (RC * C * rate));
      const a047 = aOf(0.47e-6), a0047 = aOf(0.047e-6), a0517 = aOf(0.517e-6);
      const st = this.state;
      for (let i = 0; i < n; i++) {
        const tEnd = (i + 1) * cyclesPerSample;
        while (ev < events.length && events[ev] < tEnd) {
          this.applyEvent(events[ev + 1], events[ev + 2]);
          ev += 3;
        }
        // advance PSGs
        this.tickAcc += this.ticksPerSample;
        let ticks = Math.floor(this.tickAcc);
        this.tickAcc -= ticks;
        let s0 = 0, s1 = 0;
        if (ticks > 0) {
          for (let k = 0; k < ticks; k++) { s0 += psg0.tick(); s1 += psg1.tick(); }
          s0 /= ticks; s1 /= ticks;
          this.lastOut[0] = s0; this.lastOut[1] = s1;
        } else { s0 = this.lastOut[0]; s1 = this.lastOut[1]; }
        let d = this.dacLevel * 2;
        // switchable RC filters
        const sw = this.sw;
        if (sw & 1) { st[0] += (s0 - st[0]) * a047; s0 = st[0]; } else st[0] = s0;
        const f2 = (sw >> 1) & 3;
        if (f2) { st[1] += (s1 - st[1]) * (f2 === 1 ? a0047 : f2 === 2 ? a047 : a0517); s1 = st[1]; } else st[1] = s1;
        if (sw & 8) { st[2] += (d - st[2]) * a047; d = st[2]; } else st[2] = d;
        // resistor mixer (2.2k, 2.2k, 10k)
        let mix = (s0 / 2.2 + s1 / 2.2 + d / 10) / (1 / 2.2 + 1 / 2.2 + 1 / 10);
        // output coupling capacitor -> DC blocker
        const y = mix - this.hpPrev + 0.9985 * this.hp;
        this.hpPrev = mix; this.hp = y;
        let o = y * 1.6;
        if (o > 1) o = 1; else if (o < -1) o = -1;
        buf[i] = o;
      }
      while (ev < events.length) { this.applyEvent(events[ev + 1], events[ev + 2]); ev += 3; }
      this.length = n;
      if (this.onSamples) this.onSamples(buf, n);
    }
  }

  CircusCharlie.FPS = FPS;
  CircusCharlie.buildRoms = buildRoms;
  CircusCharlie.ROMSET = ROMSET;
  CC.CircusCharlie = CircusCharlie;
})(typeof window !== 'undefined' ? window : globalThis);
