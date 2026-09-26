// Writes the placeholder SVG graphics of the remake (remake/graficos/) and the
// manifest that describes every entity, its animations and its size in game
// pixels.  node tools/make-placeholders.js
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'remake', 'graficos');

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 8}" height="${h * 8}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
const label = (w, h, t, c = '#fff') => `<text x="${w / 2}" y="${h - 2}" font-family="sans-serif" font-size="${Math.min(6, w / (t.length * 0.6))}" text-anchor="middle" fill="${c}" stroke="#000" stroke-width="0.3">${t}</text>`;

// Charlie on the lion. frame: 0..2 legs, pose: run/jump/stand/fall/win
function charlieLeon(pose, k, back) {
  const w = 48, h = 32;
  const leg = [0, 3, -3][k % 3];
  const flip = back ? ` transform="translate(${w},0) scale(-1,1)"` : '';
  let lion = `<ellipse cx="22" cy="23" rx="15" ry="6" fill="#e8a080"/>
    <circle cx="38" cy="19" r="6" fill="#b83020"/><circle cx="40" cy="19" r="3.5" fill="#f0b090"/>
    <path d="M7 21 Q1 16 3 12" stroke="#e8a080" stroke-width="2" fill="none"/>`;
  if (pose === 'fall') {
    return svg(w, h, `<g${flip}><ellipse cx="24" cy="27" rx="17" ry="4.5" fill="#e8a080"/><circle cx="41" cy="26" r="5" fill="#b83020"/>
      <circle cx="12" cy="26" r="4" fill="#ffd0a0"/><rect x="15" y="24" width="10" height="4" fill="#d02020"/></g>${label(w, h, 'X_X')}`);
  }
  const legs = pose === 'jump'
    ? `<path d="M12 27 L4 25 M16 28 L10 31 M30 28 L36 31 M34 27 L42 25" stroke="#e8a080" stroke-width="3"/>`
    : `<path d="M12 27 L${11 - leg} 32 M17 28 L${18 + leg} 32 M29 28 L${28 - leg} 32 M34 27 L${35 + leg} 32" stroke="#e8a080" stroke-width="3"/>`;
  const arms = pose === 'win' && k === 1 ? '<path d="M21 8 L16 1 M27 8 L32 1" stroke="#ffd0a0" stroke-width="2"/>'
    : '<path d="M21 9 L16 13 M27 9 L32 13" stroke="#ffd0a0" stroke-width="2"/>';
  const charlie = `<rect x="19" y="7" width="10" height="9" rx="2" fill="#d02020"/>${arms}
    <circle cx="24" cy="5" r="4" fill="#ffd0a0"/><path d="M19 3 L24 -3 L29 3 Z" fill="#2080f0"/><circle cx="24" cy="-3" r="1.5" fill="#ffd000"/>`;
  return svg(w, h, `<g${flip}>${lion}${legs}</g><g transform="translate(0,${pose === 'jump' ? 2 : 0})">${charlie}</g>`);
}

function ring(part, k, small) {
  const w = 32, h = small ? 48 : 64;
  const cols = ['#ff6000', '#ffa000', '#ff3000'];
  const c = cols[k % 3];
  const rx = 13, ry = h / 2 - 3;
  // back half: left arc; front half: right arc (drawn over Charlie)
  const d = part === 'atras'
    ? `M16 ${3} A${rx} ${ry} 0 0 0 16 ${h - 3}`
    : `M16 ${3} A${rx} ${ry} 0 0 1 16 ${h - 3}`;
  const flames = part === 'adelante' ? `<path d="M16 5 l-3 -4 l3 1 l2 -3 l1 3 l3 -2 z" fill="${cols[(k + 1) % 3]}"/>` : '';
  return svg(w, h, `<path d="${d}" stroke="${c}" stroke-width="3.5" fill="none" stroke-dasharray="4 1.5"/>${flames}`);
}

function pot(k) {
  const w = 32, h = 32;
  const f = ['#ff5000', '#ffb000', '#ff2000'];
  return svg(w, h, `<path d="M6 18 h20 l-3 12 h-14 z" fill="#b020d0"/><rect x="4" y="16" width="24" height="4" rx="1" fill="#d060f0"/>
    <path d="M8 16 Q10 ${4 + k} 13 10 Q15 ${1 + k} 17 9 Q20 ${3 - k} 22 11 Q24 ${6 + k} 25 16 Z" fill="${f[k % 3]}"/>
    <path d="M12 16 Q14 ${9 + k} 16 12 Q18 ${8 - k} 20 16 Z" fill="#ffe060"/>`);
}

const bag = () => svg(16, 16, `<path d="M4 6 Q2 15 8 15 Q14 15 12 6 Z" fill="#d8b040"/><rect x="5" y="3" width="6" height="3" fill="#a07820"/>${label(16, 14, '$', '#205020')}`);
const sign = (t, w, h, bg, fg) => svg(w, h, `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="2" fill="${bg}" stroke="#fff" stroke-width="0.8"/>
  <text x="${w / 2}" y="${h / 2 + 3}" font-family="sans-serif" font-weight="bold" font-size="${Math.min(9, (w - 4) / (t.length * 0.62))}" text-anchor="middle" fill="${fg}">${t}</text>`);
const podium = () => svg(48, 32, `<rect x="2" y="4" width="44" height="28" fill="#2040c0"/><rect x="0" y="0" width="48" height="6" fill="#ffd000"/>
  <path d="M6 10 h36 M6 18 h36 M6 26 h36" stroke="#6080ff" stroke-width="1.5"/>${label(48, 24, 'META', '#fff')}`);
const firework = (k) => svg(32, 32, `<g stroke="${['#ff0', '#f0f', '#0ff', '#f80'][k]}" stroke-width="1.5">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
  const r = 4 + k * 3, x = 16 + r * Math.cos(a * Math.PI / 180), y = 16 + r * Math.sin(a * Math.PI / 180);
  return `<line x1="16" y1="16" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
}).join('')}</g>`);

// backgrounds (repeat every 256 pixels)
function audience() {
  let heads = '';
  for (let r = 0; r < 3; r++) for (let x = 2 + (r & 1) * 4; x < 256; x += 8) {
    const c = ['#e04040', '#40a0e0', '#e0e040', '#40e080', '#e080e0'][(x * 7 + r * 3) % 5];
    heads += `<circle cx="${x}" cy="${14 + r * 10}" r="3" fill="${c}"/>`;
  }
  let tents = '';
  for (let x = 0; x < 256; x += 16) tents += `<path d="M${x} 58 l8 -8 l8 8 z" fill="#fff"/>`;
  return svg(256, 64, `<rect width="256" height="64" fill="#303050"/><rect y="4" width="256" height="40" fill="#505070"/>${heads}
    <rect x="96" y="4" width="4" height="40" fill="#a0a0c0"/><rect x="224" y="4" width="4" height="40" fill="#a0a0c0"/>
    <rect y="48" width="256" height="12" fill="#a020d0"/>${tents}<rect y="60" width="256" height="4" fill="#2040ff"/>`);
}
const track = () => svg(256, 108, `<rect width="256" height="108" fill="#10a020"/>${[14, 40, 70, 100].map((y) => `<rect y="${y}" width="256" height="1.5" fill="#40c050"/>`).join('')}`);
const entrance = () => svg(48, 64, `<rect x="4" y="12" width="40" height="52" fill="#200010"/><path d="M0 12 Q24 -8 48 12 Z" fill="#e02080"/>
  <rect x="0" y="10" width="48" height="8" fill="#ffd000"/><path d="M4 18 v46 M44 18 v46" stroke="#e02080" stroke-width="6"/>`);
const sky = () => svg(256, 40, `<rect width="256" height="40" fill="#e81010"/>
  <g fill="#fff"><ellipse cx="40" cy="8" rx="12" ry="4"/><ellipse cx="150" cy="12" rx="10" ry="3.5"/><ellipse cx="220" cy="6" rx="9" ry="3"/></g>`);
const tent = () => svg(224, 40, `<path d="M70 40 L112 4 L154 40 Z" fill="#ffd000"/><path d="M84 40 L112 4 L98 40 Z M126 40 L112 4 L140 40 Z" fill="#2080f0"/>
  <line x1="112" y1="4" x2="112" y2="-2" stroke="#000"/><path d="M112 -2 l8 3 l-8 3 z" fill="#20a020"/>
  <g transform="translate(10 14)"><ellipse cx="28" cy="10" rx="28" ry="9" fill="#c0c0d0"/><rect x="8" y="5" width="36" height="10" rx="2" fill="#2040d0"/></g>
  <circle cx="196" cy="22" r="17" fill="none" stroke="#c0c0ff" stroke-width="2"/><circle cx="196" cy="22" r="3" fill="#20a020"/>`);
const lifeIcon = () => svg(16, 16, `<circle cx="8" cy="5" r="4" fill="#ffd0a0"/><path d="M3 4 L8 -2 L13 4 Z" fill="#2080f0"/><rect x="4" y="9" width="8" height="7" fill="#d02020"/>`);

const M = { tamano_juego: [224, 256], entidades: {} };
function ent(name, size, anims, desc) {
  M.entidades[name] = { descripcion: desc, tamano: size, animaciones: {} };
  for (const [an, def] of Object.entries(anims)) {
    const dir = path.join(OUT, name, an);
    fs.mkdirSync(dir, { recursive: true });
    def.svgs.forEach((s, i) => fs.writeFileSync(path.join(dir, String(i).padStart(2, '0') + '.svg'), s));
    const d = { ...def }; delete d.svgs; d.frames = def.svgs.length;
    M.entidades[name].animaciones[an] = d;
  }
}

const N3 = [0, 1, 2];
ent('charlie_leon', [48, 32], {
  quieto: { svgs: [charlieLeon('run', 0)], descripcion: 'parado' },
  corre: { svgs: N3.map((k) => charlieLeon('run', k)), modo: 'distancia', pixeles_por_frame: 11, descripcion: 'avanza (el frame cambia cada 11 px)' },
  retrocede: { svgs: N3.map((k) => charlieLeon('run', k, true)), modo: 'distancia', pixeles_por_frame: 11 },
  salta: { svgs: [charlieLeon('jump', 0)] },
  cae: { svgs: [charlieLeon('fall', 0)], descripcion: 'chocó con un aro o una olla' },
  celebra: { svgs: [charlieLeon('win', 0), charlieLeon('win', 1)], duracion_frame: 32 },
}, 'Charlie montado en el león');
ent('aro', [32, 64], {
  atras: { svgs: N3.map((k) => ring('atras', k)), duracion_frame: 3, descripcion: 'mitad trasera (detrás de Charlie)' },
  adelante: { svgs: N3.map((k) => ring('adelante', k)), duracion_frame: 3, descripcion: 'mitad delantera (delante de Charlie)' },
}, 'aro de fuego');
ent('aro_chico', [32, 48], {
  atras: { svgs: N3.map((k) => ring('atras', k, true)), duracion_frame: 3 },
  adelante: { svgs: N3.map((k) => ring('adelante', k, true)), duracion_frame: 3 },
}, 'aro chico con la bolsa de dinero');
ent('bolsa', [16, 16], { cuelga: { svgs: [bag()] } }, 'bolsa de dinero');
ent('olla', [32, 32], { arde: { svgs: N3.map(pot), duracion_frame: 5 } }, 'olla de fuego');
ent('podio', [48, 32], { quieto: { svgs: [podium()] } }, 'podio de la meta');
ent('fuegos', [32, 32], { explota: { svgs: [0, 1, 2, 3].map(firework), duracion_frame: 6 } }, 'fuegos artificiales de la meta');
ent('cartel_oh_no', [48, 16], { quieto: { svgs: [sign('OH NO!!', 48, 16, '#f0f020', '#e02020')] } }, 'cartel al morir');
ent('cartel_meta', [48, 16], { parpadea: { svgs: [sign('GOAL', 48, 16, '#2040ff', '#fff'), sign('GOAL', 48, 16, '#ff2080', '#fff')], duracion_frame: 8 } }, 'cartel de la meta');
const metros = {};
for (let v = 100; v >= 10; v -= 10) metros[v + 'm'] = { svgs: [sign(v + 'M', 48, 16, '#10a0e0', '#ff4010')] };
ent('cartel_metros', [48, 16], metros, 'carteles de distancia');
const puntos = {};
for (const v of [100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000]) puntos[String(v)] = { svgs: [sign(String(v), 32, 12, '#000', '#fff')] };
ent('puntos', [32, 12], puntos, 'puntos que aparecen al saltar');
ent('fondo', [256, 64], { publico: { svgs: [audience()], descripcion: 'se repite cada 256 px' } }, 'tribunas');
ent('fondo_pista', [256, 108], { pista: { svgs: [track()] } }, 'pista');
ent('entrada', [48, 64], { quieta: { svgs: [entrance()] } }, 'entrada del circo (se repite cada 256 px)');
ent('cielo', [256, 40], { quieto: { svgs: [sky()] } }, 'cielo del marcador (se repite)');
ent('carpa', [224, 40], { quieta: { svgs: [tent()] } }, 'carpa, dirigible y noria del marcador');
ent('vida', [16, 16], { quieta: { svgs: [lifeIcon()] } }, 'icono de vida');

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(M, null, 1));
// same data as a script: works when index.html is opened as a file (no fetch)
fs.writeFileSync(path.join(OUT, 'manifest.js'), '/* Generado por tools/make-placeholders.js (copia de manifest.json) */\n' +
  'window.Remake = window.Remake || {};\nwindow.Remake.MANIFEST = ' + JSON.stringify(M, null, 1) + ';\n');
fs.writeFileSync(path.join(OUT, 'LEEME.txt'), [
  'CIRCUS CHARLIE (remake) - GRAFICOS',
  '',
  'graficos/<entidad>/<animacion>/00.svg, 01.svg, ...',
  '',
  'Cada carpeta es una animacion. Los SVG son dibujos provisorios.',
  'Para reemplazarlos pon 00.png, 01.png, ... (o .svg) en la carpeta:',
  ' - de cualquier tamano: se escalan al tamano de la entidad (manifest.json',
  '   "tamano", en pixeles del juego original) con suavizado;',
  ' - con cualquier cantidad de frames: la animacion dura lo mismo que la original.',
  'Si una carpeta tiene PNG, se usan los PNG en lugar de los SVG.',
  '',
].join('\n'));
console.log('ok', Object.keys(M.entidades).length, 'entidades');
