// Loads the browser scripts into Node for headless tools/tests.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const scripts = ['m6809.js', 'z80.js', 'sn76496.js', 'machine.js', 'gfx.js'];
for (const s of scripts) {
  const code = fs.readFileSync(path.join(ROOT, 'js', s), 'utf8');
  new Function(code).call(globalThis);
}
const CC = globalThis.CC;

function loadRomDir(dir) {
  dir = dir || path.join(ROOT, 'circuscc');
  const files = {};
  for (const f of fs.readdirSync(dir)) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
  return CC.CircusCharlie.buildRoms(files);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngEncode(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function savePng(file, w, h, u32) {
  const u8 = new Uint8Array(u32.buffer, u32.byteOffset, w * h * 4);
  fs.writeFileSync(file, pngEncode(w, h, u8));
}
module.exports = { CC, loadRomDir, pngEncode, savePng, ROOT };
