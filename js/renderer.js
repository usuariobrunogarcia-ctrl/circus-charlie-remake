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
      this.comp = makeCanvas(TILEMAP * K, H * K);
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
      ctx.beginPath();
      ctx.rect(-x0 * K, 0, W * K, 80 * K);
      ctx.clip();
      this.blitWrapped(ctx, layer, 16 + x0, 0, vw, 80, K);
      ctx.restore();
      // playfield: scrolled
      this.blitWrapped(ctx, layer, (16 + x0 - scroll) & 255, 80, vw, H - 80, K);
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
      this.viewW = wide ? 256 : W;
      const x0 = wide ? -16 : 0;

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
