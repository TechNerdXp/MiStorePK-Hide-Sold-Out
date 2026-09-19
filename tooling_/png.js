/**
 * PNG colour-type guard for the Chrome Web Store graphics.
 *
 * The store spec for promo tiles and screenshots is "JPEG or 24-bit PNG (no
 * alpha)". Chrome's --screenshot writes 24-bit truecolour (colour type 2) when
 * the page it captured is fully opaque and 32-bit RGBA (colour type 6) when any
 * pixel is not — so compliance depends on a detail of the page, not on anything
 * anyone declared. A single translucent element touching the edge of a tile is
 * enough to flip it, and the upload is rejected at the dashboard with a message
 * that does not mention alpha.
 *
 * `ensureNoAlpha` makes it a property of the pipeline instead: it reads the
 * header, leaves an already-24-bit file untouched, and otherwise composites the
 * image over an opaque background and rewrites it as colour type 2.
 *
 * Only what Chrome emits is handled: 8 bits per channel, non-interlaced,
 * colour type 2 or 6. Anything else throws rather than being guessed at.
 */

const { readFileSync, writeFileSync } = require('fs');
const { inflateSync, deflateSync } = require('zlib');
const { crc32 } = require('./zip');

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const COLOUR_TYPES = {
  0: 'greyscale',
  2: 'truecolour (24-bit, no alpha)',
  3: 'indexed',
  4: 'greyscale + alpha',
  6: 'truecolour + alpha (32-bit)'
};

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reads IHDR without decoding the image. */
function readHeader(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    depth: buf[24],
    colourType: buf[25],
    interlace: buf[28],
    describe() {
      return `${this.width}x${this.height} ${COLOUR_TYPES[this.colourType] || 'type ' + this.colourType}`;
    }
  };
}

function chunks(buf) {
  const out = [];
  let pos = 8;
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    out.push({ type, data: buf.subarray(pos + 8, pos + 8 + length) });
    pos += 12 + length;
  }
  return out;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Undo the per-scanline filters, returning raw samples. */
function unfilter(data, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const type = data[pos];
    pos += 1;
    const line = data.subarray(pos, pos + stride);
    pos += stride;

    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let value;
      switch (type) {
        case 0: value = line[x]; break;
        case 1: value = line[x] + a; break;
        case 2: value = line[x] + b; break;
        case 3: value = line[x] + ((a + b) >> 1); break;
        case 4: value = line[x] + paeth(a, b, c); break;
        default: throw new Error(`unknown scanline filter ${type}`);
      }
      cur[x] = value & 0xff;
    }
  }
  return out;
}

/**
 * Re-filter for encoding. Each scanline gets whichever of the five filters
 * gives the smallest sum of absolute differences, which is the heuristic the
 * PNG spec itself suggests; filtering everything as None would roughly double
 * the file size of these tiles.
 */
function refilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  const candidate = Buffer.alloc(stride);
  const best = Buffer.alloc(stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const cur = raw.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? raw.subarray((y - 1) * stride, y * stride) : null;

    let bestType = 0;
    let bestScore = Infinity;

    for (let type = 0; type <= 4; type += 1) {
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const a = x >= bpp ? cur[x - bpp] : 0;
        const b = prev ? prev[x] : 0;
        const c = prev && x >= bpp ? prev[x - bpp] : 0;
        let value;
        switch (type) {
          case 0: value = cur[x]; break;
          case 1: value = cur[x] - a; break;
          case 2: value = cur[x] - b; break;
          case 3: value = cur[x] - ((a + b) >> 1); break;
          default: value = cur[x] - paeth(a, b, c); break;
        }
        value &= 0xff;
        candidate[x] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        candidate.copy(best);
      }
    }

    out[pos] = bestType;
    pos += 1;
    best.copy(out, pos);
    pos += stride;
  }
  return out;
}

/**
 * Guarantees `file` is a 24-bit PNG with no alpha channel, rewriting it if it
 * is not.
 *
 * @param {string} file
 * @param {[number, number, number]} background composited under any translucency
 * @returns {{ width, height, converted: boolean, translucentPixels: number, describe: string }}
 */
function ensureNoAlpha(file, background = [255, 255, 255]) {
  const buf = readFileSync(file);
  const header = readHeader(buf);

  if (header.depth !== 8 || header.interlace !== 0) {
    throw new Error(`${file}: expected 8-bit non-interlaced PNG, got depth ${header.depth}, interlace ${header.interlace}`);
  }

  if (header.colourType === 2) {
    return { ...header, converted: false, translucentPixels: 0, describe: header.describe() };
  }

  if (header.colourType !== 6) {
    throw new Error(`${file}: cannot flatten colour type ${header.colourType} (${COLOUR_TYPES[header.colourType]})`);
  }

  const { width, height } = header;
  const parts = chunks(buf);
  const idat = Buffer.concat(parts.filter(c => c.type === 'IDAT').map(c => c.data));
  const rgba = unfilter(inflateSync(idat), width, height, 4);

  const rgb = Buffer.alloc(width * height * 3);
  let translucentPixels = 0;
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    const alpha = rgba[i + 3];
    if (alpha === 255) {
      rgb[o] = rgba[i];
      rgb[o + 1] = rgba[i + 1];
      rgb[o + 2] = rgba[i + 2];
    } else {
      translucentPixels += 1;
      const f = alpha / 255;
      rgb[o] = Math.round(rgba[i] * f + background[0] * (1 - f));
      rgb[o + 1] = Math.round(rgba[i + 1] * f + background[1] * (1 - f));
      rgb[o + 2] = Math.round(rgba[i + 2] * f + background[2] * (1 - f));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  writeFileSync(file, Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(refilter(rgb, width, height, 3), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));

  const after = readHeader(readFileSync(file));
  if (after.colourType !== 2) throw new Error(`${file}: flatten did not produce colour type 2`);

  return { ...after, converted: true, translucentPixels, describe: after.describe() };
}

module.exports = { ensureNoAlpha, readHeader, COLOUR_TYPES };
