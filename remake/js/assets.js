/*
 * Graphics of the remake: graficos/<entidad>/<animacion>/NN.png|svg.
 *
 * graficos/manifest.json describes every entity (its size in game pixels)
 * and its animations (original frame count and timing). The frames of a
 * folder are looked up in order (00, 01, ...): PNG files replace the SVG
 * placeholders and there may be any number of them. A folder chosen with the
 * menu ("Cargar carpeta de gráficos") replaces the graphics without a server.
 */
(function (root) {
  'use strict';
  const R = root.Remake = root.Remake || {};
  const pad = (n) => String(n).padStart(2, '0');
  const IMG = /\.(png|svg|webp|jpe?g|gif)$/i;

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function exists(url) {
    try {
      const r = await fetch(url, { method: 'GET', cache: 'no-cache' });
      return r.ok;
    } catch (e) { return false; }
  }

  class Assets {
    constructor(base) {
      this.base = base || 'graficos/';
      this.manifest = null;
      this.anims = new Map();          // "entidad/animacion" -> { def, size, imgs: [img] }
    }

    async load(onProgress) {
      const r = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
      this.manifest = await r.json();
      const list = [];
      for (const [en, e] of Object.entries(this.manifest.entidades)) {
        for (const [an, def] of Object.entries(e.animaciones)) list.push([en, an, e, def]);
      }
      let done = 0;
      await Promise.all(list.map(async ([en, an, e, def]) => {
        const dir = `${this.base}${en}/${an}/`;
        const imgs = [];
        // PNG replacements (any number of frames), otherwise the SVG placeholders
        for (let k = 0; k < 64; k++) {
          if (!(await exists(dir + pad(k) + '.png'))) break;
          const img = await loadImage(dir + pad(k) + '.png');
          if (img) imgs.push(img);
        }
        if (!imgs.length) {
          for (let k = 0; k < 64; k++) {
            if (k >= def.frames && !(await exists(dir + pad(k) + '.svg'))) break;
            const img = await loadImage(dir + pad(k) + '.svg');
            if (!img) break;
            imgs.push(img);
          }
        }
        this.anims.set(en + '/' + an, { def, size: e.tamano, imgs });
        done++;
        if (onProgress) onProgress(done, list.length);
      }));
    }

    /** files: [File] from a folder picker (webkitRelativePath ".../<entidad>/<animacion>/NN.png"). */
    async loadFolder(files) {
      const groups = new Map();
      for (const f of files) {
        const p = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
        if (!IMG.test(p)) continue;
        const parts = p.split('/');
        if (parts.length < 3) continue;
        const key = parts[parts.length - 3] + '/' + parts[parts.length - 2];
        if (!this.anims.has(key)) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
      }
      let n = 0;
      for (const [key, list] of groups) {
        // PNG files win over SVG ones in the same folder
        const png = list.filter((f) => !/\.svg$/i.test(f.name));
        const use = (png.length ? png : list).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const imgs = [];
        for (const f of use) {
          const img = await loadImage(URL.createObjectURL(f));
          if (img) imgs.push(img);
        }
        if (imgs.length) { this.anims.get(key).imgs = imgs; n++; }
      }
      return n;
    }

    get(entity, anim) { return this.anims.get(entity + '/' + anim); }

    /**
     * Frame to draw. phase: position in the original animation cycle, 0..1.
     * However many frames the folder has, they are spread over the same cycle,
     * so the animation lasts the same as the original one.
     */
    frame(entity, anim, phase) {
      const a = this.get(entity, anim);
      if (!a || !a.imgs.length) return null;
      const M = a.imgs.length;
      let i = Math.floor((((phase % 1) + 1) % 1) * M);
      if (i >= M) i = M - 1;
      return a.imgs[i];
    }

    /** Phase of a time based animation (duracion_frame = game frames per original frame). */
    timePhase(entity, anim, t) {
      const a = this.get(entity, anim);
      if (!a) return 0;
      const N = a.def.frames || 1, d = a.def.duracion_frame || 8;
      return (t % (N * d)) / (N * d);
    }

    size(entity) {
      const e = this.manifest && this.manifest.entidades[entity];
      return e ? e.tamano : [16, 16];
    }
  }

  R.Assets = Assets;
})(typeof window !== 'undefined' ? window : globalThis);
