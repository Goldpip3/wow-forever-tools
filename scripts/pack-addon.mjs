#!/usr/bin/env node
/**
 * Packs the addon into a zip the gear page can hand people, and writes a small
 * TypeScript file so the page knows its version and size without fetching
 * anything.
 *
 * The zip is written with a fixed timestamp on every entry, so running this
 * twice over unchanged sources produces the same bytes. That keeps a committed
 * binary from churning in the history every time anyone builds.
 *
 * Deliberately has no dependencies: a zip is a handful of headers around
 * deflated bytes, and zlib is in Node already.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ADDON_DIR = resolve(ROOT, 'addon');
const ADDON_NAME = 'WoWForeverSync';
const OUT_DIR = resolve(ROOT, 'public/downloads');
const OUT_ZIP = resolve(OUT_DIR, `${ADDON_NAME}.zip`);
const OUT_TS = resolve(ROOT, 'src/dps/addon-info.ts');

/* --------------------------------------------------------------------- zip */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/** The first of January 2026, in the packed form a zip header wants. */
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

function localHeader(entry) {
  const name = Buffer.from(entry.name, 'utf8');
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4); // version needed
  head.writeUInt16LE(0, 6); // flags
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(entry.crc, 14);
  head.writeUInt32LE(entry.deflated.length, 18);
  head.writeUInt32LE(entry.raw.length, 22);
  head.writeUInt16LE(name.length, 26);
  head.writeUInt16LE(0, 28); // extra
  return Buffer.concat([head, name]);
}

function centralHeader(entry) {
  const name = Buffer.from(entry.name, 'utf8');
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4); // version made by
  head.writeUInt16LE(20, 6); // version needed
  head.writeUInt16LE(0, 8); // flags
  head.writeUInt16LE(8, 10); // deflate
  head.writeUInt16LE(DOS_TIME, 12);
  head.writeUInt16LE(DOS_DATE, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.deflated.length, 20);
  head.writeUInt32LE(entry.raw.length, 24);
  head.writeUInt16LE(name.length, 28);
  head.writeUInt16LE(0, 30); // extra
  head.writeUInt16LE(0, 32); // comment
  head.writeUInt16LE(0, 34); // disk
  head.writeUInt16LE(0, 36); // internal attributes
  head.writeUInt32LE(0, 38); // external attributes
  head.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([head, name]);
}

function buildZip(files) {
  const parts = [];
  const entries = [];
  let offset = 0;

  for (const file of files) {
    const entry = {
      name: file.name,
      raw: file.data,
      deflated: deflateRawSync(file.data, { level: 9 }),
      crc: crc32(file.data),
      offset,
    };
    const head = localHeader(entry);
    parts.push(head, entry.deflated);
    offset += head.length + entry.deflated.length;
    entries.push(entry);
  }

  const central = entries.map(centralHeader);
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment

  return Buffer.concat([...parts, ...central, end]);
}

/* -------------------------------------------------------------------- pack */

const dir = resolve(ADDON_DIR, ADDON_NAME);
const names = (await readdir(dir)).sort();

const files = [];
for (const name of names) {
  const data = await readFile(resolve(dir, name));
  // The zip has to carry the addon folder itself, or the game sees loose files.
  files.push({ name: `${ADDON_NAME}/${name}`, data });
}

const zip = buildZip(files);
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_ZIP, zip);

/* ------------------------------------------------------ what the page shows */

const toc = await readFile(resolve(dir, `${ADDON_NAME}.toc`), 'utf8');
const version = /^##\s*Version:\s*(.+)$/m.exec(toc)?.[1]?.trim() ?? '0.0.0';
const interfaceVersion = /^##\s*Interface:\s*(.+)$/m.exec(toc)?.[1]?.trim() ?? '';

const banner = `/**
 * Written by scripts/pack-addon.mjs. Do not edit.
 *
 * Lets the page name the addon's version and size without fetching anything,
 * and keeps the download link and the packed zip from drifting apart.
 */

export const ADDON_INFO = {
  name: '${ADDON_NAME}',
  version: '${version}',
  /** The client this build declares itself compatible with. */
  interfaceVersion: '${interfaceVersion}',
  /** Relative to the site root, which is where public/ ends up. */
  file: 'downloads/${ADDON_NAME}.zip',
  bytes: ${zip.length},
  files: ${files.length},
} as const;
`;

await writeFile(OUT_TS, banner);

console.log(
  `Packed ${files.length} files into ${ADDON_NAME}.zip (${(zip.length / 1024).toFixed(1)} kB), version ${version}`,
);
