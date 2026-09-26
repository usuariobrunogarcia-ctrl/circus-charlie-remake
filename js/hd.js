/*
 * HD graphics support.
 *
 *  - buildExport(): extracts every graphic from the ROM into a folder tree
 *      sprites/<group>/<animation>/00.png, 01.png ...      (one folder per animation)
 *      sprites/<group>/<animation>/color_XX/00.png ...     (same animation, other palettes)
 *      tiles/color_XX/tile_NNN.png                        (8x8 background / text tiles)
 *    All images are in the upright (display) orientation.
 *
 *  - HDPack: loads a (possibly edited) copy of that tree. Any folder can hold a
 *    different number of frames of any size: the renderer scales each frame to
 *    the original 16x16 (or 8x8) cell with smoothing, and spreads the HD frames
 *    over the time the original animation takes, so the timing never changes.
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};

  const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
  const pad = (n, l) => String(n).padStart(l, '0');
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  // ------------------------------------------------------------------ defs
  function prepareDefs(defs, gfx) {
    if (defs._prepared) return defs;
    const nSpr = gfx.numSprites;
    const codeAnim = new Int16Array(nSpr).fill(-1);
    const codeFrame = new Int16Array(nSpr).fill(0);
    const dirIndex = new Map();
    defs.anims.forEach((a, i) => {
      a.codes.forEach((c, k) => { if (c < nSpr && codeAnim[c] < 0) { codeAnim[c] = i; codeFrame[c] = k; } });
      dirIndex.set(a.dir.toLowerCase(), i);
    });
    // any code not covered by the definitions becomes a single frame "animation"
    for (let c = 0; c < nSpr; c++) {
      if (codeAnim[c] >= 0) continue;
      const a = { dir: 'sin_clasificar/sprite_' + pad(c, 3), codes: [c], colors: [1], dur: 8 };
      codeAnim[c] = defs.anims.length; codeFrame[c] = 0;
      dirIndex.set(a.dir, defs.anims.length);
      defs.anims.push(a);
    }
    defs.codeAnim = codeAnim;
    defs.codeFrame = codeFrame;
    defs.dirIndex = dirIndex;
    defs._prepared = true;
    return defs;
  }

  // ---------------------------------------------------------------- export
  function readme() {
    return [
      'CIRCUS CHARLIE - GRAFICOS EXPORTADOS DEL ROM',
      '===========================================',
      '',
      'Estructura:',
      '  sprites/<grupo>/<animacion>/00.png, 01.png, ...',
      '      Cada carpeta es UNA animacion (los frames en orden). Tamano original 16x16.',
      '  sprites/<grupo>/<animacion>/color_XX/...',
      '      La misma animacion con otra paleta (p.ej. enemigos de otro color).',
      '      Si solo reemplazas la carpeta principal, se usa para todas las paletas.',
      '  tiles/color_XX/tile_NNN.png',
      '      Tiles de 8x8 del fondo y del texto, con la paleta XX.',
      '',
      'Como crear graficos HD:',
      '  - Reemplaza los PNG de cualquier carpeta por imagenes mas grandes (p.ej. 64x64).',
      '  - Puedes poner MAS o MENOS frames que el original (00.png ... NN.png, en orden',
      '    alfabetico/numerico). La animacion dura exactamente lo mismo que la original:',
      '    los frames HD se reparten a lo largo del ciclo original.',
      '  - Cada imagen se escala al tamano del sprite original en pantalla, con',
      '    suavizado (sin pixelado). Usa fondo transparente en los sprites.',
      '  - Los archivos que no cambies se siguen dibujando con el grafico original.',
      '',
      'Como cargarlos en el juego:',
      '  a) Menu (tecla ESC) > "Cargar paquete HD" y elige esta carpeta o un .zip de ella.',
      '  b) O copia la carpeta como "hd/" junto a index.html y ejecuta',
      '     "node tools/build-manifest.js" para generar hd/manifest.json.',
      '',
    ].join('\n');
  }

  /** Returns [{name, data:Uint8Array}] with every graphic of the ROM. */
  function buildExport(gfx, defs) {
    prepareDefs(defs, gfx);
    const files = [];
    const enc = new TextEncoder();
    const manifest = { juego: 'circuscc', anims: [], files: [] };
    const add = (name, data) => { files.push({ name, data }); manifest.files.push(name); };
    defs.anims.forEach((a) => {
      const colors = a.colors && a.colors.length ? a.colors : [1];
      colors.forEach((color, ci) => {
        const base = 'sprites/' + a.dir + (ci === 0 ? '' : '/color_' + pad(color, 2));
        a.codes.forEach((code, k) => {
          add(base + '/' + pad(k, 2) + '.png', CC.PNG.encode(16, 16, gfx.spriteRGBA(code, color)));
        });
      });
      manifest.anims.push({ carpeta: a.dir, sprites: a.codes, paletas: colors, framesPorPaso: a.dur });
    });
    const tiles = (defs.tiles && defs.tiles.length) ? defs.tiles : allTiles(gfx);
    for (const key of tiles) {
      const code = key >> 4, color = key & 15;
      if (code >= gfx.numChars) continue;
      add('tiles/color_' + pad(color, 2) + '/tile_' + pad(code, 3) + '.png', CC.PNG.encode(8, 8, gfx.charRGBA(code, color)));
    }
    files.push({ name: 'LEEME.txt', data: enc.encode(readme()) });
    files.push({ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 1)) });
    return files;
  }

  function allTiles(gfx) {
    const out = [];
    for (let c = 0; c < gfx.numChars; c++) out.push(c * 16);
    return out;
  }

  // -------------------------------------------------------------- HD pack
  async function decodeImage(data) {
    const blob = data instanceof Blob ? data : new Blob([data]);
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  function imagePixels(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height).data;
  }

  function samePixels(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 128 && b[i + 3] < 128) continue;
      if (Math.abs(a[i + 3] - b[i + 3]) > 8 || Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 || Math.abs(a[i + 2] - b[i + 2]) > 8) return false;
    }
    return true;
  }

  class HDPack {
    constructor(gfx, defs) {
      this.gfx = gfx;
      this.defs = prepareDefs(defs, gfx);
      this.clear();
      this.trackers = [];
      this.nextTrackers = [];
    }

    clear() {
      this.sprites = new Map();  // animIndex -> { main: [img], byColor: Map(color -> [img]) }
      this.tiles = new Map();    // code*16+color -> img
      this.count = 0;
      this.version = (this.version || 0) + 1;
    }

    get empty() { return this.count === 0; }

    /**
     * files: { path: Blob | Uint8Array }.  Paths may include any prefix
     * (e.g. "mi_pack/sprites/..."), only the part from "sprites/" or "tiles/" matters.
     */
    async load(files, onProgress) {
      this.clear();
      const spriteFolders = new Map(); // "animIdx|color" -> [{name, data}]
      const tileFiles = [];
      for (const path of Object.keys(files)) {
        const p = path.replace(/\\/g, '/');
        if (!IMG_RE.test(p)) continue;
        let m = p.match(/(?:^|\/)sprites\/(.+)\/([^/]+)$/i);
        if (m) {
          let folder = m[1], color = -1;
          const cm = folder.match(/^(.*)\/color_(\d+)$/i);
          if (cm) { folder = cm[1]; color = parseInt(cm[2], 10); }
          const ai = this.defs.dirIndex.get(folder.toLowerCase());
          if (ai === undefined) continue;
          const key = ai + '|' + color;
          if (!spriteFolders.has(key)) spriteFolders.set(key, []);
          spriteFolders.get(key).push({ name: m[2], data: files[path] });
          continue;
        }
        m = p.match(/(?:^|\/)tiles\/color_(\d+)\/tile_(\d+)\.[a-z]+$/i);
        if (m) tileFiles.push({ key: parseInt(m[2], 10) * 16 + parseInt(m[1], 10), data: files[path] });
      }
      const total = spriteFolders.size + tileFiles.length;
      let done = 0;
      const tick = () => { done++; if (onProgress && (done % 25 === 0 || done === total)) onProgress(done, total); };

      for (const [key, list] of spriteFolders) {
        const [ai, colorStr] = key.split('|');
        const a = this.defs.anims[+ai];
        const color = +colorStr;
        list.sort((x, y) => natural(x.name, y.name));
        const imgs = [];
        for (const f of list) {
          try { imgs.push(await decodeImage(f.data)); } catch (e) { /* ignore broken files */ }
        }
        tick();
        if (!imgs.length) continue;
        // skip folders identical to the original graphics
        const refColor = color >= 0 ? color : (a.colors && a.colors[0]) || 1;
        if (imgs.length === a.codes.length && imgs.every((im) => im.width === 16 && im.height === 16)) {
          let same = true;
          for (let k = 0; k < imgs.length && same; k++) {
            same = samePixels(imagePixels(imgs[k]), this.gfx.spriteRGBA(a.codes[k], refColor));
          }
          if (same) continue;
        }
        let entry = this.sprites.get(+ai);
        if (!entry) { entry = { main: null, byColor: new Map() }; this.sprites.set(+ai, entry); }
        if (color < 0) entry.main = imgs; else entry.byColor.set(color, imgs);
        this.count++;
      }
      for (const t of tileFiles) {
        let img;
        try { img = await decodeImage(t.data); } catch (e) { tick(); continue; }
        tick();
        if (img.width === 8 && img.height === 8 &&
            samePixels(imagePixels(img), this.gfx.charRGBA(t.key >> 4, t.key & 15))) continue;
        this.tiles.set(t.key, img);
        this.count++;
      }
      this.version++;
      return this.count;
    }

    tileImage(code, color) {
      return this.tiles.size ? (this.tiles.get(code * 16 + color) || null) : null;
    }

    // ------------------------------------------------ animation tracking
    beginFrame(now) {
      this.now = now;
      const t = this.trackers;
      this.trackers = this.nextTrackers;
      this.nextTrackers = t;
      this.nextTrackers.length = 0;
      for (const tr of this.trackers) tr.used = false;
    }

    /**
     * Returns the HD image for a sprite drawn this frame, or null to use the
     * original graphic. x, y: display position of the sprite.
     */
    spriteImage(code, color, x, y) {
      if (!this.sprites.size) return null;
      const ai = this.defs.codeAnim[code];
      if (ai < 0) return null;
      const entry = this.sprites.get(ai);
      if (!entry) return null;
      const frames = entry.byColor.get(color) || entry.main;
      if (!frames) return null;
      const a = this.defs.anims[ai];
      const N = a.codes.length, M = frames.length;
      const k = this.defs.codeFrame[code];
      const now = this.now;

      // find the tracker of this object in the previous frame
      let best = null, bestD = 400;
      for (const tr of this.trackers) {
        if (tr.used || tr.ai !== ai) continue;
        const dx = tr.x - x, dy = tr.y - y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = tr; }
      }
      let tr;
      if (best) {
        best.used = true;
        tr = { ai, k, x, y, start: best.start, dir: best.dir, born: best.born, used: false };
        if (best.k !== k) {
          const obs = now - best.start;
          if (obs > 0 && obs < a.dur * 4 + 8) a.dur = a.dur * 0.75 + obs * 0.25;
          let step = k - best.k;
          if (step > N / 2) step -= N; else if (step < -N / 2) step += N;
          // cyclic / one-shot animations always advance; only "ping-pong"
          // animations (0,1,2,1,0...) play the HD frames backwards on the way back
          tr.dir = (a.pingpong && step < 0) ? -1 : 1;
          tr.start = now;
        }
      } else {
        tr = { ai, k, x, y, start: now, dir: 1, born: now, used: false };
      }
      this.nextTrackers.push(tr);

      if (M === 1) return frames[0];
      if (N === 1) {
        // a single original frame: loop the HD frames (one every ~6 game frames)
        return frames[Math.floor((now - tr.born) / 6) % M];
      }
      if (M === N) return frames[k];
      const dur = Math.max(1, a.dur);
      let phase = (now - tr.start) / dur;
      if (phase > 0.999) phase = 0.999;
      const pos = tr.dir > 0 ? k + phase : k + 1 - phase;
      let idx = Math.floor(pos * M / N - 1e-6);
      if (idx < 0) idx = 0; else if (idx >= M) idx = M - 1;
      return frames[idx];
    }
  }

  CC.HD = { buildExport, prepareDefs, HDPack, readme };
})(typeof window !== 'undefined' ? window : globalThis);
