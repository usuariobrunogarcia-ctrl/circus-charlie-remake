/*
 * Web front end: loads the ROM set (folder or zip), runs the rewritten game
 * engine at the arcade frame rate and draws it with the HD capable renderer.
 */
(function () {
  'use strict';
  const CC = window.CC;
  const FPS = 18432000 / 3 / 384 / 264;          // 60.606 Hz, like the arcade
  const ROM_FILES = ['380_u05.3h', '380_p04.4h', '380_p03.5h', '380_p02.6h', '380_p01.7h', '380_l14.5c', '380_l15.7c',
    '380_j12.4a', '380_j13.5a', '380_j06.11e', '380_j07.12e', '380_j08.13e', '380_j09.14e', '380_j10.15e', '380_j11.16e',
    '380_j18.2a', '380_j17.7b', '380_j16.10c'];

  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const settings = loadSettings();
  let game, gfx, renderer, hd, input;
  let running = false, paused = false;
  let spriteBuffer = new Uint8Array(256);
  let frameNo = 0;
  const vs = { videoram: null, colorram: null, sprites: spriteBuffer, scroll: 0, flip: 0 };

  function loadSettings() {
    const def = { displayMode: 'wide', smooth: false, hd: true, ambient: true, scanlines: false, lives: 3, difficulty: 'normal' };
    try { return Object.assign(def, JSON.parse(localStorage.getItem('cc-settings') || '{}')); } catch (e) { return def; }
  }
  function saveSettings() { try { localStorage.setItem('cc-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

  function status(t) { $('status').textContent = t; }

  // ---------------------------------------------------------------- ROM loading
  async function fetchRoms() {
    // 1) folder next to the page
    try {
      const files = {};
      await Promise.all(ROM_FILES.map(async (n) => {
        const r = await fetch('circuscc/' + n);
        if (!r.ok) throw new Error(n);
        files[n] = new Uint8Array(await r.arrayBuffer());
      }));
      return files;
    } catch (e) { /* try the zip */ }
    for (const z of ['circuscc.zip', 'roms/circuscc.zip']) {
      try {
        const r = await fetch(z);
        if (r.ok) return await CC.Zip.read(await r.arrayBuffer());
      } catch (e) { /* next */ }
    }
    return null;
  }

  async function filesFromList(list) {
    const files = {};
    for (const f of list) {
      const data = new Uint8Array(await f.arrayBuffer());
      if (/\.zip$/i.test(f.name)) Object.assign(files, await CC.Zip.read(data));
      else files[f.webkitRelativePath || f.name] = data;
    }
    return files;
  }

  async function startWith(files) {
    let roms;
    try { roms = CC.Roms.buildRoms(files); } catch (e) { status(e.message); return; }
    gfx = new CC.Graphics(roms);
    const defs = (CC.ANIMDEFS && JSON.parse(JSON.stringify(CC.ANIMDEFS))) || { anims: [], tiles: [] };
    hd = new CC.HD.HDPack(gfx, defs);
    renderer = new CC.Renderer(canvas, gfx, hd);
    game = new CC.Game(CC.patchRomForEnter(roms.main));
    hookWidescreen(game);
    applyDips();
    game.boot();
    $('loader').hidden = true;
    applySettings();
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  // widescreen: the renderer learns the stage background when it has been drawn,
  // and stops extending it when the screen is cleared
  function hookWidescreen(g) {
    const P = CC.Game.prototype;
    g.drawStageDone_7015 = function () {
      P.drawStageDone_7015.call(this);
      renderer.captureBase(this.m.subarray(0x3400, 0x3800), this.m.subarray(0x3000, 0x3400));
    };
    for (const name of ['clearScreenStep_BA63', 'clearPlayfield_6AF1', 'clearScreen_699B']) {
      g[name] = function (...a) { renderer.setExtended(false); return P[name].apply(this, a); };
    }
  }

  function applyDips() {
    const lives = { 3: 3, 4: 2, 5: 1, 7: 0 }[settings.lives] ?? 3;
    const diff = { easy: 0x60, normal: 0x40, hard: 0x20, hardest: 0x00 }[settings.difficulty] ?? 0x40;
    game.in.dsw1 = 0x00;                              // free play: no coins, ENTER starts
    game.in.dsw2 = lives | 0x08 | diff;                // demo sounds on, upright
  }

  function applySettings() {
    if (!renderer) return;
    renderer.displayMode = settings.displayMode;
    renderer.smooth = settings.smooth;
    renderer.useHD = settings.hd;
    renderer.ambient = settings.ambient;
    renderer.scanlines = settings.scanlines;
    document.querySelectorAll('[data-set]').forEach((el) => {
      const k = el.dataset.set;
      if (el.type === 'checkbox') el.checked = !!settings[k]; else el.value = settings[k];
    });
  }

  // ---------------------------------------------------------------- main loop
  let last = 0, acc = 0;
  function loop(t) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(100, t - last);
    last = t;
    if (paused) return;
    acc += dt;
    const step = 1000 / FPS;
    let n = 0;
    while (acc >= step && n < 4) { frame(); acc -= step; n++; }
    if (n === 4) acc = 0;
    if (n) draw();
  }

  function frame() {
    const inp = input.frame();
    let sys = 0xff, p1 = 0xff;
    if (inp.start1) sys &= ~0x08;
    if (inp.start2) sys &= ~0x10;
    if (inp.left) p1 &= ~0x01;
    if (inp.right) p1 &= ~0x02;
    if (inp.button) p1 &= ~0x10;
    game.in.system = sys; game.in.p1 = p1; game.in.p2 = p1;
    // vblank: the sprite hardware latches the bank written during the last frame
    const bank = game.out.spriteBank ? 0x3900 : 0x3800;
    spriteBuffer.set(game.m.subarray(bank, bank + 0x100));
    try { game.tick(); } catch (e) {
      if (!(e instanceof CC.Game.Todo)) throw e;
      if (!frame.warned) { console.warn(e.message); frame.warned = true; }
    }
    frameNo++;
  }

  function draw() {
    vs.videoram = game.m.subarray(0x3400, 0x3800);
    vs.colorram = game.m.subarray(0x3000, 0x3400);
    vs.sprites = spriteBuffer;
    vs.scroll = game.out.scroll;
    renderer.render(vs, frameNo);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    if (game) draw();
  }

  // ---------------------------------------------------------------- UI
  function toggleMenu(show) {
    const menu = $('menu');
    menu.hidden = show === undefined ? !menu.hidden : !show;
    paused = !menu.hidden;
  }

  function setupUI() {
    input = new CC.Input();
    input.onKey = (code, e) => {
      if (code === 'Escape') { toggleMenu(); e.preventDefault(); return false; }
      if (code === 'KeyP') { paused = !paused; return false; }
      if (code === 'KeyH') { settings.hd = !settings.hd; saveSettings(); applySettings(); return false; }
      if (code === 'KeyW') {
        const modes = ['fit', 'wide', 'stretch'];
        settings.displayMode = modes[(modes.indexOf(settings.displayMode) + 1) % modes.length];
        saveSettings(); applySettings(); return false;
      }
      if (code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); return false; }
      return true;
    };
    document.querySelectorAll('[data-set]').forEach((el) => {
      el.addEventListener('change', () => {
        const k = el.dataset.set;
        settings[k] = el.type === 'checkbox' ? el.checked : (isNaN(+el.value) ? el.value : +el.value);
        saveSettings(); applySettings();
        if (k === 'lives' || k === 'difficulty') applyDips();
      });
    });
    $('btn-close').onclick = () => toggleMenu(false);
    $('btn-menu').onclick = () => toggleMenu(true);
    $('rom-files').onchange = async (e) => startWith(await filesFromList(e.target.files));
    $('rom-folder').onchange = async (e) => startWith(await filesFromList(e.target.files));
    $('hd-folder').onchange = async (e) => loadHD(e.target.files);
    $('hd-zip').onchange = async (e) => loadHD(e.target.files);
    $('btn-export').onclick = exportGraphics;
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = await filesFromList(e.dataTransfer.files);
      if (!game) startWith(files); else loadHDFiles(files);
    });
    window.addEventListener('resize', resize);
    resize();
  }

  async function loadHD(list) {
    const files = {};
    for (const f of list) {
      if (/\.zip$/i.test(f.name)) Object.assign(files, await CC.Zip.read(new Uint8Array(await f.arrayBuffer())));
      else files[f.webkitRelativePath || f.name] = f;
    }
    loadHDFiles(files);
  }

  async function loadHDFiles(files) {
    if (!hd) return;
    $('hd-status').textContent = 'Cargando...';
    const n = await hd.load(files, (d, t) => { $('hd-status').textContent = `Cargando ${d}/${t}`; });
    $('hd-status').textContent = n ? `${n} gráficos HD cargados` : 'No se encontraron gráficos modificados';
  }

  function exportGraphics() {
    if (!gfx) return;
    const defs = (CC.ANIMDEFS && JSON.parse(JSON.stringify(CC.ANIMDEFS))) || { anims: [], tiles: [] };
    const files = CC.HD.buildExport(gfx, defs);
    const zip = CC.Zip.write(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = 'circus_charlie_graficos.zip';
    a.click();
  }

  async function init() {
    setupUI();
    status('Buscando el ROM (carpeta circuscc/ o circuscc.zip)...');
    const files = await fetchRoms();
    if (files) startWith(files);
    else status('Arrastra aquí circuscc.zip o la carpeta circuscc, o elige los archivos.');
  }

  window.CCApp = { get game() { return game; }, get renderer() { return renderer; }, settings, applySettings, input: () => input };
  init();
})();
