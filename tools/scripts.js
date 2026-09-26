// Input scripts shared by the verification tools.
function lcg(seed) { let s = seed || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
// start a game on stage `st` (1..6) then play with a random bot
function playStage(st, seed) {
  const rnd = lcg(seed || 7);
  const pre = [];
  for (let i = 0; i < 420; i++) pre.push({});
  for (let i = 0; i < 6; i++) pre.push({ start1: 1 });
  for (let i = 0; i < 60; i++) pre.push({});
  for (let s = 1; s < st; s++) { for (let i = 0; i < 6; i++) pre.push({ right: 1 }); for (let i = 0; i < 20; i++) pre.push({}); }
  for (let i = 0; i < 6; i++) pre.push({ button: 1 });
  let hold = {}, left = 0;
  return (f) => {
    if (f < pre.length) return pre[f];
    if (left-- <= 0) { const x = rnd(); hold = { right: x < 0.6, left: x > 0.85, button: rnd() < 0.3 }; left = 3 + Math.floor(rnd() * 30); }
    return hold;
  };
}
const attract = () => () => ({});
// replays the inputs saved by tools/explore.js (INPUTS=file); then idles
function replay(json) {
  const seq = JSON.parse(json);
  return (f) => {
    const v = seq[f] || 0;
    return { start1: !!(v & 8), left: !!(v & 1), right: !!(v & 2), button: !!(v & 16) };
  };
}
module.exports = { playStage, attract, lcg, replay };
