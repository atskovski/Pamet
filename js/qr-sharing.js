/* Pamet v1.2.0 — small, dependency-free QR encoder for authenticator setup URIs.
 * Fixed QR version 10-L (57x57) keeps the implementation narrow and auditable.
 * It supports UTF-8 byte-mode payloads up to the version's data capacity and
 * never sends the encoded value to another service.
 */
(function (global) {
  "use strict";

  const VERSION = 10;
  const SIZE = 17 + 4 * VERSION;
  const DATA_CODEWORDS = 274;
  const BLOCKS = [{ data: 68, total: 86 }, { data: 68, total: 86 }, { data: 69, total: 87 }, { data: 69, total: 87 }];
  const ALIGN = [6, 28, 50];

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];

  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function polyMul(a, b) {
    const out = new Uint8Array(a.length + b.length - 1);
    for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) out[i + j] ^= mul(a[i], b[j]);
    return out;
  }
  function generator(degree) {
    let p = Uint8Array.from([1]);
    for (let i = 0; i < degree; i += 1) p = polyMul(p, Uint8Array.from([1, EXP[i]]));
    return p;
  }
  function ecc(data, count) {
    const gen = generator(count);
    const msg = new Uint8Array(data.length + count); msg.set(data);
    for (let i = 0; i < data.length; i += 1) {
      const factor = msg[i];
      if (!factor) continue;
      for (let j = 0; j < gen.length; j += 1) msg[i + j] ^= mul(gen[j], factor);
    }
    return msg.slice(data.length);
  }

  function bitsToBytes(bits) {
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let n = 0;
      for (let j = 0; j < 8; j += 1) n = (n << 1) | (bits[i + j] || 0);
      out.push(n);
    }
    return out;
  }
  function appendBits(target, value, length) { for (let i = length - 1; i >= 0; i -= 1) target.push((value >>> i) & 1); }

  function encodeData(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    const bits = [];
    appendBits(bits, 0b0100, 4); // byte mode
    appendBits(bits, bytes.length, 16); // version 10 uses a 16-bit byte count
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    if (bits.length > DATA_CODEWORDS * 8) throw new Error("Authenticator QR payload is too large.");
    for (let i = 0; i < Math.min(4, DATA_CODEWORDS * 8 - bits.length); i += 1) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = bitsToBytes(bits);
    let pad = 0;
    while (data.length < DATA_CODEWORDS) { data.push(pad++ % 2 ? 0x11 : 0xec); }

    const dataBlocks = [];
    const eccBlocks = [];
    let offset = 0;
    BLOCKS.forEach((block) => {
      const d = Uint8Array.from(data.slice(offset, offset + block.data)); offset += block.data;
      dataBlocks.push(d); eccBlocks.push(ecc(d, block.total - block.data));
    });
    const codewords = [];
    const maxData = Math.max(...BLOCKS.map((b) => b.data));
    for (let i = 0; i < maxData; i += 1) dataBlocks.forEach((block) => { if (i < block.length) codewords.push(block[i]); });
    for (let i = 0; i < 18; i += 1) eccBlocks.forEach((block) => codewords.push(block[i]));
    return codewords;
  }

  function bch(value, poly) {
    let d = value;
    const polyDegree = 31 - Math.clz32(poly);
    while ((31 - Math.clz32(d)) >= polyDegree) d ^= poly << ((31 - Math.clz32(d)) - polyDegree);
    return d;
  }

  function matrix(text) {
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
    const set = (r, c, dark, reserve = true) => {
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
      modules[r][c] = !!dark; if (reserve) reserved[r][c] = true;
    };

    function finder(row, col) {
      for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        set(row + r, col + c, dark);
      }
    }
    finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);

    for (let i = 8; i < SIZE - 8; i += 1) {
      if (!reserved[6][i]) set(6, i, i % 2 === 0);
      if (!reserved[i][6]) set(i, 6, i % 2 === 0);
    }

    ALIGN.forEach((row) => ALIGN.forEach((col) => {
      if (reserved[row][col]) return;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) set(row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }));

    // Reserve format-information cells around the finders.
    for (let i = 0; i < 9; i += 1) { if (i !== 6) { set(8, i, false); set(i, 8, false); } }
    for (let i = 0; i < 8; i += 1) { set(8, SIZE - 1 - i, false); set(SIZE - 1 - i, 8, false); }
    set(SIZE - 8, 8, true); // fixed dark module

    // Version 10 information (18 bits), mirrored near top-right/bottom-left finders.
    const versionBits = (VERSION << 12) | bch(VERSION << 12, 0x1f25);
    for (let i = 0; i < 18; i += 1) {
      const dark = ((versionBits >>> i) & 1) !== 0;
      const a = Math.floor(i / 3), b = i % 3 + SIZE - 11;
      set(a, b, dark); set(b, a, dark);
    }

    const codewords = encodeData(text);
    const dataBits = [];
    codewords.forEach((word) => appendBits(dataBits, word, 8));
    let bit = 0;
    let upward = true;
    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let step = 0; step < SIZE; step += 1) {
        const row = upward ? SIZE - 1 - step : step;
        for (let offset = 0; offset < 2; offset += 1) {
          const c = col - offset;
          if (reserved[row][c]) continue;
          const raw = bit < dataBits.length ? dataBits[bit++] === 1 : false;
          const masked = ((row + c) % 2 === 0) ? !raw : raw; // mask pattern 0
          set(row, c, masked, false);
        }
      }
      upward = !upward;
    }

    // ECC level L = 01, mask pattern 0. Apply BCH and fixed QR format mask.
    const formatData = (1 << 3) | 0;
    const formatBits = (((formatData << 10) | bch(formatData << 10, 0x537)) ^ 0x5412) & 0x7fff;
    const bitAt = (i) => ((formatBits >>> i) & 1) !== 0;
    const vertical = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
    vertical.forEach(([r,c], i) => set(r, c, bitAt(i)));
    const horizontal = [[8,SIZE-1],[8,SIZE-2],[8,SIZE-3],[8,SIZE-4],[8,SIZE-5],[8,SIZE-6],[8,SIZE-7],[8,SIZE-8],[SIZE-7,8],[SIZE-6,8],[SIZE-5,8],[SIZE-4,8],[SIZE-3,8],[SIZE-2,8],[SIZE-1,8]];
    horizontal.forEach(([r,c], i) => set(r, c, bitAt(i)));
    set(SIZE - 8, 8, true);
    return modules;
  }

  function svg(text) {
    const modules = matrix(text);
    const quiet = 4;
    const dim = SIZE + quiet * 2;
    let path = "";
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) if (modules[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    return `<svg class="security-qr-svg" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="Authenticator setup QR code" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  global.PametQr = { svg, matrix };
})(window);
