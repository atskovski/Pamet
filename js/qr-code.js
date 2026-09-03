/* Pamet local QR renderer for authenticator setup.
 * Fixed QR version 8-L, byte mode. The otpauth secret never leaves the browser.
 */
(function (global) {
  "use strict";

  const VERSION = 8;
  const SIZE = 17 + VERSION * 4;
  const DATA_CODEWORDS = 194;
  const BLOCK_DATA = 97;
  const EC_CODEWORDS = 24;
  const ALIGNMENT = [6, 24, 42];

  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < EXP.length; i++) EXP[i] = EXP[i - 255];

  const mul = (a, b) => (!a || !b) ? 0 : EXP[LOG[a] + LOG[b]];

  function generator(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function reedSolomon(data, degree) {
    const gen = generator(degree);
    const msg = data.concat(new Array(degree).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = msg[i];
      if (!factor) continue;
      for (let j = 0; j < gen.length; j++) msg[i + j] ^= mul(gen[j], factor);
    }
    return msg.slice(data.length);
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function encodeData(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    if (bytes.length > 190) throw new Error("Authenticator account label is too long to render as a QR code.");
    const bits = [];
    appendBits(bits, 0b0100, 4); // byte mode
    appendBits(bits, bytes.length, 8); // versions 1-9
    bytes.forEach((byte) => appendBits(bits, byte, 8));
    const capacity = DATA_CODEWORDS * 8;
    for (let i = 0; i < Math.min(4, capacity - bits.length); i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
      data.push(value);
    }
    let pad = 0;
    while (data.length < DATA_CODEWORDS) data.push((pad++ % 2) ? 0x11 : 0xec);
    return data;
  }

  function codewords(text) {
    const data = encodeData(text);
    const blocks = [data.slice(0, BLOCK_DATA), data.slice(BLOCK_DATA, BLOCK_DATA * 2)];
    const ec = blocks.map((block) => reedSolomon(block, EC_CODEWORDS));
    const out = [];
    for (let i = 0; i < BLOCK_DATA; i++) blocks.forEach((block) => out.push(block[i]));
    for (let i = 0; i < EC_CODEWORDS; i++) ec.forEach((block) => out.push(block[i]));
    return out;
  }

  function bchFormat(data) {
    let d = data << 10;
    const generatorBits = 0x537;
    const degree = (n) => 31 - Math.clz32(n);
    while (degree(d) >= degree(generatorBits)) d ^= generatorBits << (degree(d) - degree(generatorBits));
    return ((data << 10) | d) ^ 0x5412;
  }

  function matrix(text) {
    const modules = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));

    function finder(row, col) {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
        modules[rr][cc] = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      }
    }

    finder(0, 0);
    finder(SIZE - 7, 0);
    finder(0, SIZE - 7);

    ALIGNMENT.forEach((row) => ALIGNMENT.forEach((col) => {
      if (modules[row][col] !== null) return;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) modules[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
    }));

    for (let i = 8; i < SIZE - 8; i++) {
      if (modules[i][6] === null) modules[i][6] = i % 2 === 0;
      if (modules[6][i] === null) modules[6][i] = i % 2 === 0;
    }

    const format = bchFormat((1 << 3) | 0); // error correction L, mask 0
    for (let i = 0; i < 15; i++) {
      const bit = ((format >> i) & 1) === 1;
      if (i < 6) modules[i][8] = bit;
      else if (i < 8) modules[i + 1][8] = bit;
      else modules[SIZE - 15 + i][8] = bit;

      if (i < 8) modules[8][SIZE - i - 1] = bit;
      else if (i < 9) modules[8][15 - i] = bit;
      else modules[8][15 - i - 1] = bit;
    }
    modules[SIZE - 8][8] = true;

    const words = codewords(text);
    const bits = [];
    words.forEach((word) => appendBits(bits, word, 8));
    let bitIndex = 0;
    let upward = true;
    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let step = 0; step < SIZE; step++) {
        const row = upward ? SIZE - 1 - step : step;
        for (let offset = 0; offset < 2; offset++) {
          const cc = col - offset;
          if (modules[row][cc] !== null) continue;
          const raw = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
          const masked = ((row + cc) % 2 === 0) ? !raw : raw; // mask pattern 0
          modules[row][cc] = masked;
        }
      }
      upward = !upward;
    }
    return modules;
  }

  function svg(text, options = {}) {
    const modules = matrix(String(text || ""));
    const quiet = 4;
    const view = SIZE + quiet * 2;
    const rects = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (modules[r][c]) rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`);
    const label = String(options.label || "Pamet authenticator setup QR code").replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
    return `<svg class="security-qr-svg" role="img" aria-label="${label}" viewBox="0 0 ${view} ${view}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${rects.join("")}</g></svg>`;
  }

  global.PametQr = { svg };
})(window);
