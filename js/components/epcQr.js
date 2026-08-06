/* Lokaler QR-Encoder: feste QR-Version 10, Fehlerkorrektur M, Byte-Modus. */
window.EpcQr = (() => {
  const VERSION = 10;
  const SIZE = 21 + (VERSION - 1) * 4;
  const DATA_CODEWORDS = 216;
  const BLOCKS = [
    { total: 69, data: 43 }, { total: 69, data: 43 },
    { total: 69, data: 43 }, { total: 69, data: 43 },
    { total: 70, data: 44 },
  ];
  const ALIGNMENT = [6, 28, 50];
  const EXP = new Array(512);
  const LOG = new Array(256);

  (() => {
    let value = 1;
    for (let i = 0; i < 255; i += 1) {
      EXP[i] = value;
      LOG[value] = i;
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
  })();

  class Bits {
    constructor() { this.values = []; }
    put(value, length) {
      for (let i = length - 1; i >= 0; i -= 1) this.values.push((value >>> i) & 1);
    }
    get length() { return this.values.length; }
  }

  function multiplyPolynomial(a, b) {
    const result = new Array(a.length + b.length - 1).fill(0);
    a.forEach((left, i) => b.forEach((right, j) => {
      if (left && right) result[i + j] ^= EXP[LOG[left] + LOG[right]];
    }));
    return result;
  }

  function errorCorrection(data, count) {
    let generator = [1];
    for (let i = 0; i < count; i += 1) {
      generator = multiplyPolynomial(generator, [1, EXP[i]]);
    }
    const message = data.concat(new Array(count).fill(0));
    for (let i = 0; i < data.length; i += 1) {
      const factor = message[i];
      if (!factor) continue;
      const ratio = LOG[factor];
      for (let j = 0; j < generator.length; j += 1) {
        if (generator[j]) message[i + j] ^= EXP[LOG[generator[j]] + ratio];
      }
    }
    return message.slice(data.length);
  }

  function codewords(text) {
    const bytes = [...new TextEncoder().encode(text)];
    const bits = new Bits();
    bits.put(0b0100, 4);
    bits.put(bytes.length, 16);
    bytes.forEach((byte) => bits.put(byte, 8));
    const capacity = DATA_CODEWORDS * 8;
    if (bits.length > capacity) throw new Error("Die Zahlungsdaten sind für den QR-Code zu lang.");
    bits.put(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.put(0, 1);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j += 1) value = (value << 1) | bits.values[i + j];
      data.push(value);
    }
    let pad = true;
    while (data.length < DATA_CODEWORDS) {
      data.push(pad ? 0xec : 0x11);
      pad = !pad;
    }

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    BLOCKS.forEach((block) => {
      const part = data.slice(offset, offset + block.data);
      offset += block.data;
      dataBlocks.push(part);
      ecBlocks.push(errorCorrection(part, block.total - block.data));
    });
    const output = [];
    const maxData = Math.max(...dataBlocks.map((block) => block.length));
    const maxEc = Math.max(...ecBlocks.map((block) => block.length));
    for (let i = 0; i < maxData; i += 1) dataBlocks.forEach((block) => {
      if (i < block.length) output.push(block[i]);
    });
    for (let i = 0; i < maxEc; i += 1) ecBlocks.forEach((block) => {
      if (i < block.length) output.push(block[i]);
    });
    return output;
  }

  function bch(value, polynomial) {
    let shifted = value;
    const degree = (number) => 32 - Math.clz32(number);
    shifted <<= degree(polynomial) - 1;
    while (degree(shifted) >= degree(polynomial)) {
      shifted ^= polynomial << (degree(shifted) - degree(polynomial));
    }
    return ((value << (degree(polynomial) - 1)) | shifted) >>> 0;
  }

  function mask(maskPattern, row, col) {
    switch (maskPattern) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return (row * col) % 2 + (row * col) % 3 === 0;
      case 6: return ((row * col) % 2 + (row * col) % 3) % 2 === 0;
      default: return ((row * col) % 3 + (row + col) % 2) % 2 === 0;
    }
  }

  function finder(modules, row, col) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) {
      const y = row + r, x = col + c;
      if (y < 0 || y >= SIZE || x < 0 || x >= SIZE) continue;
      modules[y][x] = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
        (r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4));
    }
  }

  function baseMatrix(maskPattern) {
    const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    finder(modules, 0, 0);
    finder(modules, SIZE - 7, 0);
    finder(modules, 0, SIZE - 7);
    ALIGNMENT.forEach((row) => ALIGNMENT.forEach((col) => {
      if (modules[row][col] !== null) return;
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) {
        modules[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      }
    }));
    for (let i = 8; i < SIZE - 8; i += 1) {
      if (modules[i][6] === null) modules[i][6] = i % 2 === 0;
      if (modules[6][i] === null) modules[6][i] = i % 2 === 0;
    }

    const typeBits = bch(maskPattern, 0x537) ^ 0x5412; // EC-Level M = 00
    for (let i = 0; i < 15; i += 1) {
      const bit = ((typeBits >> i) & 1) === 1;
      if (i < 6) modules[i][8] = bit;
      else if (i < 8) modules[i + 1][8] = bit;
      else modules[SIZE - 15 + i][8] = bit;
      if (i < 8) modules[8][SIZE - i - 1] = bit;
      else if (i === 8) modules[8][7] = bit;
      else modules[8][15 - i - 1] = bit;
    }
    modules[SIZE - 8][8] = true;

    const versionBits = bch(VERSION, 0x1f25);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((versionBits >> i) & 1) === 1;
      modules[Math.floor(i / 3)][i % 3 + SIZE - 11] = bit;
      modules[i % 3 + SIZE - 11][Math.floor(i / 3)] = bit;
    }
    return modules;
  }

  function fill(modules, words, maskPattern) {
    let bitIndex = 0;
    let direction = -1;
    for (let col = SIZE - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1;
      for (let step = 0; step < SIZE; step += 1) {
        const row = direction < 0 ? SIZE - 1 - step : step;
        for (let offset = 0; offset < 2; offset += 1) {
          const x = col - offset;
          if (modules[row][x] !== null) continue;
          const byte = words[Math.floor(bitIndex / 8)] || 0;
          let dark = ((byte >>> (7 - bitIndex % 8)) & 1) === 1;
          if (mask(maskPattern, row, x)) dark = !dark;
          modules[row][x] = dark;
          bitIndex += 1;
        }
      }
      direction = -direction;
    }
  }

  function penalty(modules) {
    let score = 0;
    for (let row = 0; row < SIZE; row += 1) for (let col = 0; col < SIZE; col += 1) {
      let same = 0;
      for (let r = -1; r <= 1; r += 1) for (let c = -1; c <= 1; c += 1) {
        if ((!r && !c) || row + r < 0 || row + r >= SIZE || col + c < 0 || col + c >= SIZE) continue;
        if (modules[row][col] === modules[row + r][col + c]) same += 1;
      }
      if (same > 5) score += 3 + same - 5;
    }
    for (let row = 0; row < SIZE - 1; row += 1) for (let col = 0; col < SIZE - 1; col += 1) {
      const count = Number(modules[row][col]) + Number(modules[row + 1][col]) +
        Number(modules[row][col + 1]) + Number(modules[row + 1][col + 1]);
      if (count === 0 || count === 4) score += 3;
    }
    const pattern = "1011101";
    for (let i = 0; i < SIZE; i += 1) {
      const row = modules[i].map(Number).join("");
      const col = modules.map((line) => Number(line[i])).join("");
      score += (row.split(pattern).length - 1 + col.split(pattern).length - 1) * 40;
    }
    const dark = modules.flat().filter(Boolean).length;
    score += Math.floor(Math.abs(100 * dark / (SIZE * SIZE) - 50) / 5) * 10;
    return score;
  }

  function matrix(text) {
    const words = codewords(text);
    let best = null;
    for (let maskPattern = 0; maskPattern < 8; maskPattern += 1) {
      const candidate = baseMatrix(maskPattern);
      fill(candidate, words, maskPattern);
      const score = penalty(candidate);
      if (!best || score < best.score) best = { modules: candidate, score };
    }
    return best.modules;
  }

  function toSvg(text, options = {}) {
    const quiet = 4;
    const modules = matrix(text);
    const dimension = SIZE + quiet * 2;
    const cells = [];
    modules.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) cells.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
    }));
    const title = String(options.title || "ELBA Zahlungs-QR-Code")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="${title}" shape-rendering="crispEdges"><title>${title}</title><rect width="100%" height="100%" fill="#fff"/><path d="${cells.join("")}" fill="#000"/></svg>`;
  }

  return { toSvg };
})();
