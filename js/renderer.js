/*
 * Screen renderer.
 *
 * The picture is composed at an integer multiple K of the original resolution
 * (224x256, portrait) so that HD replacements can be drawn with all their
 * detail, and the result is scaled to the window.
 *
 * Layers (same priorities as the arcade board):
 *   1. background tiles with the "category 1" attribute
 *   2. sprites
 *   3. tiles with "category 0" (HUD, texts...) drawn over the sprites
 *
 * The tilemap is 32x32 tiles; columns 0-9 of the hardware (the 80 rows at the
 * top of the display) never scroll, the rest scroll horizontally.
 */
(function (root) {
  'use strict';
  const CC = root.CC;
  const W = 224, H = 256, TILEMAP = 256;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  class Renderer {
    constructor(canvas, gfx, hd) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.gfx = gfx;
      this.hd = hd;
      this.useHD = true;
      this.smooth = true;          // smooth final scaling
      this.displayMode = 'fit';    // fit | stretch | wide
      this.ambient = true;         // blurred backdrop at the sides
      this.scanlines = false;
      this.K = 0;
      this.tileCache = new Map();  // code*16+color -> 8x8 canvas (display orientation)
      this.spriteCache = new Map();
      this.hdVersion = -1;
      this.viewW = W;
      this.tiny = makeCanvas(16, 16);
      this.maxWide = 640;          // widest picture (native pixels) in "wide" mode
      // widescreen: the playfield is extended with the stage background
      this.extOn = false;
      this.base = null;            // tilemap right after the stage was drawn
      this.hist = new Map();       // world column -> last seen tiles (rows 10-31)
      this.worldS = 0;             // unwrapped scroll
      this.prevScroll = null;
    }

    // ----------------------------------------------------- widescreen scenery
    static cell(vram, cram, i) {
      const attr = cram[i];
      return ((vram[i] + ((attr & 0x20) << 3)) << 8) | attr;
    }

    /** Called when a stage background has been drawn: it is the pattern used at the sides. */
    captureBase(vram, cram) {
      const b = this.base || (this.base = new Uint32Array(1024));
      for (let i = 0; i < 1024; i++) b[i] = Renderer.cell(vram, cram, i);
      this.hist.clear();
      this.extOn = true;
      this.extFade = 0;
    }

    /** Switching off fades the sides out (the game is wiping the screen). */
    setExtended(on) {
      if (on) { this.extOn = true; this.extFade = 0; return; }
      if (this.extOn && !this.extFade) this.extFade = 1;
    }

    fadeStep() {
      if (!this.extFade) return 0;
      this.extFade += 1;
      if (this.extFade > 24) { this.extOn = false; this.extFade = 0; this.hist.clear(); return 0; }
      return (this.extFade - 1) / 24;
    }

    trackScroll(scroll) {
      if (this.prevScroll !== null) this.worldS += ((scroll - this.prevScroll + 128) & 255) - 128;
      this.prevScroll = scroll;
    }

    /** Remembers the columns currently visible (world coordinates). */
    updateHistory(vs) {
      const vram = vs.videoram, cram = vs.colorram, S = this.worldS;
      for (let R = 0; R < 32; R++) {
        let x = (248 - 8 * R - 16 + vs.scroll) & 255;
        if (x >= 240) x -= 256;
        if (x < 0 || x >= W) continue;
        const wc = (x - S) >> 3;
        let col = this.hist.get(wc);
        if (!col) { col = new Uint32Array(32); this.hist.set(wc, col); }
        for (let C = 10; C < 32; C++) col[C] = Renderer.cell(vram, cram, R * 32 + C);
      }
      if (this.hist.size > 4096) this.hist.clear();
    }

    /** Red sky with clouds above the extended playfield (the HUD itself is not extended). */
    drawSky(ctx, x0, vw) {
      const K = this.K, cell = 8 * K;
      const hdOn = this.useHD && this.hd && !this.hd.empty;
      const tile = (code, color, flip) => {
        const hdImg = hdOn ? this.hd.tileImage(code, color) : null;
        return [hdImg || this.tileCanvas(code, color), !!hdImg, flip];
      };
      const sky = tile(0x170, 0, false);
      const clouds = [[0, [0x127, 0x128, 0x129]], [1, [0x12a, 0x12b, 0x12c, 0x12d]]];
      for (const [from, to] of [[x0, 0], [W, x0 + vw]]) {
        for (let x = from; x < to; x += 8) {
          for (let C = 0; C < 5; C++) {
            const [img, hd] = sky;
            this.drawCell(ctx, img, (x - x0) * K, C * cell, cell, false, false, hd);
          }
          // clouds every 72 pixels, alternating rows, fixed on the screen
          const k = Math.floor((x + 1024) / 8) % 18;
          const cl = clouds[Math.floor((x + 1024) / 144) % 2];
          const xs = x - k * 8;
          if (k < cl[1].length && xs >= from && xs + cl[1].length * 8 <= to) {
            const [img, hd] = tile(cl[1][k], 0, false);
            this.drawCell(ctx, img, (x - x0) * K, cl[0] * cell, cell, false, false, hd);
          }
        }
      }
    }

    /** Tiles of the extended area (outside the 256 pixel tilemap) for one layer. */
    drawExtension(ctx, x0, vw, cat1) {
      const K = this.K, cell = 8 * K, S = this.worldS;
      const hdOn = this.useHD && this.hd && !this.hd.empty;
      const first = Math.floor((x0 - S) / 8), last = Math.ceil((x0 + vw - S) / 8);
      for (let wc = first; wc <= last; wc++) {
        const x = wc * 8 + S;
        if (x >= 0 && x + 8 <= W) continue;          // live tilemap
        const hist = this.hist.get(wc);
        const u = (wc * 8 + 16) & 255;
        const R = (248 - u) >> 3;
        for (let C = 10; C < 32; C++) {
          const v = hist ? hist[C] : this.base[R * 32 + C];
          const attr = v & 0xff;
          if (((attr & 0x10) !== 0) !== cat1) continue;
          const code = v >> 8, color = attr & 15;
          const hdImg = hdOn ? this.hd.tileImage(code, color) : null;
          this.drawCell(ctx, hdImg || this.tileCanvas(code, color), (x - x0) * K, 8 * C * K, cell,
            (attr & 0x80) !== 0, (attr & 0x40) !== 0, !!hdImg);
        }
      }
    }

    // ------------------------------------------------------------- caches
    tileCanvas(code, color) {
      const key = code * 16 + color;
      let c = this.tileCache.get(key);
      if (!c) {
        c = makeCanvas(8, 8);
        const ctx = c.getContext('2d');
        const id = ctx.createImageData(8, 8);
        id.data.set(this.gfx.charRGBA(code, color));
        ctx.putImageData(id, 0, 0);
        this.tileCache.set(key, c);
      }
      return c;
    }

    spriteCanvas(code, color) {
      const key = code * 16 + color;
      let c = this.spriteCache.get(key);
      if (!c) {
        c = makeCanvas(16, 16);
        const ctx = c.getContext('2d');
        const id = ctx.createImageData(16, 16);
        id.data.set(this.gfx.spriteRGBA(code, color));
        ctx.putImageData(id, 0, 0);
        this.spriteCache.set(key, c);
      }
      return c;
    }

    setScale(K) {
      if (K === this.K) return;
      this.K = K;
      const S = TILEMAP * K;
      this.layer1 = makeCanvas(S, S);
      this.layer0 = makeCanvas(S, S);
      this.l1 = this.layer1.getContext('2d');
      this.l0 = this.layer0.getContext('2d');
      this.comp = makeCanvas(this.maxWide * K, H * K);
      this.cctx = this.comp.getContext('2d');
      this.cellKey = new Int32Array(1024).fill(-1);
    }

    invalidate() { if (this.cellKey) this.cellKey.fill(-1); }

    // ------------------------------------------------------------ drawing
    drawCell(ctx, img, x, y, size, flipH, flipV, smooth) {
      ctx.imageSmoothingEnabled = smooth;
      if (smooth) ctx.imageSmoothingQuality = 'high';
      if (!flipH && !flipV) {
        ctx.drawImage(img, x, y, size, size);
        return;
      }
      ctx.save();
      ctx.translate(x + (flipH ? size : 0), y + (flipV ? size : 0));
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(img, 0, 0, size, size);
      ctx.restore();
    }

    updateTiles(vs) {
      const K = this.K, cell = 8 * K;
      const vram = vs.videoram, cram = vs.colorram;
      const hdOn = this.useHD && this.hd && !this.hd.empty;
      for (let ti = 0; ti < 1024; ti++) {
        const attr = cram[ti];
        const code = vram[ti] + ((attr & 0x20) << 3);
        const key = (code << 8) | attr;
        if (this.cellKey[ti] === key) continue;
        this.cellKey[ti] = key;
        const R = ti >> 5, C = ti & 31;
        const x = (248 - 8 * R) * K, y = 8 * C * K;
        const color = attr & 15;
        const cat1 = (attr & 0x10) !== 0;
        const dst = cat1 ? this.l1 : this.l0;
        const other = cat1 ? this.l0 : this.l1;
        other.clearRect(x, y, cell, cell);
        const hdImg = hdOn ? this.hd.tileImage(code, color) : null;
        // hardware flip X (0x40) is a vertical flip on the rotated screen, flip Y (0x80) horizontal
        dst.clearRect(x, y, cell, cell);
        this.drawCell(dst, hdImg || this.tileCanvas(code, color), x, y, cell,
          (attr & 0x80) !== 0, (attr & 0x40) !== 0, !!hdImg);
      }
    }

    drawLayer(ctx, layer, scroll, x0, vw) {
      const K = this.K;
      // top 80 rows (HUD): fixed, never extended (the hidden columns hold garbage)
      ctx.save();
      ctx.translate(-x0 * K, 0);
      this.blitWrapped(ctx, layer, 16, 0, W, 80, K);
      ctx.restore();
      if (this.extOn && x0 < 0 && layer === this.layer1) this.drawSky(ctx, x0, vw);
      // playfield: scrolled
      if (this.extOn && vw > 256) {
        // the live tilemap is used for the original picture, the rest comes from the stage background
        const lx = Math.max(x0, 0), rx = Math.min(x0 + vw, W);
        ctx.save();
        ctx.translate((lx - x0) * K, 0);
        this.blitWrapped(ctx, layer, (16 + lx - scroll) & 255, 80, rx - lx, H - 80, K);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 80 * K, -x0 * K, (H - 80) * K);
        ctx.rect((W - x0) * K, 80 * K, (vw - W + x0) * K, (H - 80) * K);
        ctx.clip();
        this.drawExtension(ctx, x0, vw, layer === this.layer1);
        ctx.restore();
      } else {
        this.blitWrapped(ctx, layer, (16 + x0 - scroll) & 255, 80, Math.min(vw, 256), H - 80, K);
      }
    }

    blitWrapped(ctx, layer, u, y, w, h, K) {
      u = ((u % TILEMAP) + TILEMAP) % TILEMAP;
      const first = Math.min(w, TILEMAP - u);
      ctx.drawImage(layer, u * K, y * K, first * K, h * K, 0, y * K, first * K, h * K);
      if (first < w) ctx.drawImage(layer, 0, y * K, (w - first) * K, h * K, first * K, y * K, (w - first) * K, h * K);
    }

    drawSprites(ctx, vs, x0, now) {
      const K = this.K, size = 16 * K;
      const spr = vs.sprites;
      const hdOn = this.useHD && this.hd && !this.hd.empty;
      if (hdOn) this.hd.beginFrame(now);
      // sprites are clipped to the original picture (objects are parked outside it)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-x0 * K, 0, W * K, H * K);
      ctx.clip();
      for (let o = 0; o < 0x100; o += 4) {
        const a1 = spr[o + 1];
        const code = spr[o] + 8 * (a1 & 0x20);
        if (code >= this.gfx.numSprites) continue;
        const color = a1 & 15;
        const sx = spr[o + 2], sy = spr[o + 3];
        // display position (rotated screen)
        const dx = 224 - sy - x0, dy = sx;
        if (dx <= -16 || dx >= this.viewW || dy >= H) continue;
        const hdImg = hdOn ? this.hd.spriteImage(code, color, dx, dy) : null;
        this.drawCell(ctx, hdImg || this.spriteCanvas(code, color), dx * K, dy * K, size,
          (a1 & 0x80) !== 0, (a1 & 0x40) !== 0, !!hdImg);
      }
      ctx.restore();
    }

    /** Draws a video state. now = frame counter (for HD animation timing). */
    render(vs, now) {
      const canvas = this.canvas;
      const cw = canvas.width, ch = canvas.height;
      if (!cw || !ch) return;
      const wide = this.displayMode === 'wide';
      this.trackScroll(vs.scroll);
      if (this.extOn) this.updateHistory(vs);
      // wide: as wide as the window (the stage background is extended), centred on the original picture
      let vwide = Math.round(H * cw / ch);
      vwide = Math.max(W, Math.min(this.extOn ? this.maxWide : 256, vwide));
      this.viewW = wide ? vwide : W;
      const x0 = wide ? -Math.round((this.viewW - W) / 2) : 0;

      // scale of the game picture on screen
      let scale;
      if (this.displayMode === 'stretch') scale = Math.max(cw / this.viewW, ch / H);
      else scale = Math.min(cw / this.viewW, ch / H);
      let K = Math.max(1, Math.min(8, Math.ceil(scale - 0.01)));
      if (!(this.useHD && this.hd && !this.hd.empty)) K = Math.max(1, Math.min(4, Math.round(scale) || 1));
      this.setScale(K);
      if (this.hd && this.hd.version !== this.hdVersion) { this.hdVersion = this.hd.version; this.invalidate(); }
      if (this._hdFlag !== this.useHD) { this._hdFlag = this.useHD; this.invalidate(); }

      this.updateTiles(vs);

      // compose
      const c = this.cctx;
      const vw = this.viewW;
      c.fillStyle = '#000';
      c.fillRect(0, 0, vw * K, H * K);
      c.imageSmoothingEnabled = false;
      this.drawLayer(c, this.layer1, vs.scroll, x0, vw);
      this.drawSprites(c, vs, x0, now);
      c.imageSmoothingEnabled = false;
      this.drawLayer(c, this.layer0, vs.scroll, x0, vw);

      const fade = this.extOn ? this.fadeStep() : 0;
      if (fade && x0 < 0) {
        c.fillStyle = `rgba(0,0,0,${fade})`;
        c.fillRect(0, 80 * K, -x0 * K, (H - 80) * K);
        c.fillRect((W - x0) * K, 80 * K, (vw - W + x0) * K, (H - 80) * K);
      }

      // present
      const ctx = this.ctx;
      let dw, dh;
      if (this.displayMode === 'stretch') { dw = cw; dh = ch; }
      else { dw = Math.round(vw * scale); dh = Math.round(H * scale); }
      const dx = Math.floor((cw - dw) / 2), dy = Math.floor((ch - dh) / 2);
      if (dw < cw || dh < ch) this.drawBackdrop(ctx, cw, ch, vw, K);
      ctx.imageSmoothingEnabled = this.smooth || K !== scale;
      ctx.imageSmoothingQuality = 'high';
      if (!this.smooth && Math.abs(scale - K) < 0.01) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.comp, 0, 0, vw * K, H * K, dx, dy, dw, dh);
      if (this.scanlines && scale >= 2) this.drawScanlines(ctx, dx, dy, dw, dh, scale);
      this.lastRect = { x: dx, y: dy, w: dw, h: dh };
    }

    drawBackdrop(ctx, cw, ch, vw, K) {
      if (!this.ambient) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch); return; }
      // very small copy of the picture, scaled up with smoothing: a cheap blur
      const t = this.tiny, tc = t.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.drawImage(this.comp, 0, 0, vw * K, H * K, 0, 0, 16, 16);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(t, 1, 1, 14, 14, -cw * 0.1, -ch * 0.1, cw * 1.2, ch * 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, cw, ch);
    }

    drawScanlines(ctx, x, y, w, h, scale) {
      if (!this.scanPattern || this.scanScale !== Math.round(scale)) {
        const s = Math.max(2, Math.round(scale));
        const p = makeCanvas(1, s);
        const pc = p.getContext('2d');
        pc.fillStyle = 'rgba(0,0,0,0.28)';
        pc.fillRect(0, s - Math.max(1, Math.floor(s / 3)), 1, Math.max(1, Math.floor(s / 3)));
        this.scanPattern = ctx.createPattern(p, 'repeat');
        this.scanScale = Math.round(scale);
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = this.scanPattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  CC.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
