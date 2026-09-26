/*
 * Circus Charlie - game engine rewritten in JavaScript.
 *
 * The engine is a reimplementation of the original game program (reverse
 * engineered from the arcade ROMs). It does not emulate the CPU: every routine
 * of the original was studied and rewritten here as JavaScript.
 *
 * Game state is kept in a byte array laid out exactly like the original work
 * RAM (0x2000-0x2FFF), video RAM (0x3000-0x37FF) and sprite RAM (0x3800-0x39FF).
 * Keeping the original layout allows the tools/ folder to verify, frame by
 * frame, that this engine behaves exactly like the arcade board.
 *
 * Data tables (level layouts, animation tables, texts...) are read from the
 * original program ROM, like the graphics.
 *
 * Methods are named <what_it_does>_<original address> so they can be traced
 * back to the reverse engineering notes (docs/INGENIERIA_INVERSA.md).
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};

  class Todo extends Error {
    constructor(addr) { super('Rutina no implementada: ' + addr.toString(16)); this.addr = addr; }
  }

  class Game {
    constructor(rom, options) {
      options = options || {};
      this.rom = rom;                       // main program ROM image (64K address space, data tables)
      this.m = new Uint8Array(0x10000);     // RAM image (0x2000-0x3FFF used)
      this.in = { system: 0xff, p1: 0xff, p2: 0xff, dsw1: 0x00, dsw2: 0x4b, dsw3: 0xff };
      this.out = { flip: 0, spriteBank: 0, scroll: 0, irqMask: 0, coin1: 0, coin2: 0 };
      this.soundCommands = [];              // commands sent to the sound board this frame
      this.frames = 0;
      this.busy = 0;                        // frames still "used" by a long operation
    }

    // ------------------------------------------------------------ memory
    r8(a) { return this.m[a]; }
    w8(a, v) { this.m[a] = v; }
    r16(a) { return (this.m[a] << 8) | this.m[a + 1]; }
    w16(a, v) { this.m[a] = (v >> 8) & 0xff; this.m[a + 1] = v & 0xff; }
    // reads through a pointer: tables are in ROM but some pointers lead to RAM
    // (e.g. the score to add at 0x20A9)
    rom8(a) { a &= 0xffff; return a >= 0x2000 && a < 0x4000 ? this.m[a] : this.rom[a]; }
    rom16(a) { return (this.rom8(a) << 8) | this.rom8(a + 1); }
    // direct page (DP = 0x20)
    dp(n) { return this.m[0x2000 + n]; }
    setDp(n, v) { this.m[0x2000 + n] = v & 0xff; }

    todo(addr) { throw new Todo(addr); }
  }

  Game.Todo = Todo;
  CC.Game = Game;
})(typeof window !== 'undefined' ? window : globalThis);
