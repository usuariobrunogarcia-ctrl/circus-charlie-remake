/*
 * Tiny PNG encoder (RGBA, zlib "stored" blocks - no compression needed for
 * 8x8 / 16x16 images). Works both in the browser and in Node.
 *   CC.PNG.encode(width, height, rgba:Uint8Array|Uint8ClampedArray) -> Uint8Array
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc(buf, start, end) {
    let c = 0xffffffff;
    for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function adler32(buf) {
    let a = 1, b = 0;
    for (let i = 0; i < buf.length; i++) { a = (a + buf[i]) % 65521; b = (b + a) % 65521; }
    return ((b << 16) | a) >>> 0;
  }

  function zlibStored(data) {
    const blocks = Math.max(1, Math.ceil(data.length / 65535));
    const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
    let o = 0;
    out[o++] = 0x78; out[o++] = 0x01;
    for (let b = 0; b < blocks; b++) {
      const start = b * 65535, len = Math.min(65535, data.length - start);
      out[o++] = b === blocks - 1 ? 1 : 0;
      out[o++] = len & 0xff; out[o++] = len >> 8;
      out[o++] = ~len & 0xff; out[o++] = (~len >> 8) & 0xff;
      out.set(data.subarray(start, start + len), o); o += len;
    }
    const ad = adler32(data);
    out[o++] = ad >>> 24; out[o++] = (ad >>> 16) & 0xff; out[o++] = (ad >>> 8) & 0xff; out[o++] = ad & 0xff;
    return out;
  }

  function encode(w, h, rgba) {
    const raw = new Uint8Array((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    }
    const idat = zlibStored(raw);
    const chunks = [];
    const chunk = (type, data) => {
      const c = new Uint8Array(12 + data.length);
      const dv = new DataView(c.buffer);
      dv.setUint32(0, data.length);
      for (let i = 0; i < 4; i++) c[4 + i] = type.charCodeAt(i);
      c.set(data, 8);
      dv.setUint32(8 + data.length, crc(c, 4, 8 + data.length));
      chunks.push(c);
    };
    const ihdr = new Uint8Array(13);
    const hv = new DataView(ihdr.buffer);
    hv.setUint32(0, w); hv.setUint32(4, h);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    chunk('IHDR', ihdr);
    chunk('IDAT', idat);
    chunk('IEND', new Uint8Array(0));
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const total = 8 + chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    out.set(sig, 0);
    let o = 8;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  CC.PNG = { encode };
})(typeof window !== 'undefined' ? window : globalThis);
