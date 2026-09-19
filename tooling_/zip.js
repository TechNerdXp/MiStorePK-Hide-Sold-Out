/**
 * Minimal, spec-correct ZIP writer.
 *
 * Both Windows zip tools on this machine (PowerShell's Compress-Archive and .NET's
 * ZipFile.CreateFromDirectory) write entry paths with backslashes. APPNOTE 4.4.17.1
 * requires forward slashes, and a Chrome Web Store upload built that way arrives with
 * its directory structure mangled. Seventy lines of zlib is cheaper than debugging that
 * in the review queue.
 *
 * Entries are deflated, sorted, and stamped with a fixed timestamp, so the same source
 * always produces a byte-identical archive.
 */

const { deflateRawSync } = require('zlib');
const { readFileSync, readdirSync, statSync, writeFileSync } = require('fs');
const { join, relative } = require('path');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).split(/[\\/]/).join('/'));
  }
  return out;
}

/** Fixed DOS timestamp (2026-01-01 00:00:00) keeps builds reproducible. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/**
 * @param {string} sourceDir directory whose *contents* become the archive root
 * @param {string} outFile
 * @returns {string[]} the entry names written
 */
function zipDirectory(sourceDir, outFile) {
  const names = walk(sourceDir);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of names) {
    const raw = readFileSync(join(sourceDir, name));
    const deflated = deflateRawSync(raw, { level: 9 });
    // Never let "compression" grow a file; fall back to stored.
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0o644 << 16, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outFile, Buffer.concat([...locals, centralBuf, end]));
  return names;
}

// crc32 is exported because PNG chunks use the same CRC-32 polynomial, and
// tooling_/png.js has no reason to carry a second copy of the table.
module.exports = { zipDirectory, crc32 };
