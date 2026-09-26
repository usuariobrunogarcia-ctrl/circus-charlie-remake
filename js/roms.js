/*
 * ROM set description and loading of the ROM regions from the files of the
 * MAME "circuscc" set (the other Circus Charlie revisions are accepted too).
 */
(function (root) {
  'use strict';
  const CC = root.CC = root.CC || {};
  // ROM set description. Several names are accepted for the program ROMs so
  // that other revisions of the game work too.
  const ROMSET = {
    main: [
      { names: ['380_u05.3h', '380_s05.3h', '380_w05.3h', '380_r05.3h', '380_p05.3h'], offset: 0x6000 },
      { names: ['380_p04.4h', '380_q04.4h', '380_r04.4h', '380_n04.4h'], offset: 0x8000 },
      { names: ['380_p03.5h', '380_q03.5h', '380_r03.5h', '380_n03.5h'], offset: 0xa000 },
      { names: ['380_p02.6h', '380_q02.6h', '380_r02.6h', '380_n02.6h'], offset: 0xc000 },
      { names: ['380_p01.7h', '380_q01.7h', '380_n01.7h'], offset: 0xe000 },
    ],
    sound: [
      { names: ['380_l14.5c'], offset: 0x0000 },
      { names: ['380_l15.7c'], offset: 0x2000 },
    ],
    tiles: [
      { names: ['380_j12.4a'], offset: 0x0000 },
      { names: ['380_j13.5a', '380_k13.5a'], offset: 0x2000 },
    ],
    sprites: [
      { names: ['380_j06.11e'], offset: 0x0000 },
      { names: ['380_j07.12e'], offset: 0x2000 },
      { names: ['380_j08.13e'], offset: 0x4000 },
      { names: ['380_j09.14e'], offset: 0x6000 },
      { names: ['380_j10.15e'], offset: 0x8000 },
      { names: ['380_j11.16e'], offset: 0xa000 },
    ],
    proms: [
      { names: ['380_j18.2a'], offset: 0x000, size: 0x20 },
      { names: ['380_j17.7b'], offset: 0x020, size: 0x100 },
      { names: ['380_j16.10c'], offset: 0x120, size: 0x100 },
    ],
  };

  function findFile(files, names) {
    for (const n of names) {
      for (const k of Object.keys(files)) {
        const base = k.split('/').pop().toLowerCase();
        if (base === n) return { name: n, data: files[k] };
      }
    }
    return null;
  }

  function loadRegion(files, list, size, missing) {
    const region = new Uint8Array(size);
    const used = [];
    for (const ent of list) {
      const f = findFile(files, ent.names);
      if (!f) { missing.push(ent.names[0]); continue; }
      const len = ent.size || 0x2000;
      region.set(f.data.subarray(0, len), ent.offset);
      used.push(f.name);
    }
    return { region, used };
  }

  /** Builds the ROM regions from a {filename: Uint8Array} map. Throws on missing files. */
  function buildRoms(files) {
    const missing = [];
    const main = loadRegion(files, ROMSET.main, 0x10000, missing);
    const sound = loadRegion(files, ROMSET.sound, 0x4000, missing);
    const tiles = loadRegion(files, ROMSET.tiles, 0x4000, missing);
    const sprites = loadRegion(files, ROMSET.sprites, 0xc000, missing);
    const proms = loadRegion(files, ROMSET.proms, 0x220, missing);
    if (missing.length) {
      const err = new Error('Faltan archivos del ROM: ' + missing.join(', '));
      err.missing = missing;
      throw err;
    }
    return {
      main: main.region, sound: sound.region, tiles: tiles.region,
      sprites: sprites.region, proms: proms.region,
      version: main.used[0],
    };
  }

  CC.Roms = { ROMSET, buildRoms };
  CC.CircusCharlie = CC.CircusCharlie || {};
  CC.CircusCharlie.buildRoms = CC.CircusCharlie.buildRoms || buildRoms;
})(typeof window !== 'undefined' ? window : globalThis);
