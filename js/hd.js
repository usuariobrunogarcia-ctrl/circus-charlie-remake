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

  // ------------------------------------------------ objects (whole sprites)
  const STAGE_DIRS = ['etapa1_leon', 'etapa2_cuerda_floja', 'etapa3_trampolin', 'etapa4_pelotas',
    'etapa5_caballo', 'etapa6_trapecio'];

  /** Folder of an animation, relative to "objetos/". */
  function objDir(a) {
    const st = a.stages.length === 1 ? STAGE_DIRS[a.stages[0] - 1] : 'comun';
    return st + '/' + a.object + '/' + a.name;
  }

  /** Original frame k of animation a, composed on the animation canvas (RGBA). */
  function composeFrame(gfx, a, k) {
    const [bx, by, bw, bh] = a.box;
    const out = new Uint8Array(bw * bh * 4);
    const [codes, attrs] = a.frames[k];
    codes.forEach((c, i) => {
      const code = c + 8 * (attrs[i] & 0x20);
      if (code >= gfx.numSprites) return;
      const px = gfx.spriteRGBA(code, attrs[i] & 15);
      const ox = a.offs[i][0] - bx, oy = a.offs[i][1] - by;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        // hardware flips: 0x80 mirrors horizontally, 0x40 vertically on the rotated screen
        const sx = attrs[i] & 0x80 ? 15 - x : x, sy = attrs[i] & 0x40 ? 15 - y : y;
        const o = (sy * 16 + sx) * 4;
        if (!px[o + 3]) continue;
        const d = ((oy + y) * bw + ox + x) * 4;
        out[d] = px[o]; out[d + 1] = px[o + 1]; out[d + 2] = px[o + 2]; out[d + 3] = px[o + 3];
      }
    });
    return out;
  }

  const frameLen = (f) => f[2] + 1;     // game frames an original frame is shown

  function readmeObjetos() {
    return [
      'CIRCUS CHARLIE - SPRITES HD POR OBJETO',
      '======================================',
      '',
      'objetos/<etapa>/<objeto>/<animacion>/00.png, 01.png, ...',
      '',
      '  Cada carpeta es UNA animacion de un objeto, con los sprites ya armados',
      '  (el juego los dibuja con piezas de 16x16; aqui estan completos).',
      '  Todos los frames de una animacion tienen el mismo lienzo, alineados.',
      '  info.txt dice el tamano original y cuanto dura cada frame.',
      '',
      'Para hacer graficos HD:',
      '  - Reemplaza los PNG por imagenes de CUALQUIER tamano (p.ej. 32x32 -> 128x128),',
      '    manteniendo la proporcion del lienzo original.',
      '  - Puedes poner MAS o MENOS frames (00.png, 01.png, ... en orden). La animacion',
      '    dura lo mismo que la original: los frames se reparten en ese tiempo.',
      '  - En pantalla la imagen se escala al tamano del objeto original, con suavizado.',
      '  - Usa fondo transparente.',
      '  - Las carpetas que no cambies se dibujan con los graficos originales.',
      '',
      'Cargar: menu (ESC) > "Cargar carpeta HD" o "Cargar .zip HD".',
      '',
    ].join('\n');
  }

  /** Files of the "sprites ya armados" export; stages: list of stage numbers or null for all. */
  function buildObjectExport(gfx, objdefs, stages) {
    const files = [];
    const enc = new TextEncoder();
    for (const a of objdefs.anims) {
      if (stages && !a.stages.some((st) => stages.includes(st))) continue;
      const dir = 'objetos/' + objDir(a);
      const [, , bw, bh] = a.box;
      a.frames.forEach((f, k) => files.push({ name: dir + '/' + pad(k, 2) + '.png', data: CC.PNG.encode(bw, bh, composeFrame(gfx, a, k)) }));
      const total = a.frames.reduce((t, f) => t + frameLen(f), 0);
      const info = [
        `objeto: ${a.object}`, `animacion: ${a.name}`,
        `tamano original: ${bw}x${bh} pixeles`,
        `frames originales: ${a.frames.length}`,
        `duracion de cada frame (en cuadros de 1/60 s): ${a.frames.map(frameLen).join(', ')}`,
        `duracion total: ${total} cuadros (${(total / 60.6).toFixed(2)} s)`,
        `guion del ROM: ${a.start.toString(16).toUpperCase()}`, '',
      ].join('\n');
      files.push({ name: dir + '/info.txt', data: enc.encode(info) });
    }
    files.push({ name: 'LEEME_OBJETOS.txt', data: enc.encode(readmeObjetos()) });
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
    constructor(gfx, defs, objdefs) {
      this.gfx = gfx;
      this.defs = prepareDefs(defs, gfx);
      this.objdefs = objdefs || { anims: [] };
      this.objByStart = new Map();
      this.objByDir = new Map();
      this.objdefs.anims.forEach((a) => {
        this.objByStart.set(a.start, a);
        this.objByDir.set(objDir(a).toLowerCase(), a);
      });
      this.objTrack = new Map();
      this.clear();
      this.trackers = [];
      this.nextTrackers = [];
    }

    clear() {
      this.sprites = new Map();  // animIndex -> { main: [img], byColor: Map(color -> [img]) }
      this.tiles = new Map();    // code*16+color -> img
      this.objects = new Map();  // animation start -> [img]
      this.count = 0;
      this.version = (this.version || 0) + 1;
    }

    get empty() { return this.count === 0; }
    get hasObjects() { return this.objects.size > 0; }

    /**
     * files: { path: Blob | Uint8Array }.  Paths may include any prefix
     * (e.g. "mi_pack/sprites/..."), only the part from "sprites/" or "tiles/" matters.
     */
    async load(files, onProgress) {
      this.clear();
      const spriteFolders = new Map(); // "animIdx|color" -> [{name, data}]
      const tileFiles = [];
      const objFolders = new Map();    // animation -> [{name, data}]
      for (const path of Object.keys(files)) {
        const p = path.replace(/\\/g, '/');
        if (!IMG_RE.test(p)) continue;
        const om = p.match(/(?:^|\/)objetos\/(.+)\/([^/]+)$/i);
        if (om) {
          const a = this.objByDir.get(om[1].toLowerCase());
          if (!a) continue;
          if (!objFolders.has(a)) objFolders.set(a, []);
          objFolders.get(a).push({ name: om[2], data: files[path] });
          continue;
        }
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
      const total = spriteFolders.size + tileFiles.length + objFolders.size;
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
      for (const [a, list] of objFolders) {
        list.sort((x, y) => natural(x.name, y.name));
        const imgs = [];
        for (const f of list) {
          try { imgs.push(await decodeImage(f.data)); } catch (e) { /* ignore broken files */ }
        }
        tick();
        if (!imgs.length) continue;
        const [, , bw, bh] = a.box;
        if (imgs.length === a.frames.length && imgs.every((im) => im.width === bw && im.height === bh)) {
          let same = true;
          for (let k = 0; k < imgs.length && same; k++) same = samePixels(imagePixels(imgs[k]), composeFrame(this.gfx, a, k));
          if (same) continue;
        }
        this.objects.set(a.start, imgs);
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

    // ------------------------------------------------ whole objects
    /**
     * HD image for an object: anim = animation definition, k = original frame
     * shown, root = its first record (identifies the object between frames).
     * The HD frames are spread over the duration of the original animation.
     */
    objectImage(anim, k, root) {
      const imgs = this.objects.get(anim.start);
      if (!imgs) return null;
      const now = this.now;
      let tr = this.objTrack.get(root);
      if (!tr || tr.start !== anim.start) { tr = { start: anim.start, k, since: now }; this.objTrack.set(root, tr); }
      else if (tr.k !== k) { tr.k = k; tr.since = now; }
      tr.seen = now;
      const M = imgs.length, N = anim.frames.length;
      if (M === 1) return imgs[0];
      let total = 0, before = 0;
      anim.frames.forEach((f, i) => { const l = frameLen(f); if (i < k) before += l; total += l; });
      const len = frameLen(anim.frames[k]);
      const t = Math.min(now - tr.since, len - 0.001);
      let idx = Math.floor((before + t) / total * M);
      if (N === 1) idx = Math.floor((now - tr.since) / Math.max(1, len) * M) % M;   // single frame: loop
      return imgs[Math.max(0, Math.min(M - 1, idx))];
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

  CC.HD = { buildExport, buildObjectExport, composeFrame, objDir, prepareDefs, HDPack, readme };
})(typeof window !== 'undefined' ? window : globalThis);
