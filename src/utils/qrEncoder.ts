/**
 * Pure TypeScript ISO/IEC 18004 compliant QR Code Generator (Versions 1-6, Byte Mode)
 * Zero external dependencies. Generates boolean 2D matrices for SVG or Canvas rendering.
 */

// GF(256) tables with primitive polynomial 0x11D
const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);

(function initGF() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = val;
    EXP[i + 255] = val;
    LOG[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
  LOG[0] = 0;
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP[LOG[x] + LOG[y]];
}

// Polynomial multiplication in GF(256)
function polyMul(p: number[], q: number[]): number[] {
  const res = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      res[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return res;
}

// Generate Reed-Solomon generator polynomial for `n` EC codewords
function rsGeneratorPoly(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    poly = polyMul(poly, [1, EXP[i]]);
  }
  return poly;
}

// Compute Reed-Solomon error correction codewords
function rsComputeEC(data: number[], numEC: number): number[] {
  const gen = rsGeneratorPoly(numEC);
  const msg = [...data, ...new Array(numEC).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// Version metadata table: [version, totalDataBytes (level M), ecBytes, alignmentPatternCoords]
interface VersionInfo {
  version: number;
  dataCapacity: number; // Level M data bytes
  ecCodewords: number;
  alignCoords: number[];
}

const VERSION_TABLE: VersionInfo[] = [
  { version: 1, dataCapacity: 16, ecCodewords: 10, alignCoords: [] },
  { version: 2, dataCapacity: 28, ecCodewords: 16, alignCoords: [6, 18] },
  { version: 3, dataCapacity: 44, ecCodewords: 26, alignCoords: [6, 22] },
  { version: 4, dataCapacity: 64, ecCodewords: 36, alignCoords: [6, 26] },
  { version: 5, dataCapacity: 86, ecCodewords: 48, alignCoords: [6, 30] },
  { version: 6, dataCapacity: 108, ecCodewords: 64, alignCoords: [6, 34] },
];

export interface QRCodeResult {
  size: number;
  modules: boolean[][];
  version: number;
}

export function generateQRCode(text: string): QRCodeResult {
  const textBytes = new TextEncoder().encode(text);
  
  // Find smallest version that fits
  let targetVer = VERSION_TABLE[0];
  let found = false;
  for (const v of VERSION_TABLE) {
    if (textBytes.length + 3 <= v.dataCapacity) {
      targetVer = v;
      found = true;
      break;
    }
  }
  if (!found) {
    // The bundled encoder tops out at Version 6 (Level M, 108 data bytes).
    // The old fall-through "capped at V6" anyway: the bitstream then held
    // more codewords than the symbol can carry, the character-count field
    // was silently clamped, the terminator went negative, and the zigzag
    // ran out of bits - producing a plausible-looking QR that scans to
    // garbage or fails error correction, with no error surfaced anywhere.
    const maxPayload = VERSION_TABLE[VERSION_TABLE.length - 1].dataCapacity - 3;
    throw new Error(
      `Payload too long: ${textBytes.length} bytes, but versions 1-6 (Level M) hold at most ${maxPayload} bytes. Shorten the content.`
    );
  }

  const ver = targetVer.version;
  const size = ver * 4 + 17;

  // Build bitstream: Mode (0100 for Byte mode) -> Char Count (8 bits for V1-9) -> Data -> Terminator -> Padding
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte Mode
  pushBits(Math.min(textBytes.length, 255), 8); // Character count

  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminator (up to 4 zero bits)
  const maxDataBits = targetVer.dataCapacity * 8;
  const termLen = Math.min(4, maxDataBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to data bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i + j];
    }
    dataBytes.push(b);
  }

  // Pad with alternating 0xEC, 0x11
  let padToggle = true;
  while (dataBytes.length < targetVer.dataCapacity) {
    dataBytes.push(padToggle ? 0xec : 0x11);
    padToggle = !padToggle;
  }

  // Compute Error Correction
  const ecBytes = rsComputeEC(dataBytes, targetVer.ecCodewords);
  const allCodewords = [...dataBytes, ...ecBytes];

  // Convert all codewords to bits
  const finalBits: number[] = [];
  for (const b of allCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((b >>> i) & 1);
    }
  }

  // Initialize Matrix & Reserved Table
  const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isReserved: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean, reserved = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (reserved) isReserved[r][c] = true;
    }
  };

  // 1. Finder patterns (7x7) + Separators
  const placeFinder = (startR: number, startC: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = startR + r;
        const nc = startC + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isBlack =
              r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
            setModule(nr, nc, isBlack);
          } else {
            setModule(nr, nc, false); // Separator
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 2. Alignment patterns for V2+
  if (targetVer.alignCoords.length > 0) {
    const coords = targetVer.alignCoords;
    for (const r of coords) {
      for (const c of coords) {
        if (isReserved[r][c]) continue; // Skip finder overlaps
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack =
              Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    setModule(6, i, val);
    setModule(i, 6, val);
  }

  // 4. Dark module
  setModule(size - 8, 8, true);

  // 5. Reserve format info areas
  for (let i = 0; i < 9; i++) {
    isReserved[8][i] = true;
    isReserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isReserved[8][size - 1 - i] = true;
    isReserved[size - 1 - i][8] = true;
  }

  // 6. Place data bits using standard zigzag layout
  let bitIdx = 0;
  let upwards = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing column

    const rowIndices = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rowIndices) {
      for (let cOffset = 0; cOffset < 2; cOffset++) {
        const c = rightCol - cOffset;
        if (!isReserved[r][c]) {
          const bitVal = bitIdx < finalBits.length ? finalBits[bitIdx++] === 1 : false;
          // Apply standard Mask 0: (row + col) % 2 == 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = mask ? !bitVal : bitVal;
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Format Information (Level M = 00, Mask 0 = 000 -> 00000 -> BCH code: 101010000010010 ^ 101010000010010 = 0)
  // Pre-calculated 15-bit format string for Level M + Mask 0 with 0x5412 XOR: 0b101010000010010
  const formatInfo = 0b101010000010010;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatInfo >>> (14 - i)) & 1) === 1;
    // Top-left format placement
    if (i < 6) setModule(8, i, bit);
    else if (i === 6) setModule(8, 7, bit);
    else if (i === 7) setModule(8, 8, bit);
    else if (i === 8) setModule(7, 8, bit);
    else setModule(14 - i, 8, bit);

    // Split format placement. Bits 0-6 run down column 8 and bits 7-14 run
    // across row 8; bit 7 belongs at (8, size-8). The old split at i === 8
    // wrote bit 7 to (size-8, 8) - exactly the spec-mandated dark module -
    // and erased it with a 0 on every code this app ever generated.
    if (i < 7) setModule(size - 1 - i, 8, bit);
    else setModule(8, size - 15 + i, bit);
  }

  return { size, modules: matrix, version: ver };
}
