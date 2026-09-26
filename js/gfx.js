/*
 * Graphics decoding (palette, chars, sprites) and a reference software
 * renderer that reproduces the original hardware output pixel by pixel.
 *
 * Coordinates: the hardware draws a 256x224 landscape image (x 0..255,
 * y 16..239) that the monitor shows rotated 90 degrees clockwise, so the
 * player sees a 224x256 portrait picture.  Everything exported to the user
 * (PNG files, HD packs) is in that upright "display" orientation.
 *
 *   display_x = 239 - hw_y        display_y = hw_x
 */
(function (root) {
  'use strict';
  const CC = root.CC;

  const SCREEN_W = 224, SCREEN_H = 256;

  function resistorWeights(res) {
    const g = res.map((r) => 1 / r);
    const sum = g.reduce((a, b) => a + b, 0);
    return g.map((x) => 255 * x / sum);
  }

  function decodePalette(proms) {
    const wrg = resistorWeights([1000, 470, 220]);
    const wb = resistorWeights([470, 220]);
    const pal = new Uint32Array(32);   // ABGR (little endian RGBA in memory)
    const rgb = [];
    for (let i = 0; i < 32; i++) {
      const v = proms[i];
      const r = Math.floor(((v >> 0) & 1) * wrg[0] + ((v >> 1) & 1) * wrg[1] + ((v >> 2) & 1) * wrg[2] + 0.5);
      const g = Math.floor(((v >> 3) & 1) * wrg[0] + ((v >> 4) & 1) * wrg[1] + ((v >> 5) & 1) * wrg[2] + 0.5);
      const b = Math.floor(((v >> 6) & 1) * wb[0] + ((v >> 7) & 1) * wb[1] + 0.5);
      const R = Math.min(255, r), G = Math.min(255, g), B = Math.min(255, b);
      pal[i] = (0xff << 24) | (B << 16) | (G << 8) | R;
      rgb.push([R, G, B]);
    }
    return { pal, rgb };
  }

  /** Raw 4bpp pixels: chars -> Uint8Array(512*64), sprites -> Uint8Array(384*256) (hardware orientation). */
  function decodeChars(tiles) {
    const n = tiles.length / 32;
    const out = new Uint8Array(n * 64);
    for (let c = 0; c < n; c++) {
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const byte = tiles[c * 32 + y * 4 + (x >> 1)];
          out[c * 64 + y * 8 + x] = (x & 1) ? (byte & 0x0f) : (byte >> 4);
        }
      }
    }
    return out;
  }

  function decodeSprites(sprites) {
    const n = sprites.length / 128;
    const out = new Uint8Array(n * 256);
    for (let c = 0; c < n; c++) {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const byte = sprites[c * 128 + y * 8 + (x >> 1)];
          out[c * 256 + y * 16 + x] = (x & 1) ? (byte & 0x0f) : (byte >> 4);
        }
      }
    }
    return out;
  }

  class Graphics {
    constructor(roms) {
      this.roms = roms;
      const p = decodePalette(roms.proms);
      this.pal = p.pal;
      this.rgb = p.rgb;
      this.chars = decodeChars(roms.tiles);
      this.sprites = decodeSprites(roms.sprites);
      this.numChars = this.chars.length / 64;
      this.numSprites = this.sprites.length / 256;
      // colour lookup: charLut[color*16+pen] -> palette index (16..31)
      this.charLut = new Uint8Array(256);
      this.sprLut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        this.charLut[i] = (roms.proms[0x20 + i] & 0x0f) + 0x10;
        this.sprLut[i] = roms.proms[0x120 + i] & 0x0f;
      }
    }

    /**
     * Returns RGBA pixels (Uint8ClampedArray) of a char or sprite in DISPLAY
     * orientation (rotated 90deg clockwise). Transparent sprite pens have alpha 0.
     */
    charRGBA(code, color) {
      const out = new Uint8ClampedArray(8 * 8 * 4);
      const px = this.chars;
      for (let hy = 0; hy < 8; hy++) {
        for (let hx = 0; hx < 8; hx++) {
          const pen = px[code * 64 + hy * 8 + hx];
          const rgb = this.rgb[this.charLut[color * 16 + pen]];
          const dx = 7 - hy, dy = hx;
          const o = (dy * 8 + dx) * 4;
          out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
        }
      }
      return out;
    }

    spriteRGBA(code, color) {
      const out = new Uint8ClampedArray(16 * 16 * 4);
      const px = this.sprites;
      for (let hy = 0; hy < 16; hy++) {
        for (let hx = 0; hx < 16; hx++) {
          const pen = px[code * 256 + hy * 16 + hx];
          const lut = this.sprLut[color * 16 + pen];
          const dx = 15 - hy, dy = hx;
          const o = (dy * 16 + dx) * 4;
          if (lut === 0) { out[o + 3] = 0; continue; }
          const rgb = this.rgb[lut];
          out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = 255;
        }
      }
      return out;
    }

    /** true when the sprite (code,color) has at least one visible pixel */
    spriteVisible(code, color) {
      const px = this.sprites;
      for (let i = 0; i < 256; i++) if (this.sprLut[color * 16 + px[code * 256 + i]]) return true;
      return false;
    }

    /**
     * Reference renderer: draws a video state exactly like the arcade board.
     * out: Uint32Array(224*256) in display orientation.
     */
    renderSoftware(vs, out) {
      const hw = this._hw || (this._hw = new Uint8Array(256 * 256));   // palette indices
      const pri = this._pri || (this._pri = new Uint8Array(256 * 256)); // tile category
      const chars = this.chars, charLut = this.charLut;
      const vram = vs.videoram, cram = vs.colorram;
      for (let x = 0; x < 256; x++) {
        const col = x >> 3;
        const sc = col < 10 ? 0 : vs.scroll;
        for (let y = 16; y < 240; y++) {
          const ty = (y + sc) & 255;
          const ti = (ty >> 3) * 32 + col;
          const attr = cram[ti];
          const code = vram[ti] + ((attr & 0x20) << 3);
          let px = x & 7, py = ty & 7;
          if (attr & 0x40) px = 7 - px;
          if (attr & 0x80) py = 7 - py;
          const pen = chars[code * 64 + py * 8 + px];
          hw[y * 256 + x] = charLut[(attr & 0x0f) * 16 + pen];
          pri[y * 256 + x] = (attr >> 4) & 1;
        }
      }
      const spr = vs.sprites, sprites = this.sprites, sprLut = this.sprLut;
      for (let offs = 0; offs < 0x100; offs += 4) {
        const a1 = spr[offs + 1];
        const code = spr[offs] + 8 * (a1 & 0x20);
        const color = a1 & 0x0f;
        const sx = spr[offs + 2], sy = spr[offs + 3];
        const fx = a1 & 0x40, fy = a1 & 0x80;
        if (code >= this.numSprites) continue;
        for (let yy = 0; yy < 16; yy++) {
          const y = sy + yy;
          if (y < 16 || y >= 240) continue;
          const srcy = fy ? 15 - yy : yy;
          for (let xx = 0; xx < 16; xx++) {
            const x = sx + xx;
            if (x > 255) continue;
            const srcx = fx ? 15 - xx : xx;
            const lut = sprLut[color * 16 + sprites[code * 256 + srcy * 16 + srcx]];
            if (lut === 0) continue;
            const o = y * 256 + x;
            if (pri[o] === 0) continue;   // category 0 tiles are drawn over sprites
            hw[o] = lut;
          }
        }
      }
      const pal = this.pal;
      for (let dy = 0; dy < SCREEN_H; dy++) {
        for (let dx = 0; dx < SCREEN_W; dx++) {
          out[dy * SCREEN_W + dx] = pal[hw[(239 - dx) * 256 + dy]];
        }
      }
      return out;
    }
  }

  Graphics.SCREEN_W = SCREEN_W;
  Graphics.SCREEN_H = SCREEN_H;
  CC.Graphics = Graphics;
})(typeof window !== 'undefined' ? window : globalThis);
