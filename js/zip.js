/*
 * Minimal ZIP support.
 *   CC.Zip.read(arrayBuffer)  -> Promise<{ [path]: Uint8Array }>   (stored + deflate)
 *   CC.Zip.write(files)       -> Uint8Array                        (stored, no compression)
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

  function crc32(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ---------------------------------------------------------------- inflate
  // Small pure JS inflate (RFC1951) used when DecompressionStream is missing.
  function inflateRaw(src) {
    let pos = 0, bitBuf = 0, bitCnt = 0;
    let out = new Uint8Array(Math.max(1024, src.length * 4)), outLen = 0;
    const ensure = (n) => {
      if (outLen + n <= out.length) return;
      let sz = out.length * 2;
      while (sz < outLen + n) sz *= 2;
      const o = new Uint8Array(sz); o.set(out.subarray(0, outLen)); out = o;
    };
    const bits = (n) => {
      while (bitCnt < n) {
        if (pos >= src.length) throw new Error('inflate: datos truncados');
        bitBuf |= src[pos++] << bitCnt; bitCnt += 8;
      }
      const v = bitBuf & ((1 << n) - 1);
      bitBuf >>>= n; bitCnt -= n;
      return v;
    };
    function buildHuff(lengths) {
      const counts = new Uint16Array(16), offs = new Uint16Array(16);
      for (const l of lengths) counts[l]++;
      counts[0] = 0;
      for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
      const symbols = new Uint16Array(lengths.length);
      for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
      return { counts, symbols };
    }
    function decodeSym(h) {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = h.counts[len];
        if (code - count < first) return h.symbols[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
      }
      throw new Error('inflate: código inválido');
    }
    const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
    const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    let fixedL = null, fixedD = null;
    let final = 0;
    do {
      final = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitBuf = 0; bitCnt = 0;
        const len = src[pos] | (src[pos + 1] << 8); pos += 4;
        ensure(len); out.set(src.subarray(pos, pos + len), outLen); outLen += len; pos += len;
        continue;
      }
      let lh, dh;
      if (type === 1) {
        if (!fixedL) {
          const l = new Uint8Array(288);
          for (let i = 0; i < 144; i++) l[i] = 8;
          for (let i = 144; i < 256; i++) l[i] = 9;
          for (let i = 256; i < 280; i++) l[i] = 7;
          for (let i = 280; i < 288; i++) l[i] = 8;
          fixedL = buildHuff(l);
          fixedD = buildHuff(new Uint8Array(30).fill(5));
        }
        lh = fixedL; dh = fixedD;
      } else if (type === 2) {
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
        const cl = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) cl[ORDER[i]] = bits(3);
        const ch = buildHuff(cl);
        const lens = new Uint8Array(hlit + hdist);
        for (let i = 0; i < hlit + hdist;) {
          const sym = decodeSym(ch);
          if (sym < 16) lens[i++] = sym;
          else if (sym === 16) { const p = lens[i - 1]; let r = 3 + bits(2); while (r--) lens[i++] = p; }
          else if (sym === 17) { let r = 3 + bits(3); while (r--) lens[i++] = 0; }
          else { let r = 11 + bits(7); while (r--) lens[i++] = 0; }
        }
        lh = buildHuff(lens.subarray(0, hlit));
        dh = buildHuff(lens.subarray(hlit));
      } else throw new Error('inflate: bloque inválido');
      for (;;) {
        const sym = decodeSym(lh);
        if (sym < 256) { ensure(1); out[outLen++] = sym; }
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const len = LBASE[li] + bits(LEXT[li]);
          const ds = decodeSym(dh);
          const dist = DBASE[ds] + bits(DEXT[ds]);
          ensure(len);
          for (let i = 0; i < len; i++) { out[outLen] = out[outLen - dist]; outLen++; }
        }
      }
    } while (!final);
    return out.subarray(0, outLen);
  }

  async function inflate(data) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([data]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) { /* fall back */ }
    }
    return inflateRaw(data);
  }

  async function read(buffer) {
    const u8 = new Uint8Array(buffer);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    // locate end of central directory
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No es un archivo ZIP válido');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      const lNameLen = dv.getUint16(local + 26, true);
      const lExtraLen = dv.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const raw = u8.subarray(start, start + csize);
      if (method === 0) files[name] = raw.slice();
      else if (method === 8) files[name] = await inflate(raw);
      else throw new Error('Método de compresión ZIP no soportado: ' + method);
    }
    return files;
  }

  /** files: array of {name, data:Uint8Array} */
  function write(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const h = new Uint8Array(30 + name.length);
      const dv = new DataView(h.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, f.data.length, true); dv.setUint32(22, f.data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      h.set(name, 30);
      parts.push(h, f.data);
      const c = new Uint8Array(46 + name.length);
      const cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true); cv.setUint32(24, f.data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      c.set(name, 46);
      central.push(c);
      offset += h.length + f.data.length;
    }
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
    const total = offset + cdSize + 22;
    const outBuf = new Uint8Array(total);
    let o = 0;
    for (const p of parts.concat(central, [end])) { outBuf.set(p, o); o += p.length; }
    return outBuf;
  }

  CC.Zip = { read, write, crc32, inflateRaw };
})(typeof window !== 'undefined' ? window : globalThis);
