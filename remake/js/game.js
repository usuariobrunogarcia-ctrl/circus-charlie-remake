/*
 * Circus Charlie remake - front end: title screen, HUD, wide screen renderer
 * and the main loop (60.6 frames per second like the arcade board).
 *
 * The picture is 256 game pixels tall (80 for the HUD, 176 for the ring) and
 * as wide as the window. Graphics come from graficos/ (see assets.js) and are
 * scaled to the size of each object in game pixels, with smoothing.
 */
(function () {
  'use strict';
  const R = window.Remake;
  const FPS = 18432000 / 3 / 384 / 264;
  const H = 256;
  const S1 = R.STAGE1;
  const $ = (id) => document.getElementById(id);

  const canvas = $('screen');
  const ctx = canvas.getContext('2d');
  const assets = new R.Assets('graficos/');
  const input = new window.CC.Input();
  const settings = (() => { try { return Object.assign({ difficulty: 1, lives: 3 }, JSON.parse(localStorage.getItem('remake-settings') || '{}')); } catch (e) { return { difficulty: 1, lives: 3 }; } })();

  let state = 'loading';     // loading | title | play | clear | over
  let stage = null, player = null, hiScore = 19830;
  let t = 0, stateT = 0, prevButton = false;
  let scale = 1, W = 224, ox = 0, hx = 0;  // logical width, original picture (playfield / HUD)

  // ---------------------------------------------------------------- layout
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    scale = canvas.height / H;
    W = canvas.width / scale;
    if (W < 224) { scale = canvas.width / 224; W = 224; }
    // the original 224 pixel picture: a little room behind Charlie, the rest ahead
    ox = Math.max(0, Math.min(96, (W - 224) * 0.2));
    hx = (W - 224) / 2;                    // HUD, titles and messages: centred
  }

  // ---------------------------------------------------------------- drawing
  function img(entity, anim, phase, x, y, flip) {
    const im = assets.frame(entity, anim, phase);
    if (!im) return;
    const [w, h] = assets.size(entity);
    if (flip) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, 0, 0, w, h);
      ctx.restore();
    } else ctx.drawImage(im, x, y, w, h);
  }

  // repeating strip (every 256 world pixels)
  function strip(entity, anim, y, cam) {
    const im = assets.frame(entity, anim, 0);
    if (!im) return;
    const [w, h] = assets.size(entity);
    let x = ((-cam + ox) % w + w) % w - w;
    for (; x < W; x += w) ctx.drawImage(im, x, y, w + 0.5, h);
  }

  function text(s, x, y, color, size, align) {
    ctx.font = `bold ${size || 8}px "Press Start 2P", "Courier New", monospace`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(s, x + 0.6, y + 0.6);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function drawHud() {
    strip('cielo', 'quieto', 0, 0);
    img('carpa', 'quieta', 0, hx, 0);
    // BONUS on the blimp
    const bonus = stage ? stage.bonus : 0;
    if (stage && state !== 'title') {
      text('BONUS', hx + 22, 12, '#2040ff', 7);
      const low = bonus < 500 && (t & 16);
      text(String(bonus).padStart(4, '0'), hx + 24, 21, low ? '#ff2020' : '#fff', 8);
    }
    // score panel
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 40, W, 40);
    const px = hx + 4, pw = 216;
    for (let x = px; x < px + pw; x += 5) {
      ctx.fillStyle = ['#ff2020', '#ffe020', '#20e020', '#2060ff'][((x - px) / 5 + (t >> 3)) & 3];
      ctx.fillRect(x, 42, 2.5, 2.5); ctx.fillRect(x, 75, 2.5, 2.5);
    }
    text('1UP', px + 6, 48, '#ffe020', 7);
    text(String(player ? player.score : 0).padStart(6, ' '), px + 40, 48, '#fff', 8);
    text('HIGH SCORE', px + 110, 48, '#ff2020', 7);
    text(String(hiScore).padStart(6, ' '), px + 128, 58, '#20e020', 8);
    if (player && state !== 'title') {
      for (let i = 0; i < Math.min(5, player.lives - 1); i++) img('vida', 'quieta', 0, px + 6 + i * 16, 58);
    } else text('PUSH ENTER', px + 120, 68, '#ff80ff', 7);
  }

  function drawStage() {
    const st = stage, cam = st.cam, c = st.c;
    // background: audience, entrances and the ring (repeat every 256 pixels)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 80, W, H - 80);
    strip('fondo', 'publico', 84, cam);
    for (let k = Math.floor((cam - ox) / 256) - 1; k * 256 < cam - ox + W + 256; k++) {
      img('entrada', 'quieta', 0, k * 256 + 120 - cam + ox, 84);
    }
    strip('fondo_pista', 'pista', 148, cam);
    const sx = (wx) => wx - cam + ox;       // world -> screen

    // podium at the end of the track
    img('podio', 'quieto', 0, sx(S1.PODIUM_X), 208);
    // distance markers (bottom)
    for (const mk of st.markers(cam - ox, cam - ox + W)) {
      if (assets.get('cartel_metros', mk.value + 'm')) img('cartel_metros', mk.value + 'm', 0, sx(mk.x), 240);
    }
    // the next pot is already visible in a wide window
    const up = st.upcomingPot;
    if (up !== null && sx(up) - 32 < W) img('olla', 'arde', assets.timePhase('olla', 'arde', t), sx(up) - 16, 210);

    const ringBox = (r) => ({ x: ox + st.hw(r.x) - 16 - 16, small: r.small });
    // rings: back halves behind Charlie
    for (const r of st.rings) {
      const b = ringBox(r), e = r.small ? 'aro_chico' : 'aro';
      img(e, 'atras', assets.timePhase(e, 'atras', r.flame), b.x, 140);
    }
    for (const p of st.pots) img('olla', 'arde', assets.timePhase('olla', 'arde', p.flame), sx(p.x) - 16, 210);

    // Charlie and the lion
    const cy = c.y >> 8;
    const cx = ox + S1.CHARLIE_X;
    if (st.state === 'goal' || st.state === 'clear') {
      img('podio', 'quieto', 0, cx, cy + 32 - 8);
      img('charlie_leon', 'celebra', assets.timePhase('charlie_leon', 'celebra', st.timer), cx, cy);
    } else if (c.pose === 'corre' || c.pose === 'retrocede') {
      // the legs move with the distance travelled: 11 pixels per original frame
      const moved = Math.abs((c.walkMark - st.fineHi() + 0x80) & 0xff) - 0x80;
      const frac = Math.min(0.99, Math.abs(moved) / 11);
      img('charlie_leon', c.pose, (c.walkFrame + frac) / 3, cx, cy);
    } else img('charlie_leon', c.pose, 0, cx, cy);

    // rings: front halves over Charlie, money bags
    for (const r of st.rings) {
      const b = ringBox(r), e = r.small ? 'aro_chico' : 'aro';
      img(e, 'adelante', assets.timePhase(e, 'adelante', r.flame), b.x, 140);
      if (r.small && r.bag) img('bolsa', 'cuelga', 0, b.x + 8, 164);
    }
    for (const p of st.popups) {
      const key = String(p.value);
      if (assets.get('puntos', key)) img('puntos', key, 0, sx(p.x) - 16, p.y - (0x30 - p.t) / 4);
    }
    for (const f of st.fireworks || []) img('fuegos', 'explota', 1 - f.t / 24, sx(f.x) - 16, f.y);
    if (st.state === 'dead') {
      img('cartel_oh_no', 'quieto', 0, cx - 8, 92);
      img('cartel_oh_no', 'quieto', 0, cx + 90, 104);
    }
    if (st.state === 'goal' || st.state === 'clear') img('cartel_meta', 'parpadea', assets.timePhase('cartel_meta', 'parpadea', st.timer), cx + 72, 110);
    if (st.state === 'clear') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(hx + 20, 110, 184, 60);
      text('FINE!!', hx + 112, 116, '#fff', 8, 'center');
      text(`BONUS ${st.bonus}  ->  ${st.clearPoints}`, hx + 112, 134, '#ffe020', 7, 'center');
      text('PUSH ENTER', hx + 112, 152, (t & 16) ? '#ff80ff' : '#fff', 7, 'center');
    }
  }

  function drawTitle() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 80, W, H - 80);
    text('CIRCUS', hx + 112, 110, '#ffe020', 22, 'center');
    text('CHARLIE', hx + 112, 136, '#20e020', 22, 'center');
    text('ETAPA 1 - REMAKE DE PRUEBA', hx + 112, 176, '#80c0ff', 7, 'center');
    if (t & 32) text('PUSH ENTER', hx + 112, 200, '#ff80ff', 9, 'center');
    text('← → moverse   ESPACIO saltar   ESC menu', hx + 112, 232, '#888', 6, 'center');
  }

  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (state === 'loading') { text('Cargando graficos...', 10, 120, '#fff', 8); return; }
    if (stage && state !== 'title') drawStage(); else drawTitle();
    drawHud();
    if (state === 'over') text('GAME OVER', hx + 112, 150, '#ff2020', 12, 'center');
  }

  // ---------------------------------------------------------------- logic
  function newGame() {
    player = { score: 0, lives: settings.lives, rings: 0, pots: 0, misses: 0, round: 1, checkpoint: 0, seed: (Math.random() * 1e9) | 0 };
    stage = new R.Stage1(player, { difficulty: settings.difficulty });
    state = 'play'; stateT = 0;
  }

  function frame() {
    t++; stateT++;
    const inp = input.frame();
    const jump = inp.button && !prevButton;
    prevButton = inp.button;
    if (state === 'title') { if (inp.start1) newGame(); return; }
    if (state === 'over') { if (stateT > 180 || (stateT > 30 && inp.start1)) { state = 'title'; stage = null; } return; }
    if (state === 'clear') { if (stateT > 60 && inp.start1) { state = 'title'; stage = null; } return; }
    stage.update({ left: inp.left, right: inp.right, jump }, { left: -ox, right: W - ox });
    if (player.score > hiScore) hiScore = player.score;
    if (stage.state === 'restart') stage.restart(player.checkpoint);
    else if (stage.state === 'over') { state = 'over'; stateT = 0; }
    else if (stage.state === 'clear' && state !== 'clear') { state = 'clear'; stateT = 0; }
    stage.events.length = 0;
  }

  let last = 0, acc = 0, paused = false;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(100, now - last);
    last = now;
    if (!paused && state !== 'loading') {
      acc += dt;
      const step = 1000 / FPS;
      let n = 0;
      while (acc >= step && n < 4) { frame(); acc -= step; n++; }
      if (n === 4) acc = 0;
    }
    draw();
  }

  // ---------------------------------------------------------------- menu
  function setupMenu() {
    input.onKey = (code, e) => {
      if (code === 'Escape') { $('menu').hidden = !$('menu').hidden; paused = !$('menu').hidden; e.preventDefault(); return false; }
      if (code === 'KeyP') { paused = !paused; return false; }
      if (code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); return false; }
      return true;
    };
    $('difficulty').value = settings.difficulty;
    $('lives').value = settings.lives;
    $('difficulty').onchange = (e) => { settings.difficulty = +e.target.value; save(); };
    $('lives').onchange = (e) => { settings.lives = +e.target.value; save(); };
    $('gfx-folder').onchange = async (e) => {
      const n = await assets.loadFolder(e.target.files);
      $('gfx-status').textContent = n ? `${n} animaciones reemplazadas` : 'No se encontraron carpetas de graficos';
    };
    $('btn-close').onclick = () => { $('menu').hidden = true; paused = false; };
  }
  function save() { try { localStorage.setItem('remake-settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

  async function init() {
    resize();
    window.addEventListener('resize', resize);
    setupMenu();
    requestAnimationFrame(loop);
    await assets.load();
    state = 'title';
  }

  window.RemakeApp = { get stage() { return stage; }, get state() { return state; }, get player() { return player; }, assets, newGame };
  init();
})();
